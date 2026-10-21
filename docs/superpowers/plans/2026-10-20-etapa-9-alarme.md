# Etapa 9 — Alarme de sinal de vida · Plano de execução

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `subagent-driven-development` (recomendado) ou `executing-plans` para executar tarefa a tarefa. Os passos usam caixas `- [ ]`. **Responda sempre em português do Brasil.**

**Objetivo:** enviar à equipe Repply, pela Resend, um e-mail quando o SCC de uma casa ficar parado e outro quando ela voltar a enviar dados válidos, com fila persistente, confirmação da resposta HTTP real e isolamento completo entre restaurantes.

**Arquitetura:** Postgres registra incidentes e alertas numa caixa de saída interna. O vigia cria a parada; um trigger de `ultimo_envio_ok_em` identifica uma volta real; o cron consulta `net._http_response` antes de marcar entrega e encaminha pendências por pg_net para a Edge Function `enviar-alerta`. A função autentica a chamada por segredo interno, carrega o dado mínimo pelo serviço e chama Resend com chave de idempotência por alerta.

**Tech Stack:** PostgreSQL 17, Supabase (RLS, pg_cron, pg_net, Vault, Edge Functions/Deno), Resend, TypeScript estrito, Vitest, Biome e Supabase CLI.

**Spec:** [`docs/superpowers/specs/2026-10-20-etapa-9-alarme-design.md`](../specs/2026-10-20-etapa-9-alarme-design.md) — leia-o antes de executar este plano.

## Restrições globais

