# Etapa 10 — Ensaio geral (pronto para demonstração) · Plano de execução

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA — use `subagent-driven-development`
> (recomendado) ou `executing-plans` para a **Parte A** (código), tarefa a
> tarefa. A **Parte B** é um checklist coordenado com o Lucas Ferreira (ensaio
> no site real, casa de demonstração na nuvem, checagem ao vivo): **não** é
> para subagente autônomo — o assistente conduz com o Lucas, passo a passo.
> Passos de código usam caixinhas (`- [ ]`).

**Goal:** Deixar o repply food. pronto para demonstração — uma casa de
demonstração fixa na nuvem, o roteiro de aceite (SPEC §10) rodando liso no
site real, telas redondas no celular e no computador, e um kit escrito.

**Architecture:** Uma única mudança de código estrutural — uma coluna
`demonstracao` em `restaurantes` que o vigia respeita (não dispara alarme para
a casa de demo, mas mantém o selo) e que o admin mostra. O resto é preparo
(dados + kit) e ensaio (rodar o roteiro e arredondar o que aparecer).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/Postgres
(migrations aditivas, RLS, pg_cron), Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-10-22-etapa-10-ensaio-geral-design.md`

## Global Constraints

- **Migrations só se acrescentam** (nunca editar uma existente); RLS no mesmo arquivo quando cria tabela; proibido `FORCE ROW LEVEL SECURITY`.
- **Dado real nunca** entra em teste/plano/migration — só o gerador de dados fictícios.
- **Nada vai à nuvem** (migration, dados de demonstração, envio real do gerador, deploy) **sem autorização do Lucas Ferreira na hora.** O assistente não digita senha nem entra no painel de produção.
- **Celular (390 px) e computador** em toda tela; tema claro e escuro; estado vazio (CLAUDE.md §13, §9).
- **Taxa de serviço sempre separada** do faturamento (D-14). **Tomate só no símbolo** (D-42).
- Verificação antes de "feito": `npx tsc --noEmit`, `npm run check`, `npm run test`, `npm run build`.
- Commits em PT-BR no imperativo, direto no `main`, sem `git add -A`. `git push` só com o ok do Lucas, um por um.
- A marca `demonstracao` **silencia o e-mail do alarme** para a casa de demo, mas **o selo (em dia/atrasado/parado) continua mudando** normalmente.

---

# PARTE A — Código (subagent-driven)

## Task 1: Marca `demonstracao` no banco e o vigia a respeita

**Files:**
- Create: `supabase/migrations/20261022120000_casa_de_demonstracao.sql`
- Modify (regenerar): `types/database.types.ts` (via `npm run types`)
- Test: `tests/rotinas/alertas-sinal.test.ts` (acrescentar um caso)

**Interfaces:**
- Produces: coluna `restaurantes.demonstracao boolean not null default false`; a view `restaurantes_no_admin` passa a expor `demonstracao`; `atualizar_estados()` não chama `registrar_parada_sinal` para casas com `demonstracao = true`.

- [ ] **Step 1: Escrever o teste que falha** — em `tests/rotinas/alertas-sinal.test.ts`, usando o mesmo molde dos testes existentes (`conectarBanco`, `criarFixture`, o helper local `deixarParado`, e `alertasDaCasa`):

```ts
it("não gera parada para a casa de demonstração, mas gera para uma casa normal", async () => {
  await banco.query(
    "update public.restaurantes set demonstracao = true where id = $1",
    [fixture.restauranteA]
  );

  await deixarParado(banco, fixture.restauranteA);
  await deixarParado(banco, fixture.restauranteB);

  // o selo das duas vira "parado"
  const estados = await banco.query<{ restaurante_id: string; estado: string }>(
    "select restaurante_id, estado from public.sinal_de_vida where restaurante_id = any($1)",
    [[fixture.restauranteA, fixture.restauranteB]]
  );
  for (const linha of estados.rows) expect(linha.estado).toBe("parado");

  // mas só a casa normal gera alerta de parada
  expect((await alertasDaCasa(banco, fixture.restauranteA)).length).toBe(0);
  expect((await alertasDaCasa(banco, fixture.restauranteB)).length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/rotinas/alertas-sinal.test.ts`. Esperado: FALHA (a coluna `demonstracao` ainda não existe → erro de SQL na query do `update`). Isso exige o banco local de pé (`npx supabase start`).

- [ ] **Step 3: Escrever a migration** — criar `supabase/migrations/20261022120000_casa_de_demonstracao.sql` com exatamente:

```sql
-- Casa de demonstração: o vigia calcula o selo normalmente, mas não dispara o
-- alarme por e-mail para ela (para não encher a equipe entre demonstrações).
begin;

alter table public.restaurantes
  add column demonstracao boolean not null default false;

comment on column public.restaurantes.demonstracao is
  'Casa de demonstração: o vigia calcula o selo normalmente, mas não dispara o alarme por e-mail para ela.';

-- A view da lista do admin passa a expor a marca (coluna acrescentada ao fim,
-- para o create or replace preservar os grants, sem drop).
create or replace view public.restaurantes_no_admin
with (security_invoker = true) as
select r.id,
       r.slug,
       r.nome,
       r.situacao,
       r.fuso,
       s.estado,
       s.ultimo_envio_ok_em,
       ultimo.versao_scc,
       r.demonstracao
  from public.restaurantes r
  left join public.sinal_de_vida s on s.restaurante_id = r.id
  left join lateral (
    select e.versao_scc
      from public.envios e
     where e.restaurante_id = r.id
       and e.versao_scc is not null
     order by e.recebido_em desc
     limit 1
  ) as ultimo on true;

-- O vigia ignora a casa de demonstração só na hora de registrar a parada; o
-- cálculo e a atualização do selo continuam iguais para todas as casas.
create or replace function public.atualizar_estados()
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rec    record;
  v_estado text;
  v_delta  interval;
  v_desde  timestamptz;
begin
  for v_rec in
    select s.restaurante_id, s.primeiro_envio_em, s.ultimo_envio_ok_em,
           s.estado as estado_atual, r.fuso, r.horario_funcionamento,
           r.demonstracao
      from public.sinal_de_vida s
      join public.restaurantes r on r.id = s.restaurante_id
  loop
    begin
      if v_rec.primeiro_envio_em is null then
        v_estado := 'aguardando';
      else
        v_desde := public.aberto_desde(v_rec.horario_funcionamento, v_rec.fuso, now());
        if v_desde is null then
          v_estado := 'fechado';
        else
          v_delta := now() - greatest(
            coalesce(v_rec.ultimo_envio_ok_em, v_rec.primeiro_envio_em),
            v_desde
          );
          if v_delta <= interval '15 minutes' then
            v_estado := 'em_dia';
          elsif v_delta <= interval '45 minutes' then
            v_estado := 'atrasado';
          else
            v_estado := 'parado';
          end if;
        end if;
      end if;

      if v_estado <> v_rec.estado_atual then
        update public.sinal_de_vida
           set estado = v_estado, estado_desde = now()
         where restaurante_id = v_rec.restaurante_id;
      end if;

      if v_estado = 'parado' and not v_rec.demonstracao then
        perform public.registrar_parada_sinal(v_rec.restaurante_id, now());
      end if;
    exception when others then
      raise warning 'rf-vigia: restaurante % ignorado (%)', v_rec.restaurante_id, sqlstate;
    end;
  end loop;
end;
$$;

commit;
```

- [ ] **Step 4: Aplicar no banco local e regenerar os tipos** — `npx supabase db reset` (aplica todas as migrations do zero, provando que a nova convive) e depois `npm run types`. Esperado: `db reset` termina sem erro listando a migration `20261022120000`; `npm run types` diz "Tipos válidos" e inclui `demonstracao` em `restaurantes` e na view.

- [ ] **Step 5: Rodar o teste e ver passar** — `npx vitest run tests/rotinas/alertas-sinal.test.ts`. Esperado: PASSA (casa de demo não gera parada; casa normal gera).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261022120000_casa_de_demonstracao.sql types/database.types.ts tests/rotinas/alertas-sinal.test.ts
git commit -m "Adiciona a marca de casa de demonstração (vigia não alarma)"
```

## Task 2: O admin mostra a marca "demonstração"

**Files:**
- Modify: `lib/admin/lista.ts` (tipo `LinhaDaLista`)
- Modify: `lib/admin/dados.ts` (`listarRestaurantes`/`linhaDaVisao`, `detalheDoRestaurante`)
- Modify: `lib/admin/tipos.ts` (tipo do restaurante do detalhe)
- Modify: `components/admin/lista-restaurantes.tsx` (pílula na lista)
- Modify: `app/admin/restaurantes/[id]/page.tsx` (pílula no cabeçalho do detalhe)
- Test: `tests/componentes/admin/lista-restaurantes.test.tsx` (novo)

**Interfaces:**
- Consumes: a coluna `demonstracao` e a view do Task 1.
- Produces: `LinhaDaLista.demonstracao: boolean` e o campo `demonstracao: boolean` no restaurante do detalhe; uma pílula "demonstração" visível na lista e no detalhe.

- [ ] **Step 1: Escrever o teste que falha** — criar `tests/componentes/admin/lista-restaurantes.test.tsx` no padrão dos testes de componente do projeto (Vitest + `@testing-library/react`, como em `tests/componentes/resultados/`):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListaRestaurantes } from "@/components/admin/lista-restaurantes";

const base = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "casa-demo",
  nome: "Casa de Demonstração",
  situacao: "ativo" as const,
  fuso: "America/Fortaleza",
  estado: "em_dia" as const,
  ultimoEnvioOkEm: null,
  versaoScc: null,
};

describe("ListaRestaurantes", () => {
  it("mostra a pílula 'demonstração' só na casa marcada", () => {
    render(
      <ListaRestaurantes
        linhas={[
          { ...base, demonstracao: true },
          { ...base, id: "00000000-0000-4000-8000-000000000002", slug: "casa-real", nome: "Casa Real", demonstracao: false },
        ]}
      />
    );
    // a pílula aparece uma vez (na casa de demo), não na casa real
    expect(screen.getAllByText(/demonstra/i).length).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/componentes/admin/lista-restaurantes.test.tsx`. Esperado: FALHA (o tipo `LinhaDaLista` ainda não tem `demonstracao`, e não há pílula).

- [ ] **Step 3: Acrescentar `demonstracao` ao tipo da lista** — em `lib/admin/lista.ts`, no tipo `LinhaDaLista`, acrescentar o campo:

```ts
  demonstracao: boolean;
```

- [ ] **Step 4: Ler a coluna na camada de dados** — em `lib/admin/dados.ts`:
  - em `listarRestaurantes`, acrescentar `demonstracao` ao `.select("id, slug, nome, situacao, fuso, estado, ultimo_envio_ok_em, versao_scc, demonstracao")`;
  - em `linhaDaVisao`, mapear `demonstracao: linha.demonstracao`;
  - em `detalheDoRestaurante`, acrescentar `demonstracao` ao `.select(...)` da tabela `restaurantes` e incluir `demonstracao: dados.demonstracao` no objeto `restaurante` do retorno (linhas ~247-258).

- [ ] **Step 5: Acrescentar `demonstracao` ao tipo do detalhe** — em `lib/admin/tipos.ts`, no tipo do restaurante do detalhe (o que lista `id, slug, nome, cnpj, fuso, horaVirada, horario, situacao, pedidoReenvioDesde, intervaloEnvioSegundos`), acrescentar:

```ts
  demonstracao: boolean;
```

- [ ] **Step 6: Pílula na lista** — em `components/admin/lista-restaurantes.tsx`, criar uma etiqueta no mesmo estilo de `EtiquetaSuspenso` (pílula com borda + texto, cor neutra/laranja), exibida quando `linha.demonstracao`, ao lado do `EtiquetaSuspenso`/`SeloDados` tanto no bloco do celular quanto no da tabela:

```tsx
function EtiquetaDemonstracao() {
  return (
    <span className="label-mono rounded-full border border-current px-2 py-0.5 text-[0.65rem]">
      demonstração
    </span>
  );
}
```

E, nos dois lugares onde `EtiquetaSuspenso` aparece, acrescentar `{linha.demonstracao ? <EtiquetaDemonstracao /> : null}` logo ao lado. (Seguir o estilo exato de `EtiquetaSuspenso` do arquivo; não inventar tokens de cor novos — usar os mesmos utilitários já presentes.)

- [ ] **Step 7: Pílula no detalhe** — em `app/admin/restaurantes/[id]/page.tsx`, no cabeçalho do `DetalhePane` (onde ficam `<h1>{restaurante.nome}</h1>` e `EtiquetaSuspenso`), acrescentar a mesma pílula quando `restaurante.demonstracao`. Reaproveitar `EtiquetaDemonstracao` exportando-a de `lista-restaurantes.tsx` (como `EtiquetaSuspenso` já é exportada e reutilizada).

- [ ] **Step 8: Rodar o teste e ver passar** — `npx vitest run tests/componentes/admin/lista-restaurantes.test.tsx`. Esperado: PASSA.

- [ ] **Step 9: Verificação e commit**

```bash
npx tsc --noEmit
npx biome check .
git add lib/admin/lista.ts lib/admin/dados.ts lib/admin/tipos.ts components/admin/lista-restaurantes.tsx app/admin/restaurantes/[id]/page.tsx tests/componentes/admin/lista-restaurantes.test.tsx
git commit -m "Mostra a marca de demonstração no admin (lista e detalhe)"
```

## Task 3: Kit de demonstração (roteiro + config do gerador)

**Files:**
- Create: `docs/operacao/demonstracao.md`
- Create: `.env.gerador.demo.example`
- Modify: `.gitignore` (garantir que `.env.gerador.demo.local` — o preenchido — fica ignorado)

**Interfaces:** nenhum código; é documentação + um arquivo de exemplo. Verificação é leitura + o gerador aceitar a config em `--dry-run`.

- [ ] **Step 1: Escrever o arquivo de exemplo do gerador** — criar `.env.gerador.demo.example` (sem token real):

```bash
# Config do RETOQUE da casa de demonstração (etapa 10).
# Copie para .env.gerador.demo.local (ignorado pelo Git) e preencha o token.
# É ENVIO REAL para a nuvem: exige --confirmo-nuvem e a autorização do Lucas.
SCC_URL=https://klwpfltvtaltzcjxfmxf.supabase.co/functions/v1/receber-envio
SCC_FUSO=America/Fortaleza
# SCC_TOKEN=  (o token da casa de demonstração; NUNCA versionar)
```

- [ ] **Step 2: Garantir o ignore** — em `.gitignore`, se ainda não cobrir, acrescentar `.env.gerador.demo.local`.

- [ ] **Step 3: Escrever o kit** — criar `docs/operacao/demonstracao.md`, em linguagem simples (é para um vendedor), cobrindo: o retoque do gerador antes da demo (o comando com `--confirmo-nuvem`, lembrando que é operação autorizada), e o passo a passo dos 9 itens do roteiro (SPEC §10) com o que destacar em cada tela (faturamento sem a taxa, comparação justa, o selo "há X min", a instalação no celular, o selo indo para "parado" no fim). Incluir o aviso de não usar o token/dados da casa de demonstração para testes. Comando do retoque, para o doc:

```bash
# Antes da demo, com .env.gerador.demo.local preenchido:
node --env-file=.env.gerador.demo.local --import tsx scripts/gerador-dados-ficticios.ts --fuso America/Fortaleza --historico-dias 21 --confirmo-nuvem
```

- [ ] **Step 4: Conferir o gerador com a config (dry-run, sem enviar nada)** — `npm run gerador -- --dry-run --historico-dias 21`. Esperado: monta e valida os envelopes sem erro (não envia).

- [ ] **Step 5: Commit**

```bash
git add docs/operacao/demonstracao.md .env.gerador.demo.example .gitignore
git commit -m "Escreve o kit de demonstração (roteiro + config do gerador)"
```

## Fecho da Parte A

- [ ] **Revisão final** da Parte A (`requesting-code-review`, modelo mais capaz), olhando o diff de `main` até aqui.
- [ ] **Publicar na nuvem (autorizado):** com o ok do Lucas — `git push origin main` (sobe o frontend com a pílula) **e** `npx supabase db push --linked` (aplica a migration `20261022120000` na nuvem). Conferir antes com `migration list --linked`. Isto habilita a marca `demonstracao` na produção, pré-requisito da Parte B.

---

# PARTE B — Ensaio e demonstração (checklist coordenado com o Lucas Ferreira)

> **Não é tarefa de subagente.** O assistente conduz; o Lucas faz login, mexe no
> painel de produção, no dashboard do Supabase e autoriza cada passo de nuvem.
> Cada achado de acabamento vira uma tarefa de código (TDD), consertada e
> publicada antes de seguir.

- [ ] **B1 — Criar a casa de demonstração na nuvem.** O Lucas, no admin de produção, cadastra a "Casa de Demonstração" (nome claro, fuso, um horário amplo) e gera o token. Depois, no SQL Editor do Supabase (autorizado): `update public.restaurantes set demonstracao = true where id = '<id da casa>';`. Conferir no admin que a pílula "demonstração" aparece.

- [ ] **B2 — Encher com dados convincentes (retoque).** Com `.env.gerador.demo.local` preenchido com o token da casa e a autorização do Lucas, rodar o gerador para a nuvem (`--confirmo-nuvem`, ~21 dias de histórico). Conferir no admin que o estado vira "em dia" e que "Últimos envios" mostra as contagens. Definir uma **meta do mês** para a casa (via Ajustes, logada como a casa), para Hoje/Resultados mostrarem andamento.

- [ ] **B3 — Ensaiar o roteiro (SPEC §10) no site real.** O assistente conduz; o Lucas faz os passos de login/painel. Rodar os 9 passos: cadastro+token (B1) → em dia (B2) → entrar e trocar senha → guia de instalação (celular) → Hoje → Resultados (4 abas) → PDF → meta → parar o gerador e ver o selo ir para "atrasado" e "parado" (sem e-mail, por ser demo). **Anotar cada tropeço** (trava, confusão, feiura) numa lista.

- [ ] **B4 — Arredondar os acabamentos achados em B3.** Para cada item da lista: `systematic-debugging` se for comportamento estranho, conserto no ponto comum com `test-driven-development`, conferir nas duas larguras, commitar, e publicar (com o ok do Lucas). Itens que não aparecerem no ensaio ficam para a Fase 2.

- [ ] **B5 — Checagem celular + computador.** Passar por cada tela (entrada, Hoje, Resultados/4 abas, Ajustes, Admin/lista/cadastro/detalhe, "ver o painel do cliente") em 390 px e em computador, tema claro e escuro, e no estado vazio. Usar o navegador do app no site real (o Lucas loga). Cada diferença vira item de B4.

- [ ] **B6 — Fechar a etapa.** Confirmar que o roteiro do §10 roda inteiro sem travar; que a verificação obrigatória passa (`tsc`, `check`, `test`, `build`); que o kit está escrito e no ar. Atualizar o roteiro no `README`/`SPEC` (etapa 10 ✅) e registrar a decisão da marca de demonstração em `docs/decisoes.md` (próximo número livre). Publicar com o ok do Lucas.