- **Destinatário:** somente `ALERTA_EMAIL_PARA` da equipe Repply. Não criar aviso automático ao dono (D-15).
- **Gatilhos:** `parado` cria o alerta; “voltou” nasce somente de um novo `ultimo_envio_ok_em`, nunca de `fechado`.
- **Entrega:** `net.http_post` só enfileira. Apenas HTTP 2xx com `{"ok":true}` lido de `net._http_response` pode marcar `enviado` ou preencher `sinal_de_vida.alarme_enviado_em`.
- **Segredos:** `RESEND_API_KEY`, `ALERTA_EMAIL_DE`, `ALERTA_EMAIL_PARA`, URL e segredo interno não entram no git, terminal compartilhado, `config.toml`, Next ou Vercel. `verify_jwt = false` exige `x-rf-alerta-secret` igual ao segredo de ambiente/Vault.
- **Privacidade:** usar só nome da casa, instante/fuso, IDs e códigos curtos. Nunca payload SCC, dados de cliente, token, senha, e-mail de login, destinatário ou resposta crua do provedor.
- **Isolamento:** tabelas novas têm `restaurante_id`, RLS no mesmo arquivo e nenhuma política para `anon`/`authenticated`; `FORCE ROW LEVEL SECURITY` é proibido.
- **Banco:** acrescentar migration nova; nunca editar migration existente. Funções privilegiadas ficam fechadas para `anon` e `authenticated`.
- **Concorrência:** índice único e `FOR UPDATE SKIP LOCKED` impedem incidente/alerta/chamada duplicados. Não usar estado em memória ou `setInterval`.
- **Git:** trabalhar somente em `etapa-9-alarme`; após **cada commit**, executar `git push origin etapa-9-alarme`. Nunca force-push, reset, rebase destrutivo ou push para `main`.
- **Nuvem:** não rodar `db push --linked`, `functions deploy`, `secrets set`, `config push`, Vercel, Resend ou e-mail real nesta execução. Isso requer operação autorizada posterior.
- **Verificação final:** tipos, lint, testes e build. Para testes de banco, subir o Supabase local com `rdctl start` e `npm run supabase:start`, sem resetar dados.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261020140000_alarme_sinal.sql` | tabelas internas, RLS, restrições, helpers, trigger, vigia e cron. |
| `tests/rotinas/alertas-sinal.test.ts` | ciclo de parada, confirmação, falha, volta, fechamento, cancelamento e concorrência. |
| `tests/isolamento/todas-as-tabelas.test.ts` | prova que as duas novas tabelas são invisíveis para cliente/admin. |
| `tests/isolamento/funcoes-fechadas.test.ts` | prova que helpers novos não ganham `EXECUTE` exposto. |
| `supabase/functions/_shared/alerta.ts` | tipos puros, conteúdo seguro, chave idempotente e códigos curtos. |
| `supabase/functions/enviar-alerta/index.ts` | Edge Function protegida, que busca o alerta e chama Resend. |
| `supabase/functions/enviar-alerta/deno.json` | imports Deno. |
| `tests/alertas/alerta.test.ts` | conteúdo, privacidade, validação e contrato unitários. |
| `supabase/config.toml` | exceção JWT documentada da função. |
| `types/database.types.ts` | tipos gerados após a migration; nunca editar manualmente. |
| `docs/arquitetura/modelo-de-dados.md` | esquema das tabelas e significado de `alarme_enviado_em`. |
| `docs/arquitetura/recepcao-de-dados.md` | fluxo real do vigia/pg_net/Edge/Resend. |
| `docs/operacao/publicar.md` | checklist operacional separado, sem valores de segredo. |

---

### Task 1: Escrever o teste de ciclo do alerta (vermelho)

**Files:**
- Create: `tests/rotinas/alertas-sinal.test.ts`

**Interfaces:**
- Consumes: `criarFixture`, `limparFixture`, `conectarBanco` e `public.atualizar_estados()`.
- Produces: contrato de `public.confirmar_alerta_sinal(uuid, integer, jsonb, text)` e `public.processar_alertas_sinal()`.

- [ ] **Passo 1: criar a fixture de parada.** Reaproveitar a fixture existente; não usar `supabase db reset`. A casa A deve ficar aberta 24 horas e o último envio válido há 46 minutos:

```ts
// tests/rotinas/alertas-sinal.test.ts
// @vitest-environment node
import type { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";

const SEMPRE_ABERTO = Array.from({ length: 7 }, (_, dia) => [
  { dia, abre: "00:00", fecha: "12:00" },
  { dia, abre: "12:00", fecha: "00:00" },
]).flat();

async function pararCasa(cliente: Client, restauranteId: string) {
  await cliente.query(
    `update public.restaurantes set horario_funcionamento = $2::jsonb where id = $1;
     insert into public.sinal_de_vida (restaurante_id, primeiro_envio_em, ultimo_envio_ok_em)
     values ($1, now() - interval '2 hours', now() - interval '46 minutes')
     on conflict (restaurante_id) do update
       set primeiro_envio_em = excluded.primeiro_envio_em,
           ultimo_envio_ok_em = excluded.ultimo_envio_ok_em`,
    [restauranteId, JSON.stringify(SEMPRE_ABERTO)]
  );
  await cliente.query("select public.atualizar_estados()");
}
```

- [ ] **Passo 2: escrever os casos que falham sem a migration.** Inicializar/limpar `banco` e `fixture` em `beforeEach`/`afterEach`, como em `envio.test.ts`. Cobrir concretamente:

```ts
it("cria somente um incidente e um alerta pendente quando a casa vira parado", async () => {
  await pararCasa(banco, fixture.restauranteA);
  await banco.query("select public.atualizar_estados()");
  const alertas = await banco.query(
    `select tipo, estado, restaurante_id::text from public.alertas_sinal
      where restaurante_id = $1`,
    [fixture.restauranteA]
  );
  expect(alertas.rows).toEqual([
    { tipo: "parado", estado: "pendente", restaurante_id: fixture.restauranteA },
  ]);
});

it("só marca parado como enviado após confirmação HTTP ok", async () => {
  await pararCasa(banco, fixture.restauranteA);
  const alerta = await banco.query<{ id: string }>(
    "select id::text from public.alertas_sinal where restaurante_id = $1",
    [fixture.restauranteA]
  );
  await banco.query(
    "select public.confirmar_alerta_sinal($1::uuid, 202, '{\"ok\":true}'::jsonb, null)",
    [alerta.rows[0]?.id]
  );
  const estado = await banco.query("select estado from public.alertas_sinal where id = $1", [alerta.rows[0]?.id]);
  expect(estado.rows).toEqual([{ estado: "enviado" }]);
});
```

Adicionar casos para: HTTP 500 mantém `pendente` e código curto; casa fechada não cria `voltou`; atualização de `ultimo_envio_ok_em` depois da entrega cria um único `voltou`; atualização antes da entrega cancela `parado`; casa B não cria, confirma ou encerra alerta da A.

- [ ] **Passo 3: executar e confirmar o vermelho.**

```bash
npm run test -- tests/rotinas/alertas-sinal.test.ts
```

Esperado: falha porque tabela e funções ainda não existem.

- [ ] **Passo 4: commit e cópia remota.**

```bash
git add tests/rotinas/alertas-sinal.test.ts
git commit -m "Especifica o ciclo do alarme de sinal"
git push origin etapa-9-alarme
```

---

### Task 2: Criar migration da fila confiável

**Files:**
- Create: `supabase/migrations/20261020140000_alarme_sinal.sql`
- Modify: `tests/rotinas/alertas-sinal.test.ts`
- Modify: `tests/isolamento/todas-as-tabelas.test.ts`
- Modify: `tests/isolamento/funcoes-fechadas.test.ts`
- Modify: `types/database.types.ts` (gerado)

**Interfaces:**
- Produces: `incidentes_sinal`, `alertas_sinal`, `registrar_parada_sinal`, `registrar_retorno_sinal`, `confirmar_alerta_sinal`, `processar_alertas_sinal` e trigger em `ultimo_envio_ok_em`.
- Consumes: `sinal_de_vida`, `restaurantes`, `atualizar_estados`, pg_cron, pg_net e Vault.

- [ ] **Passo 1: criar tabelas, restrições e índices.** A migration deve começar por `begin;`, criar (se ausentes no local) `pg_net` e `supabase_vault`, e usar este contrato:

```sql
create table public.incidentes_sinal (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  parado_em timestamptz not null,
  voltou_em timestamptz,
  alerta_parado_enviado_em timestamptz,
  alerta_voltou_enviado_em timestamptz,
  encerrado_em timestamptz,
  criado_em timestamptz not null default now(),
  check (voltou_em is null or voltou_em >= parado_em),
  check (encerrado_em is null or encerrado_em >= parado_em)
);
create unique index incidentes_sinal_um_aberto_por_casa
  on public.incidentes_sinal(restaurante_id) where encerrado_em is null;

create table public.alertas_sinal (
  id uuid primary key default gen_random_uuid(),
  incidente_id uuid not null references public.incidentes_sinal(id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  tipo text not null check (tipo in ('parado', 'voltou')),
  estado text not null default 'pendente'
    check (estado in ('pendente', 'em_transito', 'enviado', 'cancelado')),
  tentativas integer not null default 0 check (tentativas >= 0),
  proxima_tentativa_em timestamptz not null default now(),
  request_id bigint unique,
  solicitado_em timestamptz,
  enviado_em timestamptz,
  erro_codigo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (incidente_id, tipo),
  check (char_length(coalesce(erro_codigo, '')) <= 60)
);
create index alertas_sinal_pendentes_idx
  on public.alertas_sinal(proxima_tentativa_em, criado_em)
  where estado = 'pendente';
```

- [ ] **Passo 2: fechar as tabelas no mesmo arquivo.** Habilitar RLS, revogar permissões de `anon` e `authenticated`, sem criar policy:

```sql
alter table public.incidentes_sinal enable row level security;
alter table public.alertas_sinal enable row level security;
revoke all on table public.incidentes_sinal, public.alertas_sinal from anon, authenticated;
```

Adicionar as duas tabelas em `todas-as-tabelas.test.ts` com `clienteVe: nada` e `adminVe: 0`; acrescentar `select`, `insert`, `update` e `delete` recusados/zero para cliente e admin.

- [ ] **Passo 3: implementar a criação idempotente de parada.** `registrar_parada_sinal(uuid, timestamptz)` é `security definer`, `set search_path = public`, `set row_security = off`, trava por casa e cria o alerta uma só vez:

```sql
perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text, 9));
select id into v_incidente from public.incidentes_sinal
 where restaurante_id = p_restaurante_id and encerrado_em is null;
if v_incidente is null then
  insert into public.incidentes_sinal(restaurante_id, parado_em)
    values (p_restaurante_id, p_momento) returning id into v_incidente;
end if;
insert into public.alertas_sinal(incidente_id, restaurante_id, tipo)
  values (v_incidente, p_restaurante_id, 'parado')
  on conflict (incidente_id, tipo) do nothing;
```

No loop de `atualizar_estados()`, depois de persistir o estado calculado, chamar esse helper quando `v_estado = 'parado'`. Conservar o `exception when others` por restaurante: fila defeituosa de A não para B.

- [ ] **Passo 4: registrar volta real com trigger, sem copiar a enorme `processar_envio`.** Criar `registrar_retorno_sinal()` e trigger `AFTER INSERT OR UPDATE OF ultimo_envio_ok_em` em `sinal_de_vida`, com condição `new.ultimo_envio_ok_em is distinct from old.ultimo_envio_ok_em and new.ultimo_envio_ok_em is not null`. O helper deve marcar `voltou_em` no incidente aberto.

Se `parado` já está `enviado`, inserir `voltou` com `on conflict do nothing`. Se `parado` está `pendente`, mudar para `cancelado` e encerrar o incidente. Se está `em_transito`, apenas registra a volta: a confirmação decidirá entre criar `voltou` (sucesso) ou cancelar/encerrar (falha). Portanto nunca existe “voltou” sem parada entregue.

- [ ] **Passo 5: implementar confirmação e despachante.** `confirmar_alerta_sinal(p_alerta_id uuid, p_status integer, p_corpo jsonb, p_erro text)` é fechada e considera sucesso somente neste caso:

```sql
if p_status between 200 and 299 and coalesce((p_corpo ->> 'ok')::boolean, false) then
  update public.alertas_sinal set estado = 'enviado', enviado_em = now(),
    request_id = null, erro_codigo = null, atualizado_em = now() where id = p_alerta_id;
else
  update public.alertas_sinal set estado = 'pendente', request_id = null,
    proxima_tentativa_em = now() + interval '5 minutes',
    erro_codigo = left(coalesce(nullif(p_erro, ''), 'resposta_invalida'), 60),
    atualizado_em = now() where id = p_alerta_id;
end if;
```

No sucesso de `parado`, preencher `incidentes_sinal.alerta_parado_enviado_em` e `sinal_de_vida.alarme_enviado_em`, e criar `voltou` se `voltou_em` já existe. No sucesso de `voltou`, preencher seu marco, limpar `sinal_de_vida.alarme_enviado_em` e encerrar o incidente. No erro de parada cuja volta já aconteceu, cancelar e encerrar sem criar `voltou`.

`processar_alertas_sinal()` primeiro consulta `net._http_response` para cada `request_id` e chama o helper; `em_transito` sem resposta por 15 minutos vira `pendente` com `resposta_ausente`. Depois seleciona no máximo 20 pendências com `FOR UPDATE SKIP LOCKED`. Antes da chamada, cancela parada cuja volta já foi registrada. Busca `rf_alerta_url` e `rf_alerta_segredo` exclusivamente em `vault.decrypted_secrets`; se faltar, deixa `pendente` com `vault_indisponivel`. Para a chamada:

```sql
select net.http_post(
  url := v_url,
  body := jsonb_build_object('alerta_id', v_alerta.id),
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-rf-alerta-secret', v_segredo
  ),
  timeout_milliseconds := 10000
) into v_request_id;
update public.alertas_sinal set estado = 'em_transito', request_id = v_request_id,
  solicitado_em = now(), tentativas = tentativas + 1, atualizado_em = now()
where id = v_alerta.id;
```

Nunca grave URL, segredo, cabeçalho, corpo de resposta ou mensagem do provedor. Exceção por linha vira `chamada_falhou`, sem parar outras casas.

- [ ] **Passo 6: reagendar o cron.** Recriar `rf-vigia` para calcular e despachar no mesmo ciclo:

```sql
perform cron.unschedule('rf-vigia') where exists (
  select 1 from cron.job where jobname = 'rf-vigia'
);
perform cron.schedule('rf-vigia', '*/5 * * * *', $cron$
  select public.atualizar_estados();
  select public.processar_alertas_sinal();
$cron$);
```

Revogar `EXECUTE` das quatro funções novas para `public`, `anon` e `authenticated`; conceder apenas a `service_role`. Acrescentar as quatro assinaturas como `false` para anon/authenticated no teste de funções fechadas.

- [ ] **Passo 7: aplicar no banco local e rodar os testes relevantes.**

```bash
npm run supabase:start
npx supabase migration up --local
npm run test -- tests/rotinas/alertas-sinal.test.ts tests/rotinas/estados-retencao.test.ts tests/isolamento/todas-as-tabelas.test.ts tests/isolamento/funcoes-fechadas.test.ts
npm run types
git diff --check
```

**Atenção:** `migration up --local` aplica só a migration pendente no banco local e preserva as fixtures existentes. Nunca usar `--linked`, `db reset` ou banco de nuvem. Esperado: testes passam, sem chamada HTTP externa.

- [ ] **Passo 8: commit e cópia remota.**

```bash
git add supabase/migrations/20261020140000_alarme_sinal.sql tests/rotinas/alertas-sinal.test.ts tests/isolamento/todas-as-tabelas.test.ts tests/isolamento/funcoes-fechadas.test.ts types/database.types.ts
git commit -m "Cria a fila confiável do alarme de sinal"
git push origin etapa-9-alarme
```

---

### Task 3: Conteúdo seguro e contrato puro

**Files:**
- Create: `supabase/functions/_shared/alerta.ts`
- Create: `tests/alertas/alerta.test.ts`

**Interfaces:**
- Produces: `AlertaParaEmail`, `chaveIdempotenciaAlerta`, `montarEmailAlerta`, `codigoSeguro`.
- Consumes: ID, tipo, nome/fuso da casa, último envio e URL do admin. Não recebe token, destinatário nem payload SCC.

- [ ] **Passo 1: escrever o teste antes do módulo.**

```ts
// tests/alertas/alerta.test.ts
import { describe, expect, it } from "vitest";
import { chaveIdempotenciaAlerta, codigoSeguro, montarEmailAlerta } from "../../supabase/functions/_shared/alerta";

const alerta = {
  id: "11111111-1111-4111-8111-111111111111",
  tipo: "parado" as const,
  nomeRestaurante: "Casa & Cozinha <teste>",
  ultimoEnvioEm: "2026-10-20T15:00:00.000Z",
  fuso: "America/Fortaleza",
  urlAdmin: "https://food.repplyhub.com.br/admin/restaurantes/22222222-2222-4222-8222-222222222222",
};

describe("alerta por e-mail", () => {
  it("usa chave estável por alerta", () => {
    expect(chaveIdempotenciaAlerta(alerta.id)).toBe("rf-alerta-11111111-1111-4111-8111-111111111111");
  });
  it("escapa o nome e não inclui segredo", () => {
    const email = montarEmailAlerta(alerta);
    expect(email.subject).toContain("SCC parado");
    expect(email.html).toContain("Casa &amp; Cozinha &lt;teste&gt;");
    expect(email.text).toContain("Casa & Cozinha <teste>");
    expect(email.html).not.toContain("RESEND_API_KEY");
  });
  it("reduz erro externo a código curto", () => {
    expect(codigoSeguro(new Error("token=segredo destinatario@exemplo.com"))).toBe("erro_provedor");
  });
});
```

- [ ] **Passo 2: executar e confirmar falha.**

```bash
npm run test -- tests/alertas/alerta.test.ts
```

- [ ] **Passo 3: implementar o módulo mínimo.**

```ts
export type AlertaParaEmail = {
  id: string;
  tipo: "parado" | "voltou";
  nomeRestaurante: string;
  ultimoEnvioEm: string | null;
  fuso: string;
  urlAdmin: string;
};

export function chaveIdempotenciaAlerta(id: string) {
  return `rf-alerta-${id}`;
}
```

`montarEmailAlerta` devolve `{ subject, text, html }`, escapa `&`, `<`, `>`, `"`, `'`, formata o instante com `new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: fuso }).format(new Date(ultimoEnvioEm))` e usa “SCC voltou a enviar” para `voltou`. `codigoSeguro` só retorna `erro_provedor`, `configuracao_invalida`, `alerta_invalido` ou `erro_interno`; nunca retorna `erro.message`.

- [ ] **Passo 4: rodar teste e lint.**

```bash
npm run test -- tests/alertas/alerta.test.ts
npm run lint
```

- [ ] **Passo 5: commit e cópia remota.**

```bash
git add supabase/functions/_shared/alerta.ts tests/alertas/alerta.test.ts
git commit -m "Cria o conteúdo seguro do alerta"
git push origin etapa-9-alarme
```

---

### Task 4: Edge Function protegida para a Resend

**Files:**
- Create: `supabase/functions/enviar-alerta/deno.json`
- Create: `supabase/functions/enviar-alerta/index.ts`
- Modify: `supabase/config.toml`
- Modify: `tests/alertas/alerta.test.ts`

**Interfaces:**
- Consumes: `{ alerta_id: string }`, `x-rf-alerta-secret`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ALERTA_EMAIL_DE`, `ALERTA_EMAIL_PARA`, `ALERTA_CHAVE_INTERNA` e Task 3.
- Produces: `{ ok: true }` ou `{ ok: false, codigo: string }`. A função nunca atualiza a caixa de saída.

- [ ] **Passo 1: estender o teste puro.** Cobrir ID inválido → `alerta_invalido`, segredo ausente → 401 sem detalhes e falha → corpo com somente `codigo`. Se precisar injetar dependências, exportar `criarManipuladorAlerta(deps)` do módulo compartilhado; `index.ts` injeta Deno, Supabase e Resend reais.

- [ ] **Passo 2: confirmar o vermelho.**

```bash
npm run test -- tests/alertas/alerta.test.ts
```

- [ ] **Passo 3: criar imports fixos da função.**

```json
{
  "imports": {
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2.117.3",
    "resend": "npm:resend@4.0.1"
  }
}
```

- [ ] **Passo 4: implementar o handler.** Validar POST, header e UUID antes de consultar o banco:

```ts
if (req.method !== "POST") return responder({ ok: false, codigo: "metodo_invalido" }, 405);
if (!segredo || req.headers.get("x-rf-alerta-secret") !== segredo) {
  return responder({ ok: false, codigo: "nao_autorizado" }, 401);
}
```

Buscar pelo `alerta_id` `alertas_sinal`, incidente, restaurante e `sinal_de_vida`, com `SUPABASE_SERVICE_ROLE_KEY`. Recusar alerta inexistente, cancelado ou não `em_transito`; a URL do admin vem de `APP_URL` de ambiente, nunca do request. Montar conteúdo da Task 3 e chamar:

```ts
await resend.emails.send({
  from: emailDe,
  to: [emailPara],
  subject: email.subject,
  html: email.html,
  text: email.text,
  headers: { "Idempotency-Key": chaveIdempotenciaAlerta(alerta.id) },
});
```

Conferir o erro retornado pela SDK. Em `catch`, registrar somente `[enviar-alerta] erro_interno` e devolver código curto; nunca imprimir request, header, destinatário ou texto do provedor.

- [ ] **Passo 5: documentar a exceção JWT em `supabase/config.toml`.**

```toml
[functions.enviar-alerta]
# O pg_net não tem JWT; a função exige x-rf-alerta-secret igual ao segredo no Vault.
verify_jwt = false
```

- [ ] **Passo 6: rodar a prova local sem enviar e-mail.**

```bash
npm run test -- tests/alertas/alerta.test.ts
npx supabase functions serve enviar-alerta --no-verify-jwt
curl -i -X POST http://127.0.0.1:54321/functions/v1/enviar-alerta -H 'content-type: application/json' -d '{}'
```

Esperado: 401 com JSON curto. Interromper o servidor; não configurar chave Resend real.

- [ ] **Passo 7: commit e cópia remota.**

```bash
git add supabase/functions/enviar-alerta supabase/functions/_shared/alerta.ts tests/alertas/alerta.test.ts supabase/config.toml
git commit -m "Adiciona a função protegida de enviar alerta"
git push origin etapa-9-alarme
```

---

### Task 5: Tipos e documentação operacional

**Files:**
- Modify: `types/database.types.ts`
- Modify: `docs/arquitetura/modelo-de-dados.md`
- Modify: `docs/arquitetura/recepcao-de-dados.md`
- Modify: `docs/operacao/publicar.md`

**Interfaces:**
- Consumes: schema e função finais.
- Produces: documentação sem segredo que separa código local da operação autorizada.

- [ ] **Passo 1: gerar tipos sem edição manual.**

```bash
npm run types
git diff --check
git diff -- types/database.types.ts
```

- [ ] **Passo 2: atualizar o modelo.** Depois de `sinal_de_vida`, documentar `incidentes_sinal` e `alertas_sinal`, `unique (incidente_id, tipo)`, incidente aberto único e que `alarme_enviado_em` só é preenchido após confirmação do `parado` e limpo após confirmação do `voltou`.

- [ ] **Passo 3: atualizar recepção/vigia.** Trocar “Ainda não existe” por `enviar-alerta` implementada; descrever banco → pg_net → Edge → Resend → `net._http_response`, e manter explícito que `cron.job_run_details.succeeded` não prova envio e fechar não cria “voltou”.

- [ ] **Passo 4: acrescentar checklist da etapa 9 em `publicar.md`.** Listar: backup autorizado; conferir extensões; criar no Vault `rf_alerta_url`/`rf_alerta_segredo`; configurar segredos da função; deploy; migration; job `rf-vigia`; casa de demonstração; `net._http_response`; caixa de entrada. Declarar que e-mail real e mudanças de conta exigem consentimento na hora.

- [ ] **Passo 5: procurar vazamento e conferir diff.**

```bash
git grep -nE 'RESEND_API_KEY=|ALERTA_EMAIL_(DE|PARA)=|rf_alerta_segredo[[:space:]]*=' -- docs supabase ':(exclude)docs/superpowers/plans' || true
git diff --check
```

Esperado: somente nomes de variáveis, sem valores.

- [ ] **Passo 6: commit e cópia remota.**

```bash
git add types/database.types.ts docs/arquitetura/modelo-de-dados.md docs/arquitetura/recepcao-de-dados.md docs/operacao/publicar.md
git commit -m "Documenta a operação segura do alarme"
git push origin etapa-9-alarme
```

---

### Task 6: Gates completos e revisão antes de integrar

**Files:**
- Modify: somente correções justificadas pelos gates.

**Interfaces:**
- Consumes: toda a etapa 9.
- Produces: evidência local de revisão; não publica nem integra em `main`.

- [ ] **Passo 1: rodar todos os gates.**

```bash
npm run types
npm run lint
npm run test
npm run build
```

- [ ] **Passo 2: revisar segurança estática.**

```bash
git diff origin/main...HEAD -- supabase/migrations supabase/functions supabase/config.toml
git grep -n "console\.\(log\|error\)" supabase/functions/enviar-alerta supabase/functions/_shared/alerta.ts
git status --short --branch
```

Esperado: nenhum log com request/provedor; função nova não está aberta a anon/authenticated; branch acompanha `origin/etapa-9-alarme`; nenhum arquivo privado.

- [ ] **Passo 3: revisar os requisitos da spec.** Conferir contra testes/código: parada única, resposta real, falha repetível, volta válida, sem volta no fechamento, cancelamento, isolamento e conteúdo sem dados pessoais. Registrar lacuna real em `docs/divida-tecnica.md`, sem mascarar falha.

- [ ] **Passo 4: tratar um gate que falhar sem esconder a evidência.** Voltar à tarefa que criou o teste ou a interface em falha, fazer a correção mínima, rodar de novo o teste específico e então repetir os quatro gates do Passo 1. Antes de qualquer novo commit, rodar `git status --short`, listar explicitamente apenas os caminhos corrigidos em `git add`, usar a mensagem imperativa que descreve aquela correção e executar `git push origin etapa-9-alarme`. Se todos os gates passarem, não criar commit vazio. Não abrir PR, não fazer merge e não publicar sem autorização posterior.

---

## Revisão do plano

### Cobertura da spec

| Requisito | Tarefa |
|---|---|
| fila persistente, incidente único, RLS e isolamento | 1–2 |
| parada pelo vigia e volta por dado válido | 1–2 |
| resposta real, retry e cancelamento | 1–2 |
| segredo interno, Resend, idempotência e conteúdo mínimo | 3–4 |
| documentação/operação sem segredo | 5 |
| tipos, lint, testes, build e revisão | 6 |
| commit/push contínuos, sem `main`/nuvem | todas |

### Varredura de lacunas

- Não há tela nova: painel/admin já leem `sinal_de_vida`, portanto nenhum componente visual precisa mudar.
- A deduplicação de 24 h da Resend fica explícita como limite operacional; o código não promete “exatamente uma vez” além da garantia do provedor.
- A fixture limpa somente seus IDs; a migration pendente é aplicada com `migration up --local`, sem resetar nenhum banco.
- Nenhum passo inclui valor de segredo, destinatário real, token, senha ou arquivo privado.

### Consistência de interfaces

- `alertas_sinal` usa sempre `tipo` (`parado | voltou`) e `estado` (`pendente | em_transito | enviado | cancelado`).
- A Edge Function recebe somente `alerta_id`; banco não envia texto/nome/destinatário por pg_net.
- `confirmar_alerta_sinal` é usado pelo despachante/teste; Edge Function nunca marca entrega diretamente.
