# Etapa 3 · Admin da Repply · Plano de implementação

> **Para agentes de execução:** É OBRIGATÓRIO usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para rastreamento.

**Objetivo:** A equipe Repply cadastra e edita restaurantes, gera e revoga o token de envio, cria e cuida do login do cliente, acompanha os envios, pede reenvio, suspende e reativa, tudo pelo `/admin`, com histórico de quem fez o quê. O painel do cliente ganha a faixa "só leitura" do admin, o Ajustes do admin e o "Trocar de casa".

**Arquitetura:** Jeito A, híbrido (desenho §2). O admin grava pelo próprio login (a RLS de `eh_admin_repply()` barra qualquer outro) e só usa a chave de serviço no que o Auth exige (criar conta, senha, e-mail, desconectar). O banco passa a validar horário, fuso e CNPJ; a troca de token é uma função do banco numa transação só; uma visão com `security_invoker` alimenta a lista. Toda função do servidor do admin começa por `exigirAdmin()` e devolve frase do produto.

**Stack:** Next.js 16.4 (App Router, `proxy.ts`), React 19, TypeScript estrito, Tailwind 4, `@base-ui/react`, react-hook-form 7.90 + `@hookform/resolvers` 5.9 + zod 4.6, `@supabase/ssr` 0.10 / `@supabase/supabase-js` 2.117 (GoTrue local v2.197), Postgres 17 local, Vitest 2 + Testing Library, Biome 1.9.

**Desenho aprovado:** [`docs/superpowers/specs/2026-10-14-etapa-3-admin-design.md`](../specs/2026-10-14-etapa-3-admin-design.md). Tela: [`docs/telas/admin.html`](../../telas/admin.html). Roteiro: [`docs/operacao/cadastrar-restaurante.md`](../../operacao/cadastrar-restaurante.md).

## Premissas conferidas no banco local (15/10/2026)

Medidas antes de escrever o plano, em transações desfeitas e contas de teste apagadas no fim:

1. **O vigia já trata dois horários no mesmo dia e o que passa da meia-noite.** Com `[{dia:2, 11:00–15:00}, {dia:2, 18:00–02:00}]`, `aberto_desde` deu: terça 12h → aberta desde 11h; 15h e 16h30 → fechada; 20h → desde 18h; quarta 1h59 → desde 18h de terça; quarta 2h → fechada. **Não precisa de migration no vigia**; a Tarefa 1 só acrescenta esses casos ao teste.
2. **Restrições novas × dados existentes.** As 2 casas do banco local (`acesso-local`) têm fuso `America/Fortaleza`, horário `[]` e CNPJ vazio: passam. A fixture dos testes também passa. **Não passam** dois trechos de `tests/rotinas/estados-retencao.test.ts`: o horário "24 h" escrito como `abre = fecha = 00:00` (a restrição exige `abre ≠ fecha`) e o teste do vigia com horário e fuso malformados (agora barrados na gravação). A Tarefa 1 ajusta os dois no mesmo passo: o "24 h" vira `00:00–12:00` + `12:00–00:00` por dia (aceito pela restrição e medido como "aberta há mais de 3 dias" no vigia) e o teste do malformado tira as duas restrições só dentro da própria transação. Sem `not valid`.
3. **Função fechada dentro de uma restrição `check` derruba a gravação do admin.** Medido: `update` feito pelo login do admin numa tabela com `check (funcao_fechada(...))` dá `42501 permission denied for function`. Por isso `horario_funcionamento_valido` e `cnpj_valido` recebem `grant execute ... to authenticated` de propósito e entram na lista de `funcoes-fechadas.test.ts`.
4. **Encerrar sessões.** Duas sessões abertas; `updateUserById` com senha nova, feito pelo admin, **já apagou as duas linhas de `auth.sessions`** (GoTrue v2.197). Depois disso, `getUser(token antigo)` falha ("Auth session missing!", status 400, `data.user` nulo) e `refreshSession` falha com `refresh_token_not_found`; apagar `auth.sessions` leva junto `refresh_tokens` e `mfa_amr_claims` (`on delete cascade`). **Resíduo:** o token de acesso antigo ainda lê pela API de dados (PostgREST) até expirar (1 h, `jwt_expiry`), porque ela não consulta a sessão; no painel o porteiro chama `getUser` e manda para `/entrar` na hora. `encerrar_sessoes_do_login` fica como garantia (o comportamento do Auth não é contrato) e zero linhas apagadas é normal.
5. **Visão com `security_invoker = true` no Postgres 17.11 respeita a RLS:** admin vê 2 casas, dono vê 1 (sem a versão do SCC, porque `envios` é só do admin), anônimo 0. Visão nova nasce com `select/insert/update/delete` para `anon` e `authenticated` (privilégio padrão): a migration revoga.
6. **Índice único parcial do "abriu o painel":** `date_trunc('hour', criado_em)` é recusado (`42P17`, não é imutável); `date_trunc('hour', criado_em, 'UTC')` (três argumentos) é imutável e foi aceito. A segunda inserção na mesma hora dá `23505`; na hora seguinte, entra.
7. **Auth admin local:** `createUser` com `email_confirm: true` e `app_metadata` funciona (o Auth junta `provider`/`providers`); e-mail repetido, mesmo em maiúsculas, dá `email_exists` (422). `updateUserById` troca senha, `app_metadata` e e-mail na hora (`new_email` fica vazio, sem confirmação). **Trocar para um e-mail que já existe dá erro 500 sem código** ("Error updating user"): a ação confere antes com `id_do_login_por_email`. `last_sign_in_at` vem preenchido em `getUserById`.
8. **Privilégios:** hoje `anon` e `authenticated` têm `INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` e `MAINTAIN` (Postgres 17) em todas as tabelas. `revoke truncate, references, trigger, maintain` + `alter default privileges for role postgres` funcionam e valem para tabela e visão novas.
9. **`postgres` lê `auth.users` e apaga `auth.sessions`** (tem `BYPASSRLS`; as duas tabelas têm RLS ligada e são de `supabase_auth_admin`). Na nuvem isso precisa ser conferido na publicação (vai para a dívida técnica).
10. **Reenvio:** o contrato (§8) **não fixa limite** de data; os 120 dias são só do desenho (admin). O texto das instruções para a SCC é o da "Mensagem modelo" do roteiro de cadastro, sem mudança.
11. **CNPJ alfanumérico:** desde julho de 2026 a Receita emite CNPJ com letras nas 12 primeiras posições (dígitos verificadores calculados com o código ASCII − 48; o exemplo oficial `12.ABC.345/01DE-35` confere). O plano aceita os dois formatos (ver "Pontos para o controlador").
12. Linha de base: `npx vitest run` → 38 arquivos, 594 testes (com `receber-envio` respondendo `405`).

## Pontos decididos pelo controlador (15/10/2026)

- **CNPJ com letras: aceito.** A Receita emite CNPJ alfanumérico desde julho/2026; recusar seria recusar CNPJ válido. O plano valida 12 caracteres `0-9A-Z` + 2 dígitos (grava sem pontuação, em maiúsculas). O desenho (§1.1 e D-60) foi ajustado.
- **Mudar o fuso não corrige as horas já gravadas: só avisar.** `processar_envio` converte "data + hora local" em instante com o fuso da época; `recalcular_dia_operacao` só recalcula `dia_operacao` a partir desse instante. A mensagem de sucesso da edição avisa para pedir um reenvio; o caso vai para a dívida técnica (Tarefa 8). Pedir o reenvio sozinho seria decisão de produto.
- **Revogação de privilégios: revoga também `MAINTAIN`** (o Postgres 17 concede). `INSERT/UPDATE/DELETE` continuam concedidos nas 8 tabelas antigas, e a RLS decide. Nas duas peças novas (`registro_admin` e a visão) só o necessário.
- **Editar casa com horário vazio exige preencher o horário: aceito.** Só as duas casas do `acesso-local` têm horário `[]` ("sempre aberta"); toda casa nova nasce pelo cadastro, que já exige horário.

## Restrições Globais

- **Idioma:** tudo em português do Brasil; domínio em português. Termos técnicos genéricos podem ficar em inglês.
- **Nuvem: proibido nesta etapa.** Nada de `supabase db push`, `--linked`, `functions deploy`, `secrets set`, `config push`, Vercel ou DNS.
- **`git push`: só com o ok do Lucas Ferreira, pedido a cada envio.** Commits locais são livres.
- **Git:** `git fetch` antes de começar e antes de cada commit. Nunca `git add -A`, `--force`, `--no-verify`. Mensagens em PT-BR, no imperativo, terminando com o trailer `Co-Authored-By: <trailer do seu modelo>` (o que a sua ferramenta indicar).
- **Banco local:** nunca `supabase db reset`, `stop` ou `start`. A migration nova é aplicada **só na Tarefa 1**, com `npx supabase migration up --local`. Migration existente **nunca** é editada. Proibido `FORCE ROW LEVEL SECURITY`.
- **Função nova no banco nasce fechada:** `grant execute` dado de propósito na migration e a função na lista de `tests/isolamento/funcoes-fechadas.test.ts` (as abertas a `authenticated`) ou de `tests/isolamento/rpc-privilegada.test.ts` (as só da chave de serviço).
- **Segurança das funções do servidor (`"use server"`):** toda função exportada de `lib/admin/actions.ts` começa por `await exigirAdmin()`, antes de qualquer leitura (a decisão mora na ação, não na página: toda ação é chamável por POST). `restaurante_id` e `user_id` que chegam do navegador são conferidos: formato UUID, a casa lida pela RLS do admin, o login ligado àquela casa em `acessos` e que não é admin. A chave de serviço só aparece em `lib/admin/dados.ts` e `lib/admin/actions.ts`, sempre depois de `exigirAdmin()`.
- **Zero linhas não é sucesso:** `update` com `{ count: "exact" }` e `count !== 1` vira erro.
- **Erro do Supabase nunca vai cru para a tela nem para o log:** a tela recebe frase do produto; o log recebe só o código (`logError`).
- **Senha provisória e token:** só no retorno da função do servidor e no estado do componente. Nunca em log, URL, `localStorage`, `registro_admin` nem `console`.
- **Formulários (CLAUDE.md §10):** todo formulário do admin tem `method="post"` e o botão de enviar desligado até a página carregar (`useHidratado`, em `components/forms/use-hidratado.ts`). Não tire `logging.serverFunctions: false` do `next.config.ts`.
- **TypeScript:** nunca `any`. Tipos do banco só por `npm run types`.
- **Interface:** celular primeiro (390 px) e computador (1280 px), claro e escuro. Alvos de toque de pelo menos 44 px no celular. Cor nunca é o único canal (selo e etiquetas sempre com texto). Texto sobre laranja é quase-preto (`bg-primary text-primary-foreground`); laranja nunca é cor de texto pequeno. O tomate só no símbolo (D-42). Nunca rodar `npx shadcn add`.
- **Formatação:** depois de criar ou editar `.ts`/`.tsx`/`.json`/`.css`, rode `npx biome check --write <arquivos>`.
- **Heredoc do Bash come barra invertida nesta máquina:** escreva arquivos com a ferramenta de escrita/edição.
- **`next dev` do Next 16.4 reescreve `AGENTS.md` e `next-env.d.ts`:** rode `git checkout -- AGENTS.md next-env.d.ts` antes de qualquer `git add`.
- **Painel local:** sempre em `http://127.0.0.1:3000` (o login de `localhost` é outra sessão).
- **Verificação antes de dizer "feito":** `npx tsc --noEmit`, `npm run check`, `npx vitest run`, `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 npm run build`.

## Ordem e paralelismo

```
Tarefa 0 (controlador) → Tarefa 1 → [Tarefa 2 ‖ Tarefa 3] → Tarefa 4 → [Tarefa 5 ‖ Tarefa 6 ‖ Tarefa 7] → Tarefa 8 (controlador)
```

As tarefas entre colchetes rodam **ao mesmo tempo**, na mesma pasta, porque mexem em arquivos diferentes (a lista de cada uma é fechada). Regras para quem roda em paralelo:
- mexa **só** nos arquivos da sua tarefa; ninguém mexe em `package.json`, `package-lock.json`, `next.config.ts`, `app/layout.tsx` nem em migrations;
- rode os testes **focados** da sua tarefa e `npx biome check` **nos seus arquivos**; `npx tsc --noEmit` pode mostrar erro em arquivo da outra frente que está pela metade: se o erro for só lá, anote no relatório e siga;
- **dependência conhecida do trio:** a página de detalhe (`app/admin/restaurantes/[id]/page.tsx`, Tarefa 5) importa os quatro cartões com ação da Tarefa 6 (`components/admin/cartoes/cartao-{token,acesso,reenvio,situacao}.tsx`). Enquanto a 6 não terminar, o `tsc` da 5 acusa esses quatro módulos: é esperado. As assinaturas estão no bloco **Interfaces** das duas tarefas e não podem mudar;
- no commit, liste só os seus arquivos; se o git disser que o índice está travado (`index.lock`), espere uns segundos e tente de novo;
- a verificação completa (tipos, lint, suíte, build) roda no fim de cada grupo, pelo controlador.

## Mapa de arquivos

| Arquivo | Tarefa | Responsabilidade |
|---|---|---|
| `supabase/migrations/20261015120000_admin_da_repply.sql` | 1 | Validações de horário, fuso e CNPJ; `registro_admin`; `trocar_token_envio`, `revogar_tokens_envio`; `id_do_login_por_email`, `encerrar_sessoes_do_login`; visão `restaurantes_no_admin`; privilégios explícitos |
| `tests/isolamento/{cadastro-validado,tokens-de-envio,registro-admin,funcoes-de-login,visao-do-admin}.test.ts` (novos) | 1 | Testes do banco novo |
| `tests/isolamento/{funcoes-fechadas,rpc-privilegada,todas-as-tabelas}.test.ts`, `tests/rotinas/{aberto-desde,estados-retencao}.test.ts` | 1 | Listas de funções, privilégios, vigia com dois horários, fixtures que a restrição nova recusaria |
| `types/database.types.ts` | 1 | Tipos regenerados |
| `lib/admin/{token,senha-provisoria,cnpj,slug,fusos,horario,lista,datas,texto,mensagens,envios,historico,schemas}.ts` | 2 | Funções puras do admin |
| `supabase/functions/_shared/token.ts` (novo), `supabase/functions/receber-envio/index.ts` | 2 | `sha256Hex` num lugar só, usado pela recepção e comparado com o admin |
| `tests/admin/{token,senha-provisoria,cnpj,slug,horario,lista,datas,textos,schemas,espelho-do-banco}.test.ts` | 2 | Testes das funções puras |
| `lib/auth/{sessao,destino,actions}.ts`, `lib/logger.ts`, `app/error.tsx` (novo) | 3 | Pendências 27 e 43, `modoAdmin`, `podeTrocarDeCasa`, códigos de log novos, tela de erro |
| `tests/auth/{sessao,destino,actions}.test.ts`, `tests/logger.test.ts`, `tests/auth/tela-de-erro.test.tsx` (novo) | 3 | Testes da sessão |
| `lib/admin/{tipos,dados,registro,actions}.ts`, `components/admin/cartao.tsx` | 4 | Funções do servidor, leitura de dados, histórico, casca dos cartões |
| `tests/admin/{acoes-recusam,acoes-contra-o-banco}.test.ts` | 4 | Recusa sem tocar no banco; ações contra o banco e o Auth locais |
| `app/admin/{layout,page}.tsx`, `app/admin/restaurantes/[id]/page.tsx`, `components/admin/{topo-admin,lista-restaurantes}.tsx`, `components/admin/cartoes/{cartao-dados,cartao-envios,cartao-historico}.tsx` | 5 | Casca do admin, lista, detalhe e cartões só de leitura |
| `tests/admin/{lista-restaurantes,topo-admin,cartoes-de-leitura}.test.tsx` | 5 | Testes de tela da lista e do detalhe |
| `app/admin/restaurantes/novo/page.tsx`, `app/admin/restaurantes/[id]/editar/page.tsx`, `components/admin/{formulario-restaurante,editor-horario,formulario-email,confirmacao,quadro-copie-agora,botao-copiar}.tsx`, `components/admin/cartoes/{cartao-token,cartao-acesso,cartao-reenvio,cartao-situacao}.tsx` | 6 | Cadastro, edição, editor de horário e cartões com ação |
| `tests/admin/{formularios-antes-de-carregar,formulario-restaurante,cartoes-com-acao}.test.tsx` | 6 | Testes dos formulários e cartões |
| `app/r/[slug]/layout.tsx`, `app/r/[slug]/ajustes/page.tsx`, `components/painel/moldura-painel.tsx`, `components/painel/faixa-modo-leitura.tsx` (novo) | 7 | Faixa "só leitura", "abriu o painel", Ajustes do admin, "Trocar de casa" |
| `tests/painel/{modo-leitura,layout-da-casa,ajustes}.test.tsx` | 7 | Testes do painel |
| `docs/**`, `README.md`, `CLAUDE.md`, `scripts/acesso-local.ts` (só o comentário do topo), este plano | 8 | Decisões, documentação, conferência no navegador |

---

## Tarefa 0: Preparação (controlador)

**Arquivos:** nenhum (o desenho e este plano já estão commitados ou entram no commit da Tarefa 8).

- [ ] **Passo 1: Conferir o repositório**

```bash
git fetch --all --prune && git status -sb && git log --oneline -5 origin/main
```

Esperado: sem `[behind]`. Commits novos de outra pessoa: ler antes de seguir.

- [ ] **Passo 2: Conferir o banco local, a função e a caixa de e-mail**

```bash
curl --max-time 5 -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:54321/functions/v1/receber-envio
curl --max-time 5 -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:54324
npx supabase migration list --local
```

Esperado: `405`, `200`, e as 8 migrations de `20261009120000` a `20261014120000` aplicadas no local. Se a função não responder `405`: `npx supabase functions serve receber-envio` em segundo plano (não reinicie o banco).

- [ ] **Passo 3: Linha de base da suíte**

`npx vitest run` → esperado: 38 arquivos, 594 testes passando.

---

## Tarefa 1: Banco do admin (migration, testes e tipos)

**Por quê:** o banco passa a recusar cadastro malformado (pendência 9), ganha o histórico (D-59), a troca de token numa transação só (D-38), as duas funções que o Auth precisa (D-55), a visão da lista e os privilégios explícitos (pendência 14).

**Arquivos (lista fechada):**
- Criar: `supabase/migrations/20261015120000_admin_da_repply.sql`, `tests/isolamento/cadastro-validado.test.ts`, `tests/isolamento/tokens-de-envio.test.ts`, `tests/isolamento/registro-admin.test.ts`, `tests/isolamento/funcoes-de-login.test.ts`, `tests/isolamento/visao-do-admin.test.ts`
- Modificar: `tests/isolamento/funcoes-fechadas.test.ts`, `tests/isolamento/rpc-privilegada.test.ts`, `tests/isolamento/todas-as-tabelas.test.ts`, `tests/rotinas/aberto-desde.test.ts`, `tests/rotinas/estados-retencao.test.ts`, `types/database.types.ts` (só por `npm run types`)

**Interfaces produzidas (as Tarefas 2 a 7 usam):**
- Restrições em `public.restaurantes`: `restaurantes_horario_funcionamento_valido`, `restaurantes_fuso_do_brasil` (16 fusos, lista na migration), `restaurantes_cnpj_valido`.
- `public.horario_funcionamento_valido(p_horario jsonb) → boolean` e `public.cnpj_valido(p_cnpj text) → boolean` (executáveis por `authenticated`).
- Tabela `public.registro_admin (id bigint, criado_em timestamptz, autor uuid null, restaurante_id uuid, acao text, detalhe text null)`, `acao` na restrição `registro_admin_acao_valida` com: `cadastrou`, `editou_dados`, `gerou_token`, `revogou_token`, `criou_login`, `ligou_login`, `redefiniu_senha`, `trocou_email`, `pediu_reenvio`, `suspendeu`, `reativou`, `abriu_painel`. `detalhe` com até 200 caracteres. "abriu_painel" no máximo uma vez por hora por `(autor, restaurante_id)`: a segunda inserção dá `23505`.
- `public.trocar_token_envio(p_restaurante uuid, p_hash text, p_prefixo text, p_antigo text) → jsonb {"token_id": uuid, "antigos": int}`; `p_antigo` em `'agora' | '24h'`. Erros: `42501` (não é admin), `22023` (entrada malformada), `P0002` (restaurante não existe). Grava `criado_por` e o registro `gerou_token`.
- `public.revogar_tokens_envio(p_restaurante uuid) → integer` (quantos revogou). Erros: `42501`, `P0002` (restaurante não existe), `P0001` (nenhum token válido). Grava o registro `revogou_token`.
- `public.id_do_login_por_email(p_email text) → uuid | null` e `public.encerrar_sessoes_do_login(p_user_id uuid) → integer`: só `service_role`.
- Visão `public.restaurantes_no_admin (id, slug, nome, situacao, fuso, estado, ultimo_envio_ok_em, versao_scc)`, `security_invoker = true`, `select` só para `authenticated`.
- Tipos regenerados: `Database["public"]["Tables"]["registro_admin"]`, `Database["public"]["Views"]["restaurantes_no_admin"]`, `Database["public"]["Functions"]` com as seis funções novas.

- [ ] **Passo 1: Teste das validações do cadastro (falha)**

Crie `tests/isolamento/cadastro-validado.test.ts`:

```ts
// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  comoAutenticado,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";

const FUSOS_DO_BRASIL = [
  "America/Noronha",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Araguaina",
  "America/Maceio",
  "America/Bahia",
  "America/Sao_Paulo",
  "America/Santarem",
  "America/Campo_Grande",
  "America/Cuiaba",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Manaus",
  "America/Eirunepe",
  "America/Rio_Branco",
];

const ter = (abre: string, fecha: string) => ({ dia: 2, abre, fecha });
const DESFAZER = "desfazer";

describe("o banco confere o cadastro do restaurante (pendência 9, D-56, D-60)", () => {
  let banco: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
  });

  afterAll(async () => {
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      await banco?.end();
    }
  });

  /**
   * Grava pelo login do admin, como o painel faz, e desfaz sempre. Devolve
   * "aceito" ou o código do erro do Postgres.
   */
  async function tentar(sql: string, parametros: unknown[]): Promise<string> {
    try {
      await comoAutenticado(banco, fixture.admin, async () => {
        const resultado = await banco.query(sql, parametros);
        if (resultado.rowCount !== 1)
          throw new Error(`linhas: ${resultado.rowCount}`);
        throw new Error(DESFAZER);
      });
      return "inesperado";
    } catch (erro) {
      if (erro instanceof Error && erro.message === DESFAZER) return "aceito";
      return (erro as { code?: string }).code ?? String(erro);
    }
  }

  const horario = (valor: unknown) =>
    tentar(
      "update public.restaurantes set horario_funcionamento = $2::jsonb where id = $1",
      [fixture.restauranteA, JSON.stringify(valor)]
    );
  const fuso = (valor: string) =>
    tentar("update public.restaurantes set fuso = $2 where id = $1", [
      fixture.restauranteA,
      valor,
    ]);
  const cnpj = (valor: string | null) =>
    tentar("update public.restaurantes set cnpj = $2 where id = $1", [
      fixture.restauranteA,
      valor,
    ]);

  it.each([
    ["lista vazia (sempre aberta, cadastro antigo)", []],
    ["um horário", [ter("11:00", "15:00")]],
    ["almoço e jantar, o jantar passando da meia-noite", [ter("11:00", "15:00"), ter("18:00", "02:00")]],
    ["os dois fora de ordem", [ter("18:00", "02:00"), ter("11:00", "15:00")]],
    ["dois colados (24 horas)", [ter("00:00", "12:00"), ter("12:00", "00:00")]],
    ["a semana inteira", Array.from({ length: 7 }, (_, dia) => ({ dia, abre: "11:00", fecha: "23:00" }))],
  ])("horário aceito: %s", async (_, valor) => {
    expect(await horario(valor)).toBe("aceito");
  });

  it.each([
    ["três horários no mesmo dia", [ter("08:00", "09:00"), ter("10:00", "11:00"), ter("12:00", "13:00")]],
    ["dois que se sobrepõem", [ter("11:00", "15:00"), ter("14:00", "16:00")]],
    ["o primeiro passa da meia-noite", [ter("01:00", "00:30"), ter("03:00", "04:00")]],
    ["abre igual a fecha", [ter("11:00", "11:00")]],
    ["dia 7", [{ dia: 7, abre: "11:00", fecha: "15:00" }]],
    ["dia como texto", [{ dia: "2", abre: "11:00", fecha: "15:00" }]],
    ["hora 25:00", [ter("25:00", "15:00")]],
    ["hora sem zero à esquerda", [ter("9:00", "15:00")]],
    ["chave a mais", [{ dia: 2, abre: "11:00", fecha: "15:00", x: 1 }]],
    ["sem o fecha", [{ dia: 2, abre: "11:00" }]],
    ["objeto no lugar da lista", { dia: 2 }],
    ["número no lugar do horário", [1]],
    ["null do JSON", null],
    ["o malformado do vigia", [{ dia: "sexta", abre: "25:99", fecha: "oi" }]],
  ])("horário recusado: %s", async (_, valor) => {
    expect(await horario(valor)).toBe("23514");
  });

  it.each(FUSOS_DO_BRASIL)("fuso %s é aceito", async (valor) => {
    expect(await fuso(valor)).toBe("aceito");
  });

  it.each(["Marte/Olimpo", "America/New_York", "UTC", ""])(
    "fuso '%s' é recusado",
    async (valor) => {
      expect(await fuso(valor)).toBe("23514");
    }
  );

  it.each([null, "12345678000195", "98765432000198", "12ABC34501DE35"])(
    "CNPJ %s é aceito",
    async (valor) => {
      expect(await cnpj(valor)).toBe("aceito");
    }
  );

  it.each([
    "12345678000190",
    "11111111111111",
    "00000000000000",
    "12.345.678/0001-95",
    "1234567800019",
    "1234567800019A",
    "12abc34501de35",
  ])("CNPJ %s é recusado", async (valor) => {
    expect(await cnpj(valor)).toBe("23514");
  });

  it("o mesmo CNPJ não entra em duas casas", async () => {
    await expect(
      comoAutenticado(banco, fixture.admin, async () => {
        await banco.query("update public.restaurantes set cnpj = $2 where id = $1", [
          fixture.restauranteA,
          "12345678000195",
        ]);
        await banco.query("update public.restaurantes set cnpj = $2 where id = $1", [
          fixture.restauranteB,
          "12345678000195",
        ]);
      })
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("o admin cadastra uma casa nova com horário, fuso e CNPJ válidos", async () => {
    expect(
      await tentar(
        `insert into public.restaurantes (slug, nome, fuso, cnpj, horario_funcionamento)
         values ($1, 'Casa nova', 'America/Manaus', '98765432000198', $2::jsonb)`,
        [`casa-nova-${randomUUID()}`, JSON.stringify([ter("11:00", "15:00")])]
      )
    ).toBe("aceito");
  });
});
```

Rode `npx vitest run tests/isolamento/cadastro-validado.test.ts` → esperado: FALHA nos casos "recusado" (hoje tudo é aceito).

- [ ] **Passo 2: Casos de almoço e jantar no vigia (passam já: regressão)**

Em `tests/rotinas/aberto-desde.test.ts`, depois da constante `sempreAberto`, acrescente:

```ts
// Terça 13/10/2026 (dia 2): almoço e jantar, o jantar passando da meia-noite
// (D-56). Conferido em 15/10: o vigia já trata, sem mudar a função.
const almocoEJantar = [
  { dia: 2, abre: "11:00", fecha: "15:00" },
  { dia: 2, abre: "18:00", fecha: "02:00" },
];
// "24 horas" no formato que o banco aceita desde a etapa 3 (abre ≠ fecha).
const sempreAbertoValido = Array.from({ length: 7 }, (_, dia) => [
  { dia, abre: "00:00", fecha: "12:00" },
  { dia, abre: "12:00", fecha: "00:00" },
]).flat();
```

Na lista do `it.each([...])("%s", ...)`, depois do último caso (`"no intervalo entre os turnos, fechado"`), acrescente:

```ts
    [
      "almoço e jantar: terça 12h, aberta desde as 11h",
      almocoEJantar,
      "2026-10-13T15:00:00Z",
      "2026-10-13T14:00Z",
    ],
    [
      "almoço e jantar: terça 16h30, fechada entre os dois",
      almocoEJantar,
      "2026-10-13T19:30:00Z",
      null,
    ],
    [
      "almoço e jantar: terça 20h, aberta desde as 18h",
      almocoEJantar,
      "2026-10-13T23:00:00Z",
      "2026-10-13T21:00Z",
    ],
    [
      "almoço e jantar: quarta 1h59, ainda o jantar de terça",
      almocoEJantar,
      "2026-10-14T04:59:00Z",
      "2026-10-13T21:00Z",
    ],
    [
      "almoço e jantar: quarta 2h em ponto, fechou",
      almocoEJantar,
      "2026-10-14T05:00:00Z",
      null,
    ],
```

E, depois do teste `"casa 24 horas não ganha uma 'abertura' nova a cada meia-noite"`, acrescente:

```ts
  it("o '24 horas' que o banco aceita (dois colados por dia) também conta como uma abertura só", async () => {
    const resultado = await banco.query<{ antiga: boolean }>(
      `select public.aberto_desde($1::jsonb, $2, $3::timestamptz)
                <= $3::timestamptz - interval '3 days' as antiga`,
      [JSON.stringify(sempreAbertoValido), fuso, "2026-10-10T03:05:00Z"]
    );
    expect(resultado.rows[0]?.antiga).toBe(true);
  });
```

Rode `npx vitest run tests/rotinas/aberto-desde.test.ts` → esperado: PASSA (a função já trata; o teste trava o comportamento).

- [ ] **Passo 3: Teste da troca de token (falha)**

Crie `tests/isolamento/tokens-de-envio.test.ts`:

```ts
// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  hashToken,
  limparFixture,
} from "../helpers/supabase-local";

type Trocado = { resultado: { token_id: string; antigos: number } };

describe("troca e revogação do token de envio (D-38)", () => {
  let banco: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
  });

  afterAll(async () => {
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      await banco?.end();
    }
  });

  /** Roda como `quem` (id do login, ou null para sem login) e desfaz tudo no fim. */
  async function desfazendoComo<T>(
    quem: string | null,
    executar: () => Promise<T>
  ): Promise<T> {
    await banco.query("begin");
    try {
      await banco.query(`set local role ${quem ? "authenticated" : "anon"}`);
      if (quem) {
        await banco.query(
          "select set_config('request.jwt.claim.role', 'authenticated', true)"
        );
        await banco.query(
          "select set_config('request.jwt.claim.sub', $1, true)",
          [quem]
        );
      }
      return await executar();
    } finally {
      await banco.query("rollback");
    }
  }

  function novoToken() {
    const token = `rf_${randomUUID().replaceAll("-", "")}`;
    return { hash: hashToken(token), prefixo: token.slice(0, 7) };
  }

  const trocar = (restaurante: string, antigo: string, t = novoToken()) =>
    banco.query<Trocado>(
      "select public.trocar_token_envio($1, $2, $3, $4) as resultado",
      [restaurante, t.hash, t.prefixo, antigo]
    );

  const validos = (restaurante: string) =>
    banco.query<{ prefixo: string; expira_em: string | null; criado_por: string | null }>(
      `select prefixo, expira_em::text, criado_por::text
         from public.tokens_envio
        where restaurante_id = $1 and revogado_em is null
          and (expira_em is null or expira_em > now())
        order by criado_em`,
      [restaurante]
    );

  const registros = (restaurante: string) =>
    banco.query<{ autor: string; acao: string; detalhe: string | null }>(
      "select autor::text, acao, detalhe from public.registro_admin where restaurante_id = $1 order by id",
      [restaurante]
    );

  it("'agora': o antigo para na hora e o novo vale sozinho, com autor e histórico", async () => {
    await desfazendoComo(fixture.admin, async () => {
      const t = novoToken();
      const { rows } = await trocar(fixture.restauranteA, "agora", t);
      expect(rows[0]?.resultado.antigos).toBe(1);
      expect((await validos(fixture.restauranteA)).rows).toEqual([
        { prefixo: t.prefixo, expira_em: null, criado_por: fixture.admin },
      ]);
      expect((await registros(fixture.restauranteA)).rows).toEqual([
        { autor: fixture.admin, acao: "gerou_token", detalhe: "o antigo parou na hora" },
      ]);
    });
  });

  it("'24h': o antigo continua valendo por 24 horas, junto com o novo", async () => {
    await desfazendoComo(fixture.admin, async () => {
      await trocar(fixture.restauranteA, "24h");
      const { rows } = await banco.query<{
        total: number;
        com_prazo: number;
        prazo_certo: boolean;
      }>(
        `select count(*)::int as total,
                count(expira_em)::int as com_prazo,
                bool_and(expira_em is null or expira_em = now() + interval '24 hours') as prazo_certo
           from public.tokens_envio
          where restaurante_id = $1 and revogado_em is null
            and (expira_em is null or expira_em > now())`,
        [fixture.restauranteA]
      );
      expect(rows[0]).toEqual({ total: 2, com_prazo: 1, prazo_certo: true });
      expect((await registros(fixture.restauranteA)).rows[0]?.detalhe).toBe(
        "o antigo para em 24 h"
      );
    });
  });

  it("trocar de novo com '24h' nunca estica o prazo de quem já está saindo", async () => {
    await desfazendoComo(fixture.admin, async () => {
      await banco.query(
        "update public.tokens_envio set expira_em = now() + interval '1 hour' where restaurante_id = $1",
        [fixture.restauranteA]
      );
      await trocar(fixture.restauranteA, "24h");
      const { rows } = await banco.query<{ certo: boolean }>(
        `select bool_and(expira_em = now() + interval '1 hour') as certo
           from public.tokens_envio
          where restaurante_id = $1 and expira_em is not null`,
        [fixture.restauranteA]
      );
      expect(rows[0]?.certo).toBe(true);
    });
  });

  it("casa sem token: o primeiro token entra e o histórico diz 'primeiro token'", async () => {
    await desfazendoComo(fixture.admin, async () => {
      await banco.query(
        "update public.tokens_envio set revogado_em = now() where restaurante_id = $1",
        [fixture.restauranteA]
      );
      const { rows } = await trocar(fixture.restauranteA, "agora");
      expect(rows[0]?.resultado.antigos).toBe(0);
      expect((await registros(fixture.restauranteA)).rows[0]?.detalhe).toBe(
        "primeiro token"
      );
    });
  });

  it("revogar para todos os tokens válidos de uma vez e registra", async () => {
    await desfazendoComo(fixture.admin, async () => {
      await trocar(fixture.restauranteA, "24h");
      const { rows } = await banco.query<{ total: number }>(
        "select public.revogar_tokens_envio($1) as total",
        [fixture.restauranteA]
      );
      expect(rows[0]?.total).toBe(2);
      expect((await validos(fixture.restauranteA)).rows).toEqual([]);
      const historico = (await registros(fixture.restauranteA)).rows;
      expect(historico.at(-1)).toEqual({
        autor: fixture.admin,
        acao: "revogou_token",
        detalhe: "2 tokens",
      });
    });
  });

  it("revogar sem token válido é erro, não sucesso silencioso", async () => {
    await expect(
      desfazendoComo(fixture.admin, async () => {
        await banco.query("select public.revogar_tokens_envio($1)", [
          fixture.restauranteA,
        ]);
        await banco.query("select public.revogar_tokens_envio($1)", [
          fixture.restauranteA,
        ]);
      })
    ).rejects.toMatchObject({ code: "P0001" });
  });

  it("a troca na casa A não mexe no token da casa B", async () => {
    await desfazendoComo(fixture.admin, async () => {
      await trocar(fixture.restauranteA, "agora");
      expect((await validos(fixture.restauranteB)).rows).toHaveLength(1);
    });
  });

  it.each(["usuarioA", "usuarioSemAcesso"] as const)(
    "%s (não é admin) não troca nem revoga",
    async (quem) => {
      await expect(
        desfazendoComo(fixture[quem], () => trocar(fixture.restauranteA, "agora"))
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        desfazendoComo(fixture[quem], () =>
          banco.query("select public.revogar_tokens_envio($1)", [fixture.restauranteA])
        )
      ).rejects.toMatchObject({ code: "42501" });
    }
  );

  it("sem login, nem chega a executar", async () => {
    await expect(
      desfazendoComo(null, () => trocar(fixture.restauranteA, "agora"))
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      desfazendoComo(null, () =>
        banco.query("select public.revogar_tokens_envio($1)", [fixture.restauranteA])
      )
    ).rejects.toMatchObject({ code: "42501" });
  });

  it.each([
    ["opção desconhecida", () => ({ ...novoToken() }), "depois"],
    ["hash que não é SHA-256", () => ({ hash: "abc", prefixo: "rf_abcd" }), "agora"],
    ["prefixo fora do padrão", () => ({ ...novoToken(), prefixo: "xx_abcd" }), "agora"],
  ] as const)("recusa entrada malformada: %s", async (_, token, antigo) => {
    await expect(
      desfazendoComo(fixture.admin, () =>
        trocar(fixture.restauranteA, antigo, token())
      )
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("restaurante que não existe é erro", async () => {
    await expect(
      desfazendoComo(fixture.admin, () => trocar(randomUUID(), "agora"))
    ).rejects.toMatchObject({ code: "P0002" });
  });
});
```

Rode `npx vitest run tests/isolamento/tokens-de-envio.test.ts` → esperado: FALHA (a função não existe).

- [ ] **Passo 4: Teste do histórico (falha)**

Crie `tests/isolamento/registro-admin.test.ts`:

```ts
// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";

describe("histórico das ações do admin (D-59)", () => {
  let banco: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
  });

  afterAll(async () => {
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      await banco?.end();
    }
  });

  /**
   * `preparar` roda como dono do banco (postgres); depois troca para `quem`
   * (null = sem login) e roda `executar`. Tudo é desfeito no fim.
   */
  async function desfazendoComo<T>(
    quem: string | null,
    executar: () => Promise<T>,
    preparar?: () => Promise<unknown>
  ): Promise<T> {
    await banco.query("begin");
    try {
      if (preparar) await preparar();
      await banco.query(`set local role ${quem ? "authenticated" : "anon"}`);
      if (quem) {
        await banco.query(
          "select set_config('request.jwt.claim.role', 'authenticated', true)"
        );
        await banco.query(
          "select set_config('request.jwt.claim.sub', $1, true)",
          [quem]
        );
      }
      return await executar();
    } finally {
      await banco.query("rollback");
    }
  }

  const inserir = (
    autor: string,
    restaurante: string,
    acao = "editou_dados",
    detalhe: string | null = null
  ) =>
    banco.query(
      "insert into public.registro_admin (autor, restaurante_id, acao, detalhe) values ($1, $2, $3, $4)",
      [autor, restaurante, acao, detalhe]
    );

  const semente = () => inserir(fixture.admin, fixture.restauranteA);

  it("o admin registra em nome próprio e lê", async () => {
    await desfazendoComo(fixture.admin, async () => {
      expect((await inserir(fixture.admin, fixture.restauranteA)).rowCount).toBe(1);
      const lidos = await banco.query(
        "select 1 from public.registro_admin where restaurante_id = $1",
        [fixture.restauranteA]
      );
      expect(lidos.rowCount).toBe(1);
    });
  });

  it("o admin não registra em nome de outro login", async () => {
    await expect(
      desfazendoComo(fixture.admin, () =>
        inserir(fixture.usuarioA, fixture.restauranteA)
      )
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("o dono não registra nem lê o histórico da própria casa", async () => {
    await expect(
      desfazendoComo(fixture.usuarioA, () =>
        inserir(fixture.usuarioA, fixture.restauranteA)
      )
    ).rejects.toMatchObject({ code: "42501" });
    const lidos = await desfazendoComo(
      fixture.usuarioA,
      () =>
        banco.query("select 1 from public.registro_admin where restaurante_id = $1", [
          fixture.restauranteA,
        ]),
      semente
    );
    expect(lidos.rowCount).toBe(0);
  });

  it("ninguém altera nem apaga o histórico, nem o admin", async () => {
    for (const sql of [
      "update public.registro_admin set detalhe = 'adulterado' where restaurante_id = $1",
      "delete from public.registro_admin where restaurante_id = $1",
    ]) {
      await expect(
        desfazendoComo(
          fixture.admin,
          () => banco.query(sql, [fixture.restauranteA]),
          semente
        )
      ).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("sem login não pode nem consultar", async () => {
    await expect(
      desfazendoComo(null, () => banco.query("select 1 from public.registro_admin"))
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("ação fora da lista e detalhe longo demais são recusados", async () => {
    await expect(
      desfazendoComo(fixture.admin, () =>
        inserir(fixture.admin, fixture.restauranteA, "apagou_tudo")
      )
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      desfazendoComo(fixture.admin, () =>
        inserir(fixture.admin, fixture.restauranteA, "editou_dados", "x".repeat(201))
      )
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("'abriu o painel' entra no máximo uma vez por hora por admin e casa", async () => {
    await desfazendoComo(fixture.admin, async () => {
      await inserir(fixture.admin, fixture.restauranteA, "abriu_painel");
      await banco.query("savepoint segunda");
      await expect(
        inserir(fixture.admin, fixture.restauranteA, "abriu_painel")
      ).rejects.toMatchObject({ code: "23505" });
      await banco.query("rollback to savepoint segunda");
      // Outra casa, na mesma hora: entra.
      expect(
        (await inserir(fixture.admin, fixture.restauranteB, "abriu_painel")).rowCount
      ).toBe(1);
      // A mesma casa, na hora seguinte: entra.
      const outraHora = await banco.query(
        `insert into public.registro_admin (autor, restaurante_id, acao, criado_em)
         values ($1, $2, 'abriu_painel', now() + interval '1 hour')`,
        [fixture.admin, fixture.restauranteA]
      );
      expect(outraHora.rowCount).toBe(1);
      // As outras ações se repetem à vontade.
      await inserir(fixture.admin, fixture.restauranteA, "editou_dados");
      expect(
        (await inserir(fixture.admin, fixture.restauranteA, "editou_dados")).rowCount
      ).toBe(1);
    });
  });
});
```

Rode `npx vitest run tests/isolamento/registro-admin.test.ts` → esperado: FALHA (a tabela não existe).

- [ ] **Passo 5: Teste das funções de login (falha)**

Crie `tests/isolamento/funcoes-de-login.test.ts`:

```ts
// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const servico = createClient<Database>(URL_LOCAL, chaveLocal("service_role"), opcoes);
const novoAnonimo = () => createClient<Database>(URL_LOCAL, chaveLocal("anon"), opcoes);
const criados: string[] = [];

afterAll(async () => {
  for (const id of criados.splice(0)) await servico.auth.admin.deleteUser(id);
});

async function contaDeTeste() {
  const email = `login-${randomUUID().slice(0, 8)}@teste.repply.local`;
  const senha = `senha-${randomUUID()}`;
  const { data, error } = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error("não criou a conta de teste");
  criados.push(data.user.id);
  return { id: data.user.id, email, senha };
}

async function entrar(email: string, senha: string) {
  const cliente = novoAnonimo();
  const { data, error } = await cliente.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error || !data.session) throw new Error("a conta de teste não entrou");
  return { cliente, sessao: data.session };
}

describe("funções da chave de serviço para os logins (D-55)", () => {
  it("id_do_login_por_email acha a conta sem ligar para maiúsculas e espaços", async () => {
    const conta = await contaDeTeste();
    const { data, error } = await servico.rpc("id_do_login_por_email", {
      p_email: `  ${conta.email.toUpperCase()} `,
    });
    expect(error).toBeNull();
    expect(data).toBe(conta.id);
  });

  it("e-mail sem conta devolve nulo", async () => {
    const { data, error } = await servico.rpc("id_do_login_por_email", {
      p_email: `ninguem-${randomUUID()}@teste.repply.local`,
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("encerrar_sessoes_do_login desconecta todos os aparelhos daquele login", async () => {
    const conta = await contaDeTeste();
    const celular = await entrar(conta.email, conta.senha);
    const computador = await entrar(conta.email, conta.senha);

    const { data, error } = await servico.rpc("encerrar_sessoes_do_login", {
      p_user_id: conta.id,
    });
    expect(error).toBeNull();
    expect(data).toBe(2);

    // O porteiro (proxy.ts) chama getUser a cada página: o token antigo não vale mais...
    const lido = await servico.auth.getUser(celular.sessao.access_token);
    expect(lido.data.user).toBeNull();
    // ... e não se renova.
    const renovado = await novoAnonimo().auth.refreshSession({
      refresh_token: computador.sessao.refresh_token,
    });
    expect(renovado.error?.code).toBe("refresh_token_not_found");
  });

  it("login sem sessão aberta: zero sessões encerradas, sem erro", async () => {
    const conta = await contaDeTeste();
    const { data, error } = await servico.rpc("encerrar_sessoes_do_login", {
      p_user_id: conta.id,
    });
    expect(error).toBeNull();
    expect(data).toBe(0);
  });

  it("nem o visitante nem um login chamam as duas funções", async () => {
    const conta = await contaDeTeste();
    const { cliente } = await entrar(conta.email, conta.senha);
    for (const chamador of [novoAnonimo(), cliente]) {
      const achar = await chamador.rpc("id_do_login_por_email", {
        p_email: conta.email,
      });
      expect(achar.error).not.toBeNull();
      const encerrar = await chamador.rpc("encerrar_sessoes_do_login", {
        p_user_id: conta.id,
      });
      expect(encerrar.error).not.toBeNull();
    }
  });
});
```

Rode `npx vitest run tests/isolamento/funcoes-de-login.test.ts` → esperado: FALHA (as funções não existem).

- [ ] **Passo 6: Teste da visão da lista (falha)**

Crie `tests/isolamento/visao-do-admin.test.ts`:

```ts
// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  comoAutenticado,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";

type Linha = { id: string; estado: string | null; versao_scc: string | null };

describe("visão restaurantes_no_admin (lista do admin)", () => {
  let banco: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
    // Horas diferentes de propósito: na mesma instrução o now() é igual e a
    // ordem do "último envio" ficaria empatada.
    await banco.query(
      `insert into public.envios (restaurante_id, recebido_em, http_status, versao_scc)
       values ($1, now() - interval '1 hour', 200, '5.1.8'),
              ($1, now(), 200, '5.2.1'),
              ($2, now(), 200, '5.1.8')`,
      [fixture.restauranteA, fixture.restauranteB]
    );
    await banco.query(
      `insert into public.sinal_de_vida (restaurante_id, primeiro_envio_em, ultimo_envio_ok_em, estado)
       values ($1, now(), now(), 'em_dia')`,
      [fixture.restauranteA]
    );
  });

  afterAll(async () => {
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      await banco?.end();
    }
  });

  const ler = (quem: string) =>
    comoAutenticado(banco, quem, () =>
      banco.query<Linha>(
        `select id::text, estado, versao_scc from public.restaurantes_no_admin
          where id = any($1::uuid[]) order by nome`,
        [fixture.idsRestaurantes]
      )
    );

  it("roda com a permissão de quem consulta (security_invoker)", async () => {
    const { rows } = await banco.query<{ opcoes: string[] | null }>(
      "select reloptions as opcoes from pg_class where oid = 'public.restaurantes_no_admin'::regclass"
    );
    expect(rows[0]?.opcoes).toContain("security_invoker=true");
  });

  it("o admin vê as casas com o estado e a versão do SCC do último envio", async () => {
    expect((await ler(fixture.admin)).rows).toEqual([
      { id: fixture.restauranteA, estado: "em_dia", versao_scc: "5.2.1" },
      { id: fixture.restauranteB, estado: null, versao_scc: "5.1.8" },
    ]);
  });

  it("o dono vê só a casa dele, sem a versão (envios são só do admin)", async () => {
    expect((await ler(fixture.usuarioA)).rows).toEqual([
      { id: fixture.restauranteA, estado: "em_dia", versao_scc: null },
    ]);
  });

  it("login sem acesso não vê nada; sem login, nem pode consultar", async () => {
    expect((await ler(fixture.usuarioSemAcesso)).rows).toEqual([]);
    await banco.query("begin");
    try {
      await banco.query("set local role anon");
      await expect(
        banco.query("select 1 from public.restaurantes_no_admin")
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await banco.query("rollback");
    }
  });
});
```

Rode `npx vitest run tests/isolamento/visao-do-admin.test.ts` → esperado: FALHA (a visão não existe).

- [ ] **Passo 7: Listas de funções e privilégios (falham)**

Em `tests/isolamento/funcoes-fechadas.test.ts`, troque a constante `abertas` por:

```ts
const abertas = [
  { funcao: "atualizar_turnos(uuid, jsonb)", anon: false, authenticated: true },
  // Rodam dentro das restrições de `restaurantes`: o Postgres confere o
  // EXECUTE de quem grava (o admin, pelo login). São puras, sem ler tabela.
  { funcao: "cnpj_valido(text)", anon: false, authenticated: true },
  { funcao: "eh_admin_repply()", anon: true, authenticated: true },
  {
    funcao: "horario_funcionamento_valido(jsonb)",
    anon: false,
    authenticated: true,
  },
  // Conferem eh_admin_repply() por dentro (D-38).
  { funcao: "revogar_tokens_envio(uuid)", anon: false, authenticated: true },
  { funcao: "tem_acesso(uuid)", anon: true, authenticated: true },
  {
    funcao: "trocar_token_envio(uuid, text, text, text)",
    anon: false,
    authenticated: true,
  },
];
```

Em `tests/isolamento/rpc-privilegada.test.ts`:
- na constante `funcoesReservadas`, depois de `"public.atualizar_estados()",`, acrescente `"public.id_do_login_por_email(text)",` e `"public.encerrar_sessoes_do_login(uuid)",`;
- no teste `"recusa execução real para anon e authenticated, inclusive admin"`, na lista `chamadas`, acrescente `"select public.id_do_login_por_email(null::text)",` e `"select public.encerrar_sessoes_do_login(null::uuid)",`.

Em `tests/isolamento/todas-as-tabelas.test.ts`, logo antes de `describe("isolamento nas 8 tabelas", ...)`, acrescente:

```ts
const CRUD = ["DELETE", "INSERT", "SELECT", "UPDATE"];
const SO_RLS = { anon: CRUD, authenticated: CRUD };

/**
 * Privilégios de `anon` e `authenticated` em cada tabela e visão de `public`
 * (pendência 14). Nas 8 tabelas antigas a RLS decide quem lê e escreve;
 * esvaziar a tabela inteira (TRUNCATE), criar gatilho, referência e manutenção
 * saíram. As peças da etapa 3 nascem só com o que o produto usa. Tabela nova
 * entra aqui DE PROPÓSITO.
 */
const PRIVILEGIOS: Record<string, { anon: string[]; authenticated: string[] }> = {
  acessos: SO_RLS,
  admins_repply: SO_RLS,
  entradas: SO_RLS,
  envios: SO_RLS,
  metas: SO_RLS,
  registro_admin: { anon: [], authenticated: ["INSERT", "SELECT"] },
  restaurantes: SO_RLS,
  restaurantes_no_admin: { anon: [], authenticated: ["SELECT"] },
  sinal_de_vida: SO_RLS,
  tokens_envio: SO_RLS,
};

const CONSULTA_PRIVILEGIOS = `
  select c.relname as tabela, r.papel,
         array(select p from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE',
                                          'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) as p
                where has_table_privilege(r.papel, c.oid, p) order by p) as privilegios
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) as r(papel)
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')`;

describe("privilégios explícitos (pendência 14)", () => {
  let banco: Client;

  beforeAll(async () => {
    banco = await conectarBanco();
  });

  afterAll(async () => {
    await banco?.end();
  });

  it("anon e authenticated têm exatamente os privilégios da lista", async () => {
    const { rows } = await banco.query<{
      tabela: string;
      papel: "anon" | "authenticated";
      privilegios: string[];
    }>(CONSULTA_PRIVILEGIOS);
    const lido: Record<string, { anon: string[]; authenticated: string[] }> = {};
    for (const { tabela, papel, privilegios } of rows) {
      const linha = lido[tabela] ?? { anon: [], authenticated: [] };
      linha[papel] = privilegios;
      lido[tabela] = linha;
    }
    expect(lido).toEqual(PRIVILEGIOS);
  });

  it("tabela criada daqui em diante nasce sem TRUNCATE, REFERENCES, TRIGGER e MAINTAIN", async () => {
    await banco.query("begin");
    try {
      await banco.query("create table public.rf_teste_privilegios (id int)");
      const { rows } = await banco.query<{ papel: string; privilegios: string[] }>(
        `select r.papel,
                array(select p from unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) as p
                       where has_table_privilege(r.papel, 'public.rf_teste_privilegios', p)) as privilegios
           from (values ('anon'), ('authenticated')) as r(papel)`
      );
      expect(rows).toEqual([
        { papel: "anon", privilegios: [] },
        { papel: "authenticated", privilegios: [] },
      ]);
    } finally {
      await banco.query("rollback");
    }
  });
});
```

Rode `npx vitest run tests/isolamento/funcoes-fechadas.test.ts tests/isolamento/rpc-privilegada.test.ts tests/isolamento/todas-as-tabelas.test.ts` → esperado: FALHA nos testes alterados e no de privilégios.

- [ ] **Passo 8: A migration**

Crie `supabase/migrations/20261015120000_admin_da_repply.sql`:

```sql
-- Etapa 3 · Admin da Repply
-- (desenho: docs/superpowers/specs/2026-10-14-etapa-3-admin-design.md §2)
--
--   1. o banco confere o cadastro do restaurante: horário de funcionamento
--      (D-56), fuso do Brasil e CNPJ (D-60). Resolve a pendência 9;
--   2. histórico das ações do admin, registro_admin (D-59);
--   3. token de envio trocado numa transação só: trocar_token_envio e
--      revogar_tokens_envio (D-38);
--   4. funções da chave de serviço para os logins: id_do_login_por_email e
--      encerrar_sessoes_do_login (D-55);
--   5. visão da lista do admin, restaurantes_no_admin (security_invoker: a RLS
--      das tabelas vale para quem consulta);
--   6. privilégios explícitos nas tabelas (pendência 14).
--
-- Regras: nada de FORCE ROW LEVEL SECURITY; função nova nasce fechada e o grant
-- é dado aqui, de propósito (seguranca-e-isolamento.md §2, item 12).
begin;

-- ---------------------------------------------------------------------------
-- 1. Cadastro conferido pelo banco
-- ---------------------------------------------------------------------------

-- Horário de funcionamento (D-56): lista de { "dia": 0–6, "abre": "HH:MM",
-- "fecha": "HH:MM" } (0 = domingo); no máximo dois por dia; abre ≠ fecha; os
-- do mesmo dia não se sobrepõem; só o último do dia passa da meia-noite
-- (fecha < abre). Lista vazia continua aceita: quer dizer "sempre aberta" e
-- existe em cadastros antigos; o formulário do admin exige um dia aberto.
-- As horas são comparadas como texto: no formato HH:MM a ordem é a mesma, e
-- assim a função não converte nada (é imutável de verdade).
-- A mesma regra está em lib/admin/horario.ts (problemaNosIntervalos), e
-- tests/admin/espelho-do-banco.test.ts compara as duas.
create function public.horario_funcionamento_valido(p_horario jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  c_hora   constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  v_item   jsonb;
  v_dia    int;
  v_qtd    int;
  v_cruzou boolean;
  v_fim    text;
  v_abre   text;
  v_fecha  text;
begin
  if p_horario is null or jsonb_typeof(p_horario) <> 'array' then
    return false;
  end if;

  for v_item in select * from jsonb_array_elements(p_horario) loop
    if jsonb_typeof(v_item) <> 'object' then
      return false;
    end if;
    if not coalesce(
         (select array_agg(k order by k) from jsonb_object_keys(v_item) as k)
           = array['abre', 'dia', 'fecha']
         and jsonb_typeof(v_item -> 'dia') = 'number'
         and (v_item ->> 'dia') ~ '^[0-6]$'
         and jsonb_typeof(v_item -> 'abre') = 'string'
         and jsonb_typeof(v_item -> 'fecha') = 'string'
         and (v_item ->> 'abre') ~ c_hora
         and (v_item ->> 'fecha') ~ c_hora
         and (v_item ->> 'abre') <> (v_item ->> 'fecha'),
       false) then
      return false;
    end if;
  end loop;

  for v_dia in 0..6 loop
    v_qtd := 0;
    v_cruzou := false;
    v_fim := null;
    for v_abre, v_fecha in
      select e ->> 'abre', e ->> 'fecha'
        from jsonb_array_elements(p_horario) as e
       where (e ->> 'dia')::int = v_dia
       order by 1
    loop
      v_qtd := v_qtd + 1;
      -- terceiro do dia, ou um depois do que já passou da meia-noite
      if v_qtd > 2 or v_cruzou then
        return false;
      end if;
      -- começa antes de o anterior fechar
      if v_fim is not null and v_abre < v_fim then
        return false;
      end if;
      v_cruzou := v_fecha < v_abre;
      v_fim := v_fecha;
    end loop;
  end loop;

  return true;
end;
$$;

-- CNPJ (D-60): 14 caracteres sem pontuação; os 12 primeiros podem ter letras
-- maiúsculas (CNPJ alfanumérico da Receita, julho de 2026) e os 2 últimos são
-- os dígitos verificadores, calculados com o valor ASCII − 48 de cada
-- caractere. Todos iguais (00000000000000, 11111111111111…) não vale.
-- A mesma regra está em lib/admin/cnpj.ts.
create function public.cnpj_valido(p_cnpj text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  c_pesos1 constant int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  c_pesos2 constant int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  v_soma  int;
  v_resto int;
  v_dv1   int;
  v_dv2   int;
begin
  if p_cnpj is null
     or p_cnpj !~ '^[0-9A-Z]{12}[0-9]{2}$'
     or p_cnpj ~ '^(.)\1{13}$' then
    return false;
  end if;

  v_soma := 0;
  for i in 1..12 loop
    v_soma := v_soma + (ascii(substr(p_cnpj, i, 1)) - 48) * c_pesos1[i];
  end loop;
  v_resto := v_soma % 11;
  v_dv1 := case when v_resto < 2 then 0 else 11 - v_resto end;

  v_soma := 0;
  for i in 1..13 loop
    v_soma := v_soma + (ascii(substr(p_cnpj, i, 1)) - 48) * c_pesos2[i];
  end loop;
  v_resto := v_soma % 11;
  v_dv2 := case when v_resto < 2 then 0 else 11 - v_resto end;

  return substr(p_cnpj, 13, 1)::int = v_dv1
     and substr(p_cnpj, 14, 1)::int = v_dv2;
end;
$$;

-- As duas rodam DENTRO das restrições abaixo. O Postgres confere o EXECUTE de
-- quem grava, e quem grava é o admin pelo login (authenticated): sem este
-- grant, o cadastro do admin falha com "permission denied for function"
-- (medido no banco local em 15/10/2026). São puras, sem ler tabela.
grant execute on function public.horario_funcionamento_valido(jsonb) to authenticated, service_role;
grant execute on function public.cnpj_valido(text) to authenticated, service_role;

alter table public.restaurantes
  add constraint restaurantes_horario_funcionamento_valido
    check (public.horario_funcionamento_valido(horario_funcionamento)),
  -- Os fusos IANA do Brasil. A mesma lista está em lib/admin/fusos.ts.
  add constraint restaurantes_fuso_do_brasil
    check (fuso in (
      'America/Noronha', 'America/Belem', 'America/Fortaleza', 'America/Recife',
      'America/Araguaina', 'America/Maceio', 'America/Bahia', 'America/Sao_Paulo',
      'America/Santarem', 'America/Campo_Grande', 'America/Cuiaba',
      'America/Porto_Velho', 'America/Boa_Vista', 'America/Manaus',
      'America/Eirunepe', 'America/Rio_Branco'
    )),
  add constraint restaurantes_cnpj_valido
    check (cnpj is null or public.cnpj_valido(cnpj));

comment on column public.restaurantes.horario_funcionamento is
  '[{ "dia": 5, "abre": "11:00", "fecha": "02:00" }, ...] com 0 = domingo. Até dois por dia; só o último do dia passa da meia-noite (D-56). Conferido por horario_funcionamento_valido.';
comment on column public.restaurantes.cnpj is
  'Opcional (D-60). Sem pontuação, em maiúsculas; conferido por cnpj_valido e único.';

-- ---------------------------------------------------------------------------
-- 2. Histórico das ações do admin (D-59)
-- ---------------------------------------------------------------------------

create table public.registro_admin (
  id             bigint generated always as identity primary key,
  criado_em      timestamptz not null default now(),
  -- O admin que fez. Se a conta dele for apagada, o histórico fica (sem nome).
  autor          uuid references auth.users (id) on delete set null,
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  acao           text not null
                 constraint registro_admin_acao_valida check (acao in (
                   'cadastrou', 'editou_dados', 'gerou_token', 'revogou_token',
                   'criou_login', 'ligou_login', 'redefiniu_senha', 'trocou_email',
                   'pediu_reenvio', 'suspendeu', 'reativou', 'abriu_painel'
                 )),
  -- Texto curto, sem senha, token ou e-mail completo.
  detalhe        text constraint registro_admin_detalhe_curto
                 check (detalhe is null or char_length(detalhe) <= 200)
);

comment on table public.registro_admin is
  'Quem fez o quê em cada restaurante, pelo admin (D-59). Sem senha nem token. Ninguém altera nem apaga.';

create index registro_admin_restaurante_idx
  on public.registro_admin (restaurante_id, criado_em desc);

-- "abriu o painel do cliente" no máximo uma vez por hora por admin e casa.
-- date_trunc com o fuso explícito ('UTC') é imutável; o de dois argumentos
-- sobre timestamptz não é e o índice seria recusado.
create unique index registro_admin_abriu_painel_por_hora
  on public.registro_admin (autor, restaurante_id, date_trunc('hour', criado_em, 'UTC'))
  where acao = 'abriu_painel';

create trigger registro_admin_freeze_restaurante
  before update on public.registro_admin
  for each row execute function public.freeze_restaurante_id();

alter table public.registro_admin enable row level security;

create policy "admin lê o histórico" on public.registro_admin
  for select using (public.eh_admin_repply());
create policy "admin registra em nome próprio" on public.registro_admin
  for insert with check (public.eh_admin_repply() and autor = auth.uid());
-- sem update nem delete: ninguém altera nem apaga.

revoke all on public.registro_admin from anon, authenticated;
grant select, insert on public.registro_admin to authenticated;
-- Nem a chave de serviço altera o histórico. (Apagar o restaurante leva o
-- histórico junto pelo "on delete cascade", que roda como dono da tabela.)
revoke update, delete, truncate on public.registro_admin from service_role;

-- ---------------------------------------------------------------------------
-- 3. Token de envio (D-38)
-- ---------------------------------------------------------------------------

-- Troca numa transação só: os tokens válidos anteriores param agora
-- (revogado_em) ou em 24 h (expira_em, sem nunca esticar um prazo menor) e o
-- novo entra. Nunca fica sem token nem com dois "agora" por engano; dois admins
-- ao mesmo tempo entram em fila pela trava da linha do restaurante.
create function public.trocar_token_envio(
  p_restaurante uuid,
  p_hash text,
  p_prefixo text,
  p_antigo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_autor   uuid := auth.uid();
  v_antigos int;
  v_id      uuid;
begin
  if not public.eh_admin_repply() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  if p_antigo is null or p_antigo not in ('agora', '24h') then
    raise exception 'p_antigo deve ser agora ou 24h' using errcode = '22023';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
     or p_prefixo is null or p_prefixo !~ '^rf_[0-9A-Za-z]{4}$' then
    raise exception 'token malformado' using errcode = '22023';
  end if;

  perform 1 from public.restaurantes where id = p_restaurante for update;
  if not found then
    raise exception 'restaurante não encontrado' using errcode = 'P0002';
  end if;

  if p_antigo = 'agora' then
    update public.tokens_envio
       set revogado_em = now()
     where restaurante_id = p_restaurante
       and revogado_em is null
       and (expira_em is null or expira_em > now());
  else
    update public.tokens_envio
       set expira_em = least(coalesce(expira_em, 'infinity'::timestamptz),
                             now() + interval '24 hours')
     where restaurante_id = p_restaurante
       and revogado_em is null
       and (expira_em is null or expira_em > now());
  end if;
  get diagnostics v_antigos = row_count;

  insert into public.tokens_envio (restaurante_id, hash, prefixo, criado_por)
  values (p_restaurante, p_hash, p_prefixo, v_autor)
  returning id into v_id;

  insert into public.registro_admin (autor, restaurante_id, acao, detalhe)
  values (v_autor, p_restaurante, 'gerou_token',
          case when v_antigos = 0 then 'primeiro token'
               when p_antigo = 'agora' then 'o antigo parou na hora'
               else 'o antigo para em 24 h' end);

  return jsonb_build_object('token_id', v_id, 'antigos', v_antigos);
end;
$$;

-- Revoga todos os tokens válidos do restaurante. Zero tokens é erro: a tela
-- não pode dizer "revogado" quando não havia o que revogar.
create function public.revogar_tokens_envio(p_restaurante uuid)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_total integer;
begin
  if not public.eh_admin_repply() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  perform 1 from public.restaurantes where id = p_restaurante for update;
  if not found then
    raise exception 'restaurante não encontrado' using errcode = 'P0002';
  end if;

  update public.tokens_envio
     set revogado_em = now()
   where restaurante_id = p_restaurante
     and revogado_em is null
     and (expira_em is null or expira_em > now());
  get diagnostics v_total = row_count;

  if v_total = 0 then
    raise exception 'nenhum token válido' using errcode = 'P0001';
  end if;

  insert into public.registro_admin (autor, restaurante_id, acao, detalhe)
  values (auth.uid(), p_restaurante, 'revogou_token',
          case when v_total = 1 then '1 token' else v_total || ' tokens' end);

  return v_total;
end;
$$;

grant execute on function public.trocar_token_envio(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.revogar_tokens_envio(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Logins: só a chave de serviço (D-55)
-- ---------------------------------------------------------------------------

-- Acha a conta pelo e-mail sem listar todas as contas do Auth.
create function public.id_do_login_por_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select u.id
    from auth.users u
   where lower(u.email) = lower(btrim(p_email))
     and u.deleted_at is null
   order by u.created_at
   limit 1;
$$;

-- Desconecta todos os aparelhos de um login (redefinir senha). Apagar a sessão
-- leva junto os refresh tokens (on delete cascade). Zero é normal: o login
-- pode não estar aberto em lugar nenhum, e o próprio Auth já derruba as
-- sessões quando o admin troca a senha (GoTrue v2.197, medido em 15/10/2026).
create function public.encerrar_sessoes_do_login(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_total integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke execute on function public.id_do_login_por_email(text) from public, anon, authenticated;
revoke execute on function public.encerrar_sessoes_do_login(uuid) from public, anon, authenticated;
grant execute on function public.id_do_login_por_email(text) to service_role;
grant execute on function public.encerrar_sessoes_do_login(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Visão da lista do admin
-- ---------------------------------------------------------------------------

create view public.restaurantes_no_admin
with (security_invoker = true) as
select r.id,
       r.slug,
       r.nome,
       r.situacao,
       r.fuso,
       s.estado,
       s.ultimo_envio_ok_em,
       ultimo.versao_scc
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

comment on view public.restaurantes_no_admin is
  'Lista do admin: restaurante, estado do vigia e versão do SCC do último envio. security_invoker: a RLS das tabelas vale para quem consulta.';

revoke all on public.restaurantes_no_admin from anon, authenticated;
grant select on public.restaurantes_no_admin to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Privilégios explícitos (pendência 14)
-- ---------------------------------------------------------------------------

-- A RLS não cobre TRUNCATE (esvaziar a tabela inteira). Gatilho, referência e
-- manutenção (MAINTAIN, do Postgres 17) também não são do produto.
revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;

-- O que o produto usa, dado de propósito. A RLS continua decidindo quem.
grant select, insert, update, delete on public.restaurantes to authenticated;  -- admin cadastra, edita, suspende, pede reenvio
grant select, insert, update, delete on public.acessos to authenticated;       -- admin liga o login à casa
grant select on public.tokens_envio to authenticated;                          -- admin lê; a troca passa pelas funções da seção 3
grant select, insert, update, delete on public.metas to authenticated;         -- dono, em Ajustes (etapa 6)
grant select on public.admins_repply, public.envios, public.sinal_de_vida, public.entradas to authenticated;

commit;
```

- [ ] **Passo 9: Fixtures do vigia que a restrição nova recusaria**

Em `tests/rotinas/estados-retencao.test.ts`:

1. Logo depois dos `import`, acrescente:

```ts
/**
 * Casa aberta 24 horas no formato que o banco aceita desde a etapa 3 (abre ≠
 * fecha, até dois horários por dia): 00:00–12:00 e 12:00–00:00 em cada dia.
 */
const SEMPRE_ABERTO = Array.from({ length: 7 }, (_, dia) => [
  { dia, abre: "00:00", fecha: "12:00" },
  { dia, abre: "12:00", fecha: "00:00" },
]).flat();
```

2. No teste `"calcula em_dia, atrasado, parado, fechado e sem sinal…"`, troque o segundo parâmetro do primeiro `update public.restaurantes` (o `JSON.stringify(Array.from({ length: 7 }, (_, dia) => ({ dia, abre: "00:00", fecha: "00:00" })))`) por `JSON.stringify(SEMPRE_ABERTO)`.

3. No teste `"um restaurante com horário ou fuso malformado não impede o cálculo dos outros"`:
   - logo na primeira linha do corpo, antes de `await comSinaisEstaveis(`, acrescente:

```ts
    // Desde a etapa 3 o banco recusa horário e fuso malformados na gravação.
    // A defesa do vigia continua valendo para linhas gravadas antes disso: as
    // duas restrições saem só dentro da transação deste teste, desfeita no fim
    // (afterEach). Fora da trava curta do vigia, para não esbarrar no limite
    // de 250 ms de espera.
    await (banco as Client).query(
      "alter table public.restaurantes drop constraint restaurantes_horario_funcionamento_valido, drop constraint restaurantes_fuso_do_brasil"
    );
```

   - no segundo `update` desse teste (o do fuso `'Marte/Olimpo'`), troque o `JSON.stringify(Array.from({ length: 7 }, (_, dia) => ({ dia, abre: "00:00", fecha: "00:00" })))` por `JSON.stringify(SEMPRE_ABERTO)`.

- [ ] **Passo 10: Aplicar a migration no banco local**

```bash
npx supabase migration up --local
npx supabase migration list --local
```

Esperado: `20261015120000` aplicada. Se ela falhar, nada muda (está num `begin … commit`): leia o erro, corrija o arquivo novo e rode de novo. (A migration foi aplicada e desfeita numa transação no banco local em 15/10/2026, com estes resultados: troca "agora" e "24h", revogação, recusa do dono e do anônimo, restrições, visão, índice do "abriu o painel", lista de funções abertas e privilégios iguais aos dos testes.)

Se um teste que chama a API (`servico.rpc(...)`) disser que a função não existe (`PGRST202`), recarregue o cache da API do banco local:

```bash
node --input-type=module -e "import pg from 'pg'; const c = new pg.Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres'); await c.connect(); await c.query(\"notify pgrst, 'reload schema'\"); await c.end();"
```

- [ ] **Passo 11: Rodar os testes do banco**

```bash
npx vitest run tests/isolamento tests/rotinas tests/helpers
```

Esperado: tudo passa. Se aparecer `over_request_rate_limit`/`429` no login de teste (o Auth local aceita 30 entradas a cada 5 min), espere 5 minutos e rode de novo; não é defeito.

- [ ] **Passo 12: Tipos do banco**

```bash
npm run types -- --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
git diff --stat types/database.types.ts
```

Esperado: "Tipos válidos; destino substituído atomicamente." e o arquivo com `registro_admin`, `restaurantes_no_admin` e as seis funções novas.

- [ ] **Passo 13: Verificação completa e commit**

```bash
npx biome check --write tests/isolamento tests/rotinas
npx tsc --noEmit
npx vitest run
git fetch && git status -sb && git status --short
git add supabase/migrations/20261015120000_admin_da_repply.sql types/database.types.ts tests/isolamento/cadastro-validado.test.ts tests/isolamento/tokens-de-envio.test.ts tests/isolamento/registro-admin.test.ts tests/isolamento/funcoes-de-login.test.ts tests/isolamento/visao-do-admin.test.ts tests/isolamento/funcoes-fechadas.test.ts tests/isolamento/rpc-privilegada.test.ts tests/isolamento/todas-as-tabelas.test.ts tests/rotinas/aberto-desde.test.ts tests/rotinas/estados-retencao.test.ts
git commit -m "Valida o cadastro no banco e cria o histórico, a troca de token, as funções de login e a visão do admin" -m "Co-Authored-By: <trailer do seu modelo>"
```

Esperado: tipos limpos; suíte inteira verde (43 arquivos).

---

## Tarefa 2: Funções puras do admin  *(paralela à Tarefa 3)*

**Por quê:** tudo o que o admin calcula sem tocar no banco fica em funções pequenas e testadas: token e hash (o mesmo cálculo da recepção), senha provisória, CNPJ, endereço (`slug`), fusos, horário (espelho do banco e resumo), ordem e contadores da lista, datas no fuso da casa, mensagens para a SCC e para o WhatsApp, textos do histórico e dos envios, e os esquemas dos formulários.

**Arquivos (lista fechada):**
- Criar: `lib/admin/token.ts`, `lib/admin/senha-provisoria.ts`, `lib/admin/cnpj.ts`, `lib/admin/slug.ts`, `lib/admin/fusos.ts`, `lib/admin/horario.ts`, `lib/admin/lista.ts`, `lib/admin/datas.ts`, `lib/admin/texto.ts`, `lib/admin/mensagens.ts`, `lib/admin/envios.ts`, `lib/admin/historico.ts`, `lib/admin/schemas.ts`, `supabase/functions/_shared/token.ts`
- Modificar: `supabase/functions/receber-envio/index.ts` (só trocar a função local `sha256Hex` pelo import)
- Testes (criar): `tests/admin/token.test.ts`, `tests/admin/senha-provisoria.test.ts`, `tests/admin/cnpj.test.ts`, `tests/admin/slug.test.ts`, `tests/admin/horario.test.ts`, `tests/admin/lista.test.ts`, `tests/admin/datas.test.ts`, `tests/admin/textos.test.ts`, `tests/admin/schemas.test.ts`, `tests/admin/espelho-do-banco.test.ts`

**Interfaces consumidas:** Tarefa 1 (funções `horario_funcionamento_valido`, `cnpj_valido`, restrições `restaurantes_fuso_do_brasil` e `registro_admin_acao_valida`, só no teste de espelho). Do código existente: `entrarSchema` (`@/lib/auth/schemas`), `EstadoSinal` (`@/lib/painel/selo`), `SENHA_MINIMA` (`@/lib/auth/senha`).

**Interfaces produzidas (as Tarefas 4 a 7 usam; nomes e tipos exatos):**
- `@/lib/admin/token` (só servidor, usa `node:crypto`): `PREFIXO_DO_TOKEN = "rf_"`, `gerarToken(): string`, `hashDoToken(token: string): string`, `prefixoDoToken(token: string): string`.
- `supabase/functions/_shared/token.ts`: `sha256Hex(texto: string): Promise<string>`.
- `@/lib/admin/senha-provisoria` (só servidor): `ALFABETO_DA_SENHA: string`, `TAMANHO_DA_SENHA = 12`, `gerarSenhaProvisoria(): string`.
- `@/lib/admin/cnpj`: `limparCnpj(texto: string): string`, `cnpjValido(cnpj: string): boolean`, `formatarCnpj(cnpj: string): string`.
- `@/lib/admin/slug`: `slugDoNome(nome: string): string`, `slugLivre(base: string, ocupados: readonly string[]): string`.
- `@/lib/admin/fusos`: `FUSO_PADRAO = "America/Fortaleza"`, `FUSOS_DO_BRASIL: readonly { valor: string; rotulo: string }[]`, `ehFusoDoBrasil(valor: string): boolean`, `rotuloDoFuso(valor: string): string`.
- `@/lib/admin/horario`: tipos `Intervalo = { dia: number; abre: string; fecha: string }`, `ModoDoDia = "fechado" | "um" | "dois"`, `DiaDoFormulario = { modo: ModoDoDia; abre1: string; fecha1: string; abre2: string; fecha2: string }`; `DIAS_DA_SEMANA: readonly { dia: number; curto: string; longo: string }[]` (índice = dia, 0 = domingo), `DIA_FECHADO: DiaDoFormulario`, `intervalosSchema` (zod), `problemaNosIntervalos(intervalos: readonly Intervalo[]): string | null`, `intervalosDoDia(dia: number, d: DiaDoFormulario): Intervalo[]`, `problemaNoDia(d: DiaDoFormulario): string | null`, `intervalosDoFormulario(dias: readonly DiaDoFormulario[]): Intervalo[]`, `formularioDosIntervalos(intervalos: readonly Intervalo[]): DiaDoFormulario[]`, `formatarHora(hhmm: string): string` (`"05:00"` → `"5h"`, `"11:30"` → `"11h30"`), `resumoDoHorario(intervalos: readonly Intervalo[]): string`.
- `@/lib/admin/lista`: tipos `LinhaDaLista = { id: string; slug: string; nome: string; situacao: "ativo" | "suspenso"; fuso: string; estado: EstadoSinal | null; ultimoEnvioOkEm: string | null; versaoScc: string | null }`, `GrupoDaLista`; `ORDEM_DE_ATENCAO`, `grupoDaLinha(l: Pick<LinhaDaLista, "situacao" | "estado">): GrupoDaLista`, `ordenarParaAtencao<T extends LinhaDaLista>(linhas: readonly T[]): T[]`, `contadoresDaLista(linhas: readonly LinhaDaLista[]): string[]`.
- `@/lib/admin/datas`: `hojeNaCasa(agora: Date, fuso: string): string` (`"AAAA-MM-DD"`), `horaNaCasa(iso: string, fuso: string): string`, `dataCurtaNaCasa(iso: string, fuso: string): string` (`"02/10"`), `dataEHoraNaCasa(iso: string, fuso: string): string` (`"14/10 21:03"`), `momentoNaCasa(iso: string | null, agora: Date, fuso: string): string` (`"hoje 21:03"`, `"ontem 22:10"`, `"02/10 12:00"`, `"31/12/2025 12:00"`, `"—"`), `dataBr(dia: string): string`, `diaCurto(dia: string): string`, `diaValido(dia: string): boolean`, `somarDias(dia: string, n: number): string`.
- `@/lib/admin/texto`: `plural(n: number, um: string, varios: string): string`, `mascararToken(prefixo: string): string` (`"rf_8f3k••••"`), `mascararEmail(email: string): string` (`"do…@bardoze.com.br"`).
- `@/lib/admin/mensagens`: `enderecoDaRecepcao(urlDoSupabase: string): string`, `instrucoesParaScc(e: { nome: string; endereco: string; token: string; intervaloSegundos: number }): string`, `mensagemDoLogin(e: { endereco: string; email: string; senha: string }): string`, `mensagemDaEdicao(r: { recalculou: boolean; mudouFuso: boolean } | undefined): string`, `avisoDeLoginLigado(outrasCasas: number): string`, `avisoDeOutrasCasas(outrasCasas: number, oQueMuda: "senha" | "email"): string`.
- `@/lib/admin/envios`: tipo `EnvioResumo = { id: number; recebidoEm: string; httpStatus: number; erro: string | null; recebidas: number | null; gravadas: number | null; inalteradas: number | null; removidas: number | null; versaoScc: string | null; camposDesconhecidos: string[] }`; `envioOk(e)`, `contagensDoEnvio(e)`, `detalheDoEnvio(e)`, `camposNovosDoEnvio(e): string | null`.
- `@/lib/admin/historico`: `ACOES_ADMIN` (as 12), tipo `AcaoAdmin`, `acaoAdmin(valor: string): AcaoAdmin | null`, tipo `RegistroDoHistorico = { id: number; criadoEm: string; autor: string; acao: AcaoAdmin; detalhe: string | null }` (`autor` já é o nome mostrado), `textoDaAcao(acao: AcaoAdmin, detalhe: string | null): string`, `nomeDoAutor(u: { nome?: unknown; email?: string | null } | null): string`, `linhaDoHistorico(r: RegistroDoHistorico, fuso: string): string`.
- `@/lib/admin/schemas`: `restauranteSchema` (zod) e `RestauranteInput = { nome: string; cnpj: string; fuso: string; horaVirada: string; dias: DiaDoFormulario[] }` (`horaVirada` é `"0"`…`"23"`; `dias` tem 7 posições, índice = dia), `VALORES_INICIAIS: RestauranteInput`, tipo `DadosDoRestaurante = { nome: string; cnpj: string | null; fuso: string; hora_virada: string; horario_funcionamento: Intervalo[] }`, `paraOBanco(d: RestauranteInput): DadosDoRestaurante`, `formularioDoRestaurante(r: { nome: string; cnpj: string | null; fuso: string; hora_virada: string; horario_funcionamento: unknown }): RestauranteInput`, `emailSchema` e `EmailInput = { email: string }`, `DIAS_MAXIMOS_DO_REENVIO = 120`, `primeiroDiaDoReenvio(hoje: string): string`, `problemaNoReenvio(desde: string, hoje: string): string | null`.

- [ ] **Passo 1: Testes do token, da senha, do CNPJ e do endereço (falham)**

Crie `tests/admin/token.test.ts`:

```ts
// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  gerarToken,
  hashDoToken,
  prefixoDoToken,
} from "../../lib/admin/token";
import { sha256Hex } from "../../supabase/functions/_shared/token";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  envelope,
  enviar,
  limparFixture,
} from "../helpers/supabase-local";

describe("token de envio (D-03, D-38)", () => {
  it("é rf_ seguido de 32 caracteres em base62", () => {
    for (let i = 0; i < 200; i++) {
      expect(gerarToken()).toMatch(/^rf_[0-9A-Za-z]{32}$/);
    }
  });

  it("não se repete", () => {
    expect(new Set(Array.from({ length: 500 }, () => gerarToken())).size).toBe(500);
  });

  it("o prefixo guardado é rf_ + 4 caracteres", () => {
    const token = gerarToken();
    expect(prefixoDoToken(token)).toBe(token.slice(0, 7));
    expect(prefixoDoToken(token)).toMatch(/^rf_[0-9A-Za-z]{4}$/);
  });

  it.each(["rf_abc", "rf_ÁÇãõ€", "", "rf_8f3kQ2abcdefghijABCDEFGHIJ0123"])(
    "o hash do admin é o mesmo da recepção para %j",
    async (token) => {
      expect(hashDoToken(token)).toBe(await sha256Hex(token));
      expect(hashDoToken(token)).toMatch(/^[0-9a-f]{64}$/);
    }
  );
});

describe("token gerado pelo admin entra na recepção de verdade", () => {
  let banco: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
  });

  afterAll(async () => {
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      await banco?.end();
    }
  });

  it("receber-envio aceita o token pelo hash que o admin gravou", async () => {
    const token = gerarToken();
    await banco.query(
      "insert into public.tokens_envio (restaurante_id, hash, prefixo) values ($1, $2, $3)",
      [fixture.restauranteA, hashDoToken(token), prefixoDoToken(token)]
    );
    const resposta = await enviar(token, envelope([]));
    expect(resposta.status).toBe(200);
  });
});
```

Crie `tests/admin/senha-provisoria.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ALFABETO_DA_SENHA,
  TAMANHO_DA_SENHA,
  gerarSenhaProvisoria,
} from "../../lib/admin/senha-provisoria";
import { SENHA_MINIMA } from "../../lib/auth/senha";

describe("senha provisória (D-55)", () => {
  it("o alfabeto não tem os caracteres que se confundem", () => {
    for (const ambiguo of ["0", "O", "1", "l", "I"]) {
      expect(ALFABETO_DA_SENHA).not.toContain(ambiguo);
    }
  });

  it("tem 12 caracteres do alfabeto, letra e número, e passa a regra de senha", () => {
    for (let i = 0; i < 300; i++) {
      const senha = gerarSenhaProvisoria();
      expect(senha).toHaveLength(TAMANHO_DA_SENHA);
      expect([...senha].every((c) => ALFABETO_DA_SENHA.includes(c))).toBe(true);
      expect(senha).toMatch(/[A-Za-z]/);
      expect(senha).toMatch(/[0-9]/);
      expect(senha.length).toBeGreaterThanOrEqual(SENHA_MINIMA);
    }
  });

  it("não se repete", () => {
    expect(
      new Set(Array.from({ length: 500 }, () => gerarSenhaProvisoria())).size
    ).toBe(500);
  });
});
```

Crie `tests/admin/cnpj.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cnpjValido, formatarCnpj, limparCnpj } from "../../lib/admin/cnpj";

describe("CNPJ (D-60)", () => {
  it.each([
    ["12.345.678/0001-95", "12345678000195"],
    ["12.abc.345/01de-35", "12ABC34501DE35"],
    [" 98765432000198 ", "98765432000198"],
  ])("limpa %j para %j", (texto, limpo) => {
    expect(limparCnpj(texto)).toBe(limpo);
  });

  it.each(["12345678000195", "98765432000198", "12ABC34501DE35"])(
    "%s é válido (o último é o exemplo alfanumérico da Receita)",
    (cnpj) => {
      expect(cnpjValido(cnpj)).toBe(true);
    }
  );

  it.each([
    "12345678000190",
    "11111111111111",
    "00000000000000",
    "1234567800019",
    "1234567800019A",
    "12abc34501de35",
    "12.345.678/0001-95",
    "",
  ])("%j é inválido", (cnpj) => {
    expect(cnpjValido(cnpj)).toBe(false);
  });

  it("formata com a pontuação de sempre", () => {
    expect(formatarCnpj("12345678000195")).toBe("12.345.678/0001-95");
    expect(formatarCnpj("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
    expect(formatarCnpj("123")).toBe("123");
  });
});
```

Crie `tests/admin/slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slugDoNome, slugLivre } from "../../lib/admin/slug";

describe("endereço da casa (slug)", () => {
  it.each([
    ["Bar do Zé", "bar-do-ze"],
    ["Ação & Companhia — Pão", "acao-companhia-pao"],
    ["  Cantina   da Praça!! ", "cantina-da-praca"],
    ["Forno 2 Lenha", "forno-2-lenha"],
    ["!!!", "restaurante"],
  ])("%j vira %j", (nome, slug) => {
    expect(slugDoNome(nome)).toBe(slug);
  });

  it("corta em 60 caracteres sem deixar hífen no fim", () => {
    const slug = slugDoNome(`${"a".repeat(59)} bcd`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("põe número no fim quando o endereço já existe", () => {
    expect(slugLivre("bar-do-ze", [])).toBe("bar-do-ze");
    expect(slugLivre("bar-do-ze", ["bar-do-ze"])).toBe("bar-do-ze-2");
    expect(
      slugLivre("bar-do-ze", ["bar-do-ze", "bar-do-ze-2", "bar-do-zebra"])
    ).toBe("bar-do-ze-3");
  });
});
```

Rode `npx vitest run tests/admin/token.test.ts tests/admin/senha-provisoria.test.ts tests/admin/cnpj.test.ts tests/admin/slug.test.ts` → esperado: FALHA (módulos não existem).

- [ ] **Passo 2: `sha256Hex` num lugar só, token, senha, CNPJ e endereço**

Crie `supabase/functions/_shared/token.ts`:

```ts
/**
 * SHA-256 em hex do token do SCC. A recepção (`receber-envio`) procura o token
 * por este valor, e o admin grava o mesmo valor ao gerar (`lib/admin/token.ts`).
 * `tests/admin/token.test.ts` compara os dois cálculos.
 */
export async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(texto)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
```

Em `supabase/functions/receber-envio/index.ts`:
- apague a função local inteira `async function sha256Hex(texto: string): Promise<string> { … }`;
- logo abaixo de `import { registrarErroNoBanco } from "../_shared/registro-erro.ts";`, acrescente `import { sha256Hex } from "../_shared/token.ts";`.

A função servida recarrega sozinha; confira `curl --max-time 5 -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:54321/functions/v1/receber-envio` → `405`.

Crie `lib/admin/token.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

/**
 * Token de envio do SCC (D-03, D-38): `rf_` + 32 caracteres aleatórios em
 * base62. Só o SHA-256 em hex vai para o banco, pelo MESMO cálculo da recepção
 * (`sha256Hex`, em `supabase/functions/_shared/token.ts`).
 */
export const PREFIXO_DO_TOKEN = "rf_";

const BASE62 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const TAMANHO_ALEATORIO = 32;
/** Maior múltiplo de 62 que cabe num byte: acima disso o byte é descartado, sem viés. */
const LIMITE_SEM_VIES = 248;

export function gerarToken(): string {
  let aleatorio = "";
  while (aleatorio.length < TAMANHO_ALEATORIO) {
    for (const byte of randomBytes(64)) {
      if (byte < LIMITE_SEM_VIES && aleatorio.length < TAMANHO_ALEATORIO) {
        aleatorio += BASE62.charAt(byte % 62);
      }
    }
  }
  return `${PREFIXO_DO_TOKEN}${aleatorio}`;
}

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Os 7 primeiros caracteres (`rf_` + 4), guardados para reconhecer o token no admin. */
export function prefixoDoToken(token: string): string {
  return token.slice(0, 7);
}
```

Crie `lib/admin/senha-provisoria.ts`:

```ts
import { randomInt } from "node:crypto";

/**
 * Senha provisória do login do cliente (D-55): gerada pelo sistema, mostrada
 * uma vez ao admin e mandada por WhatsApp. Sem os caracteres que se confundem
 * ao ditar ou ler (0/O, 1/l/I).
 */
export const ALFABETO_DA_SENHA =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export const TAMANHO_DA_SENHA = 12;

export function gerarSenhaProvisoria(): string {
  for (;;) {
    let senha = "";
    for (let i = 0; i < TAMANHO_DA_SENHA; i++) {
      senha += ALFABETO_DA_SENHA.charAt(randomInt(ALFABETO_DA_SENHA.length));
    }
    if (/[A-Za-z]/.test(senha) && /[0-9]/.test(senha)) return senha;
  }
}
```

Crie `lib/admin/cnpj.ts`:

```ts
/**
 * CNPJ (D-60): opcional; quando preenchido, é conferido e não repete. Aceita o
 * formato numérico e o alfanumérico da Receita (julho de 2026: letras nas 12
 * primeiras posições; os 2 dígitos verificadores são calculados com o código
 * ASCII − 48 de cada caractere). A mesma regra está em `cnpj_valido`, no banco.
 */
const PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Sem pontuação nem espaço, em maiúsculas: é assim que o banco grava. */
export function limparCnpj(texto: string): string {
  return texto.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function digito(base: string, pesos: readonly number[]): number {
  let soma = 0;
  pesos.forEach((peso, i) => {
    soma += (base.charCodeAt(i) - 48) * peso;
  });
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Recebe o CNPJ já limpo (`limparCnpj`). */
export function cnpjValido(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) {
    return false;
  }
  return (
    cnpj.charAt(12) === String(digito(cnpj, PESOS_1)) &&
    cnpj.charAt(13) === String(digito(cnpj, PESOS_2))
  );
}

export function formatarCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}
```

Crie `lib/admin/slug.ts`:

```ts
/**
 * Endereço da casa no painel (`/r/<slug>/hoje`). Sai do nome na criação e
 * NÃO muda depois: os links e favoritos do dono continuam valendo.
 */
export function slugDoNome(nome: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "restaurante";
}

/** O próprio `base` se estiver livre; senão `base-2`, `base-3`… */
export function slugLivre(base: string, ocupados: readonly string[]): string {
  const usados = new Set(ocupados);
  if (!usados.has(base)) return base;
  for (let numero = 2; ; numero++) {
    const candidato = `${base}-${numero}`;
    if (!usados.has(candidato)) return candidato;
  }
}
```

Rode os testes do Passo 1 → esperado: PASSA (o de recepção precisa do `405` da função).

- [ ] **Passo 3: Testes de fusos, horário, lista e datas (falham)**

Crie `tests/admin/horario.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DIA_FECHADO,
  type DiaDoFormulario,
  type Intervalo,
  formatarHora,
  formularioDosIntervalos,
  intervalosDoFormulario,
  problemaNoDia,
  problemaNosIntervalos,
  resumoDoHorario,
} from "../../lib/admin/horario";

const ter = (abre: string, fecha: string): Intervalo => ({ dia: 2, abre, fecha });

describe("horário de funcionamento (D-56)", () => {
  it.each([
    ["vazio", []],
    ["um", [ter("11:00", "15:00")]],
    ["almoço e jantar", [ter("11:00", "15:00"), ter("18:00", "02:00")]],
    ["fora de ordem", [ter("18:00", "02:00"), ter("11:00", "15:00")]],
    ["colados", [ter("00:00", "12:00"), ter("12:00", "00:00")]],
  ])("aceita %s", (_, intervalos) => {
    expect(problemaNosIntervalos(intervalos)).toBeNull();
  });

  it.each([
    ["três no dia", [ter("08:00", "09:00"), ter("10:00", "11:00"), ter("12:00", "13:00")], "No máximo dois horários por dia."],
    ["sobreposição", [ter("11:00", "15:00"), ter("14:00", "16:00")], "Os dois horários do mesmo dia não podem se sobrepor."],
    ["o primeiro cruza", [ter("01:00", "00:30"), ter("03:00", "04:00")], "Só o último horário do dia pode passar da meia-noite."],
    ["abre igual a fecha", [ter("11:00", "11:00")], "O horário de fechar não pode ser igual ao de abrir."],
    ["dia 7", [{ dia: 7, abre: "11:00", fecha: "15:00" }], "Dia da semana inválido."],
    ["hora sem zero", [ter("9:00", "15:00")], "Use horas no formato 00:00."],
  ])("recusa %s", (_, intervalos, mensagem) => {
    expect(problemaNosIntervalos(intervalos)).toBe(mensagem);
  });

  it("dia aberto com hora em branco pede para preencher", () => {
    expect(problemaNoDia({ ...DIA_FECHADO, modo: "um", fecha1: "" })).toBe(
      "Preencha a hora de abrir e a de fechar."
    );
    expect(problemaNoDia({ ...DIA_FECHADO, abre1: "" })).toBeNull();
  });

  it("vai do formulário para o banco e volta igual", () => {
    const dias: DiaDoFormulario[] = Array.from({ length: 7 }, () => ({ ...DIA_FECHADO }));
    dias[2] = { modo: "dois", abre1: "11:00", fecha1: "15:00", abre2: "18:00", fecha2: "02:00" };
    dias[5] = { ...DIA_FECHADO, modo: "um", abre1: "18:00", fecha1: "23:30" };
    const intervalos = intervalosDoFormulario(dias);
    expect(intervalos).toEqual([
      ter("11:00", "15:00"),
      ter("18:00", "02:00"),
      { dia: 5, abre: "18:00", fecha: "23:30" },
    ]);
    expect(formularioDosIntervalos(intervalos)).toEqual(dias);
  });

  it("o segundo horário guardado fora de ordem volta na ordem de abertura", () => {
    const dias = formularioDosIntervalos([ter("18:00", "02:00"), ter("11:00", "15:00")]);
    expect(dias[2]).toEqual({ modo: "dois", abre1: "11:00", fecha1: "15:00", abre2: "18:00", fecha2: "02:00" });
  });

  it.each([
    ["05:00", "5h"],
    ["11:30", "11h30"],
    ["00:00", "0h"],
    ["23:00", "23h"],
  ])("formata %s como %s", (hora, texto) => {
    expect(formatarHora(hora)).toBe(texto);
  });

  it("resume a semana a partir da segunda, juntando os dias iguais em sequência", () => {
    const tercaADomingo = [2, 3, 4, 5, 6, 0].flatMap((dia) => [
      { dia, abre: "11:00", fecha: "15:00" },
      { dia, abre: "18:00", fecha: "02:00" },
    ]);
    expect(resumoDoHorario(tercaADomingo)).toBe("ter–dom · 11h–15h e 18h–2h");
    const semanaEFimDeSemana = [
      ...[1, 2, 3, 4, 5].map((dia) => ({ dia, abre: "11:00", fecha: "15:00" })),
      ...[6, 0].map((dia) => ({ dia, abre: "11:00", fecha: "23:00" })),
    ];
    expect(resumoDoHorario(semanaEFimDeSemana)).toBe("seg–sex · 11h–15h; sáb–dom · 11h–23h");
    expect(resumoDoHorario([{ dia: 5, abre: "18:00", fecha: "02:00" }])).toBe("sex · 18h–2h");
    expect(
      resumoDoHorario([
        { dia: 1, abre: "11:00", fecha: "15:00" },
        { dia: 3, abre: "11:00", fecha: "15:00" },
      ])
    ).toBe("seg · 11h–15h; qua · 11h–15h");
    expect(resumoDoHorario([])).toBe("sem horário cadastrado");
  });
});
```

Crie `tests/admin/lista.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  type LinhaDaLista,
  contadoresDaLista,
  ordenarParaAtencao,
} from "../../lib/admin/lista";

const linha = (
  nome: string,
  estado: LinhaDaLista["estado"],
  situacao: LinhaDaLista["situacao"] = "ativo"
): LinhaDaLista => ({
  id: nome,
  slug: nome,
  nome,
  situacao,
  fuso: "America/Fortaleza",
  estado,
  ultimoEnvioOkEm: null,
  versaoScc: null,
});

const linhas = [
  linha("Bar do Zé", "em_dia"),
  linha("Zeca", "parado"),
  linha("Ana", "parado"),
  linha("Forno", "aguardando"),
  linha("Esquina", "fechado"),
  linha("Sumida", "em_dia", "suspenso"),
  linha("Cantina", "atrasado"),
  linha("Nova", null),
];

describe("lista do admin", () => {
  it("ordem de atenção: parado, atrasado, aguardando, em dia, fechado, suspenso; depois o nome", () => {
    expect(ordenarParaAtencao(linhas).map((l) => l.nome)).toEqual([
      "Ana",
      "Zeca",
      "Cantina",
      "Forno",
      "Nova",
      "Bar do Zé",
      "Esquina",
      "Sumida",
    ]);
  });

  it("não muda a lista recebida", () => {
    const copia = [...linhas];
    ordenarParaAtencao(linhas);
    expect(linhas).toEqual(copia);
  });

  it("contadores com o total e só os estados que existem", () => {
    expect(contadoresDaLista(linhas)).toEqual([
      "8 cadastrados",
      "1 em dia",
      "1 atrasado",
      "2 parados",
      "2 aguardando",
      "1 fechado",
      "1 suspenso",
    ]);
    expect(contadoresDaLista([linha("Única", "em_dia")])).toEqual([
      "1 cadastrado",
      "1 em dia",
    ]);
  });
});
```

Crie `tests/admin/datas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  dataBr,
  dataCurtaNaCasa,
  dataEHoraNaCasa,
  diaCurto,
  diaValido,
  hojeNaCasa,
  horaNaCasa,
  momentoNaCasa,
  somarDias,
} from "../../lib/admin/datas";

const fuso = "America/Fortaleza";
// Quarta 14/10/2026, 21:40 em Fortaleza (UTC−3); no servidor já é dia 15.
const agora = new Date("2026-10-15T00:40:00Z");

describe("datas no fuso da casa", () => {
  it("o dia de hoje é o da casa, não o do servidor", () => {
    expect(hojeNaCasa(agora, fuso)).toBe("2026-10-14");
  });

  it.each([
    ["2026-10-15T00:30:00Z", "hoje 21:30"],
    ["2026-10-14T03:10:00Z", "hoje 00:10"],
    ["2026-10-14T02:59:00Z", "ontem 23:59"],
    ["2026-10-02T15:00:00Z", "02/10 12:00"],
    ["2025-12-31T15:00:00Z", "31/12/2025 12:00"],
    [null, "—"],
    ["não é data", "—"],
  ])("%j aparece como %j", (iso, texto) => {
    expect(momentoNaCasa(iso, agora, fuso)).toBe(texto);
  });

  it("hora, data curta e data com hora", () => {
    expect(horaNaCasa("2026-10-15T00:30:00Z", fuso)).toBe("21:30");
    expect(dataCurtaNaCasa("2026-10-15T00:30:00Z", fuso)).toBe("14/10");
    expect(dataEHoraNaCasa("2026-10-15T00:03:00Z", fuso)).toBe("14/10 21:03");
  });

  it("fuso que não existe não derruba a tela (cai no fuso padrão)", () => {
    expect(horaNaCasa("2026-10-15T00:30:00Z", "Fuso/Inexistente")).toBe("21:30");
  });

  it("dias no formato do banco", () => {
    expect(dataBr("2026-10-01")).toBe("01/10/2026");
    expect(diaCurto("2026-10-01")).toBe("01/10");
    expect(diaValido("2026-02-28")).toBe(true);
    expect(diaValido("2026-02-30")).toBe(false);
    expect(diaValido("2026-2-28")).toBe(false);
    expect(somarDias("2026-10-14", -120)).toBe("2026-06-16");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
  });
});
```

Rode `npx vitest run tests/admin/horario.test.ts tests/admin/lista.test.ts tests/admin/datas.test.ts` → esperado: FALHA (módulos não existem).

- [ ] **Passo 4: Fusos, horário, lista, datas e textos**

Crie `lib/admin/fusos.ts`:

```ts
/**
 * Os fusos IANA do Brasil. A mesma lista está na restrição
 * `restaurantes_fuso_do_brasil` (migration 20261015120000), e
 * `tests/admin/espelho-do-banco.test.ts` compara as duas.
 */
export const FUSO_PADRAO = "America/Fortaleza";

export const FUSOS_DO_BRASIL: readonly { valor: string; rotulo: string }[] = [
  { valor: "America/Noronha", rotulo: "Fernando de Noronha (UTC−2)" },
  { valor: "America/Belem", rotulo: "Belém · PA leste e AP (UTC−3)" },
  { valor: "America/Fortaleza", rotulo: "Fortaleza · CE, RN, PB, PI e MA (UTC−3)" },
  { valor: "America/Recife", rotulo: "Recife · PE (UTC−3)" },
  { valor: "America/Araguaina", rotulo: "Araguaína · TO (UTC−3)" },
  { valor: "America/Maceio", rotulo: "Maceió · AL e SE (UTC−3)" },
  { valor: "America/Bahia", rotulo: "Salvador · BA (UTC−3)" },
  { valor: "America/Sao_Paulo", rotulo: "São Paulo · Sul, Sudeste, GO e DF (UTC−3)" },
  { valor: "America/Santarem", rotulo: "Santarém · PA oeste (UTC−3)" },
  { valor: "America/Campo_Grande", rotulo: "Campo Grande · MS (UTC−4)" },
  { valor: "America/Cuiaba", rotulo: "Cuiabá · MT (UTC−4)" },
  { valor: "America/Porto_Velho", rotulo: "Porto Velho · RO (UTC−4)" },
  { valor: "America/Boa_Vista", rotulo: "Boa Vista · RR (UTC−4)" },
  { valor: "America/Manaus", rotulo: "Manaus · AM leste (UTC−4)" },
  { valor: "America/Eirunepe", rotulo: "Eirunepé · AM oeste (UTC−5)" },
  { valor: "America/Rio_Branco", rotulo: "Rio Branco · AC (UTC−5)" },
];

export function ehFusoDoBrasil(valor: string): boolean {
  return FUSOS_DO_BRASIL.some((fuso) => fuso.valor === valor);
}

export function rotuloDoFuso(valor: string): string {
  return FUSOS_DO_BRASIL.find((fuso) => fuso.valor === valor)?.rotulo ?? valor;
}
```

Crie `lib/admin/horario.ts`:

```ts
import { z } from "zod";

/**
 * Horário de funcionamento (D-56). No banco: lista de { dia (0 = domingo),
 * abre, fecha } em "HH:MM"; até dois por dia; fecha < abre quer dizer que passa
 * da meia-noite, e só o último do dia pode passar. A mesma regra está em
 * `horario_funcionamento_valido` (migration 20261015120000), e
 * `tests/admin/espelho-do-banco.test.ts` compara as duas.
 */
export type Intervalo = { dia: number; abre: string; fecha: string };
export type ModoDoDia = "fechado" | "um" | "dois";
export type DiaDoFormulario = {
  modo: ModoDoDia;
  abre1: string;
  fecha1: string;
  abre2: string;
  fecha2: string;
};

/** Índice = dia (0 = domingo), na ordem do formulário: domingo a sábado. */
export const DIAS_DA_SEMANA: readonly { dia: number; curto: string; longo: string }[] = [
  { dia: 0, curto: "dom", longo: "Domingo" },
  { dia: 1, curto: "seg", longo: "Segunda" },
  { dia: 2, curto: "ter", longo: "Terça" },
  { dia: 3, curto: "qua", longo: "Quarta" },
  { dia: 4, curto: "qui", longo: "Quinta" },
  { dia: 5, curto: "sex", longo: "Sexta" },
  { dia: 6, curto: "sáb", longo: "Sábado" },
];

/** Horas já preenchidas para quando o dia passa a abrir (valem nos dois modos). */
export const DIA_FECHADO: DiaDoFormulario = {
  modo: "fechado",
  abre1: "11:00",
  fecha1: "15:00",
  abre2: "18:00",
  fecha2: "23:00",
};

const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
/** O resumo lê a semana a partir da segunda ("ter–dom"). */
const ORDEM_DO_RESUMO = [1, 2, 3, 4, 5, 6, 0];

/** Para ler o que veio do banco; o que não passar vira lista vazia. */
export const intervalosSchema = z.array(
  z
    .object({
      dia: z.number().int().min(0).max(6),
      abre: z.string().regex(HORA),
      fecha: z.string().regex(HORA),
    })
    .strict()
);

function porAbertura(a: Intervalo, b: Intervalo): number {
  if (a.abre === b.abre) return 0;
  return a.abre < b.abre ? -1 : 1;
}

/** `null` quando o banco aceitaria; senão, a frase para a tela. */
export function problemaNosIntervalos(intervalos: readonly Intervalo[]): string | null {
  for (const intervalo of intervalos) {
    if (!Number.isInteger(intervalo.dia) || intervalo.dia < 0 || intervalo.dia > 6) {
      return "Dia da semana inválido.";
    }
    if (!HORA.test(intervalo.abre) || !HORA.test(intervalo.fecha)) {
      return "Use horas no formato 00:00.";
    }
    if (intervalo.abre === intervalo.fecha) {
      return "O horário de fechar não pode ser igual ao de abrir.";
    }
  }
  for (let dia = 0; dia <= 6; dia++) {
    const doDia = intervalos.filter((i) => i.dia === dia).sort(porAbertura);
    if (doDia.length > 2) return "No máximo dois horários por dia.";
    const [primeiro, segundo] = doDia;
    if (primeiro && segundo) {
      if (primeiro.fecha < primeiro.abre) {
        return "Só o último horário do dia pode passar da meia-noite.";
      }
      if (segundo.abre < primeiro.fecha) {
        return "Os dois horários do mesmo dia não podem se sobrepor.";
      }
    }
  }
  return null;
}

export function intervalosDoDia(dia: number, d: DiaDoFormulario): Intervalo[] {
  if (d.modo === "fechado") return [];
  const primeiro = { dia, abre: d.abre1, fecha: d.fecha1 };
  if (d.modo === "um") return [primeiro];
  return [primeiro, { dia, abre: d.abre2, fecha: d.fecha2 }];
}

export function problemaNoDia(d: DiaDoFormulario): string | null {
  if (d.modo === "fechado") return null;
  const campos =
    d.modo === "um" ? [d.abre1, d.fecha1] : [d.abre1, d.fecha1, d.abre2, d.fecha2];
  if (campos.some((campo) => campo === "")) {
    return "Preencha a hora de abrir e a de fechar.";
  }
  return problemaNosIntervalos(intervalosDoDia(0, d));
}

/** `dias` tem 7 posições; o índice é o dia (0 = domingo). */
export function intervalosDoFormulario(dias: readonly DiaDoFormulario[]): Intervalo[] {
  return dias.flatMap((d, dia) => intervalosDoDia(dia, d));
}

export function formularioDosIntervalos(intervalos: readonly Intervalo[]): DiaDoFormulario[] {
  return DIAS_DA_SEMANA.map(({ dia }): DiaDoFormulario => {
    const [primeiro, segundo] = intervalos
      .filter((i) => i.dia === dia)
      .sort(porAbertura);
    if (!primeiro) return { ...DIA_FECHADO };
    if (!segundo) {
      return { ...DIA_FECHADO, modo: "um", abre1: primeiro.abre, fecha1: primeiro.fecha };
    }
    return {
      modo: "dois",
      abre1: primeiro.abre,
      fecha1: primeiro.fecha,
      abre2: segundo.abre,
      fecha2: segundo.fecha,
    };
  });
}

export function formatarHora(hhmm: string): string {
  const [hora = "0", minuto = "00"] = hhmm.split(":");
  const h = String(Number(hora));
  return minuto === "00" ? `${h}h` : `${h}h${minuto}`;
}

function horasDoDia(doDia: readonly Intervalo[]): string {
  return [...doDia]
    .sort(porAbertura)
    .map((i) => `${formatarHora(i.abre)}–${formatarHora(i.fecha)}`)
    .join(" e ");
}

/** Ex.: "ter–dom · 11h–15h e 18h–2h"; grupos diferentes separados por "; ". */
export function resumoDoHorario(intervalos: readonly Intervalo[]): string {
  if (intervalos.length === 0) return "sem horário cadastrado";
  const grupos: { dias: number[]; horas: string }[] = [];
  let anteriorAberto = false;
  for (const dia of ORDEM_DO_RESUMO) {
    const doDia = intervalos.filter((i) => i.dia === dia);
    if (doDia.length === 0) {
      anteriorAberto = false;
      continue;
    }
    const horas = horasDoDia(doDia);
    const ultimo = grupos.at(-1);
    if (anteriorAberto && ultimo && ultimo.horas === horas) ultimo.dias.push(dia);
    else grupos.push({ dias: [dia], horas });
    anteriorAberto = true;
  }
  const nome = (dia: number) => DIAS_DA_SEMANA[dia]?.curto ?? "";
  return grupos
    .map(({ dias, horas }) => {
      const primeiro = dias[0] ?? 0;
      const ultimo = dias.at(-1) ?? primeiro;
      const quando =
        dias.length === 1 ? nome(primeiro) : `${nome(primeiro)}–${nome(ultimo)}`;
      return `${quando} · ${horas}`;
    })
    .join("; ");
}
```

Crie `lib/admin/texto.ts`:

```ts
export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Depois de gerado, o token só aparece pelo começo (D-38). */
export function mascararToken(prefixo: string): string {
  return `${prefixo}••••`;
}

/** Para o histórico: nunca o e-mail completo (D-59). */
export function mascararEmail(email: string): string {
  const arroba = email.lastIndexOf("@");
  if (arroba <= 0) return "…";
  return `${email.slice(0, Math.min(2, arroba))}…${email.slice(arroba)}`;
}
```

Crie `lib/admin/lista.ts`:

```ts
import type { EstadoSinal } from "@/lib/painel/selo";
import { plural } from "./texto";

export type LinhaDaLista = {
  id: string;
  slug: string;
  nome: string;
  situacao: "ativo" | "suspenso";
  fuso: string;
  estado: EstadoSinal | null;
  ultimoEnvioOkEm: string | null;
  versaoScc: string | null;
};

export type GrupoDaLista = EstadoSinal | "suspenso";

/** Quem precisa de atenção primeiro, no celular e no computador (desenho §1.1). */
export const ORDEM_DE_ATENCAO: readonly GrupoDaLista[] = [
  "parado",
  "atrasado",
  "aguardando",
  "em_dia",
  "fechado",
  "suspenso",
];

const ORDEM_DOS_CONTADORES: readonly GrupoDaLista[] = [
  "em_dia",
  "atrasado",
  "parado",
  "aguardando",
  "fechado",
  "suspenso",
];

const ROTULOS: Record<GrupoDaLista, [string, string]> = {
  em_dia: ["em dia", "em dia"],
  atrasado: ["atrasado", "atrasados"],
  parado: ["parado", "parados"],
  aguardando: ["aguardando", "aguardando"],
  fechado: ["fechado", "fechados"],
  suspenso: ["suspenso", "suspensos"],
};

/** Suspenso vai para o fim seja qual for o estado; sem sinal é "aguardando". */
export function grupoDaLinha(l: Pick<LinhaDaLista, "situacao" | "estado">): GrupoDaLista {
  if (l.situacao === "suspenso") return "suspenso";
  return l.estado ?? "aguardando";
}

export function ordenarParaAtencao<T extends LinhaDaLista>(linhas: readonly T[]): T[] {
  return [...linhas].sort(
    (a, b) =>
      ORDEM_DE_ATENCAO.indexOf(grupoDaLinha(a)) - ORDEM_DE_ATENCAO.indexOf(grupoDaLinha(b)) ||
      a.nome.localeCompare(b.nome, "pt-BR")
  );
}

/** "5 cadastrados", "2 em dia", "1 atrasado"…: só os estados que existem. */
export function contadoresDaLista(linhas: readonly LinhaDaLista[]): string[] {
  const contagem = new Map<GrupoDaLista, number>();
  for (const linha of linhas) {
    const grupo = grupoDaLinha(linha);
    contagem.set(grupo, (contagem.get(grupo) ?? 0) + 1);
  }
  const textos = [plural(linhas.length, "cadastrado", "cadastrados")];
  for (const grupo of ORDEM_DOS_CONTADORES) {
    const total = contagem.get(grupo) ?? 0;
    if (total > 0) {
      const [um, varios] = ROTULOS[grupo];
      textos.push(plural(total, um, varios));
    }
  }
  return textos;
}
```

Crie `lib/admin/datas.ts`:

```ts
import { FUSO_PADRAO } from "./fusos";

/**
 * Datas e horas no fuso da CASA (CLAUDE.md §5), nunca no do servidor nem no
 * do navegador. Fuso inválido não derruba a tela: cai no fuso padrão.
 */
type Partes = { ano: string; mes: string; dia: string; hora: string; minuto: string };

function partes(momento: Date, fuso: string): Partes {
  const formatar = (zona: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: zona,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(momento);
  let lista: Intl.DateTimeFormatPart[];
  try {
    lista = formatar(fuso);
  } catch {
    lista = formatar(FUSO_PADRAO);
  }
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    lista.find((parte) => parte.type === tipo)?.value ?? "";
  return {
    ano: valor("year"),
    mes: valor("month"),
    dia: valor("day"),
    hora: valor("hour"),
    minuto: valor("minute"),
  };
}

function lerMomento(iso: string | null): Date | null {
  if (!iso) return null;
  const momento = new Date(iso);
  return Number.isNaN(momento.getTime()) ? null : momento;
}

export function hojeNaCasa(agora: Date, fuso: string): string {
  const p = partes(agora, fuso);
  return `${p.ano}-${p.mes}-${p.dia}`;
}

export function horaNaCasa(iso: string, fuso: string): string {
  const momento = lerMomento(iso);
  if (!momento) return "—";
  const p = partes(momento, fuso);
  return `${p.hora}:${p.minuto}`;
}

export function dataCurtaNaCasa(iso: string, fuso: string): string {
  const momento = lerMomento(iso);
  if (!momento) return "—";
  const p = partes(momento, fuso);
  return `${p.dia}/${p.mes}`;
}

export function dataEHoraNaCasa(iso: string, fuso: string): string {
  const momento = lerMomento(iso);
  if (!momento) return "—";
  const p = partes(momento, fuso);
  return `${p.dia}/${p.mes} ${p.hora}:${p.minuto}`;
}

/** "hoje 21:03", "ontem 22:10", "02/10 12:00", "31/12/2025 12:00" ou "—". */
export function momentoNaCasa(iso: string | null, agora: Date, fuso: string): string {
  const momento = lerMomento(iso);
  if (!momento) return "—";
  const p = partes(momento, fuso);
  const dia = `${p.ano}-${p.mes}-${p.dia}`;
  const hora = `${p.hora}:${p.minuto}`;
  if (dia === hojeNaCasa(agora, fuso)) return `hoje ${hora}`;
  if (dia === hojeNaCasa(new Date(agora.getTime() - 86_400_000), fuso)) {
    return `ontem ${hora}`;
  }
  if (p.ano === partes(agora, fuso).ano) return `${p.dia}/${p.mes} ${hora}`;
  return `${p.dia}/${p.mes}/${p.ano} ${hora}`;
}

/** "2026-10-01" → "01/10/2026". */
export function dataBr(dia: string): string {
  const [ano, mes, d] = dia.split("-");
  return `${d}/${mes}/${ano}`;
}

/** "2026-10-01" → "01/10". */
export function diaCurto(dia: string): string {
  const [, mes, d] = dia.split("-");
  return `${d}/${mes}`;
}

export function diaValido(dia: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const data = new Date(`${dia}T00:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === dia;
}

export function somarDias(dia: string, n: number): string {
  const data = new Date(`${dia}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + n);
  return data.toISOString().slice(0, 10);
}
```

Rode os testes do Passo 3 → esperado: PASSA.

- [ ] **Passo 5: Testes das mensagens, do histórico, dos envios e dos esquemas (falham)**

Crie `tests/admin/textos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  camposNovosDoEnvio,
  detalheDoEnvio,
  type EnvioResumo,
} from "../../lib/admin/envios";
import {
  acaoAdmin,
  linhaDoHistorico,
  nomeDoAutor,
  textoDaAcao,
} from "../../lib/admin/historico";
import {
  avisoDeLoginLigado,
  avisoDeOutrasCasas,
  enderecoDaRecepcao,
  instrucoesParaScc,
  mensagemDaEdicao,
  mensagemDoLogin,
} from "../../lib/admin/mensagens";
import { mascararEmail, mascararToken, plural } from "../../lib/admin/texto";

describe("mensagens prontas para copiar", () => {
  it("instruções para a SCC: o texto do roteiro de cadastro", () => {
    expect(
      instrucoesParaScc({
        nome: "Bar do Zé",
        endereco: "https://exemplo.supabase.co/functions/v1/receber-envio",
        token: "rf_TOKENDETESTE",
        intervaloSegundos: 300,
      })
    ).toBe(
      [
        "Olá! Seguem os dados do repply food. para o restaurante Bar do Zé:",
        "",
        "Endereço: https://exemplo.supabase.co/functions/v1/receber-envio",
        "Token: rf_TOKENDETESTE          (guardar só no arquivo de configuração do SCC)",
        "Intervalo: 300 segundos",
        "",
        "Por favor, façam a carga inicial do histórico (contrato de dados, §8) e",
        "nos avisem quando o restaurante estiver enviando. Qualquer erro aparece",
        "para nós no painel de administração.",
      ].join("\n")
    );
  });

  it("endereço da recepção a partir do endereço do Supabase", () => {
    expect(enderecoDaRecepcao("http://127.0.0.1:54321/")).toBe(
      "http://127.0.0.1:54321/functions/v1/receber-envio"
    );
  });

  it("mensagem para o WhatsApp do dono (D-55)", () => {
    expect(
      mensagemDoLogin({
        endereco: "https://food.repplyhub.com.br",
        email: "dono@exemplo.com",
        senha: "Ab3dEf7hJk9m",
      })
    ).toBe(
      [
        "Olá! Seu acesso ao repply food. está pronto.",
        "",
        "Endereço: https://food.repplyhub.com.br",
        "E-mail: dono@exemplo.com",
        "Senha provisória: Ab3dEf7hJk9m",
        "",
        "No primeiro acesso, o painel pede para você criar a sua própria senha. Depois disso, a senha provisória deixa de valer.",
      ].join("\n")
    );
  });

  it("avisos de login de mais de uma casa", () => {
    expect(avisoDeLoginLigado(1)).toBe(
      "Este e-mail já tinha acesso; agora vê as duas casas."
    );
    expect(avisoDeLoginLigado(2)).toBe(
      "Este e-mail já tinha acesso; agora vê 3 casas."
    );
    expect(avisoDeOutrasCasas(0, "senha")).toBe("");
    expect(avisoDeOutrasCasas(1, "senha")).toBe(
      "Este login também abre outra casa: a senha nova vale para as duas."
    );
    expect(avisoDeOutrasCasas(2, "email")).toBe(
      "Este login também abre outras 2 casas: o e-mail novo vale para todas."
    );
  });

  it("mensagem depois de editar", () => {
    expect(mensagemDaEdicao(undefined)).toBe("Dados salvos.");
    expect(mensagemDaEdicao({ recalculou: false, mudouFuso: false })).toBe("Dados salvos.");
    expect(mensagemDaEdicao({ recalculou: true, mudouFuso: false })).toBe(
      "Dados salvos. Recalculamos o dia de operação das contas desta casa."
    );
    expect(mensagemDaEdicao({ recalculou: true, mudouFuso: true })).toBe(
      "Dados salvos. Recalculamos o dia de operação das contas desta casa. Como o fuso mudou, peça um reenvio para corrigir as horas das contas que já chegaram."
    );
  });

  it("máscaras e plural", () => {
    expect(mascararToken("rf_8f3k")).toBe("rf_8f3k••••");
    expect(mascararEmail("dono@bardoze.com.br")).toBe("do…@bardoze.com.br");
    expect(mascararEmail("a@b.com")).toBe("a…@b.com");
    expect(mascararEmail("semarroba")).toBe("…");
    expect(plural(1, "casa", "casas")).toBe("1 casa");
    expect(plural(0, "casa", "casas")).toBe("0 casas");
  });
});

describe("histórico (D-59)", () => {
  it("linha com data e hora no fuso da casa, autor e ação", () => {
    expect(
      linhaDoHistorico(
        {
          id: 1,
          criadoEm: "2026-10-15T00:03:00Z",
          autor: "Lucas Ferreira",
          acao: "gerou_token",
          detalhe: "o antigo parou na hora",
        },
        "America/Fortaleza"
      )
    ).toBe("14/10 21:03 · Lucas Ferreira · gerou um token novo (o antigo parou na hora)");
  });

  it("ação sem detalhe e ação que o banco não conhece", () => {
    expect(textoDaAcao("abriu_painel", null)).toBe("abriu o painel do cliente");
    expect(acaoAdmin("suspendeu")).toBe("suspendeu");
    expect(acaoAdmin("apagou_tudo")).toBeNull();
  });

  it("nome do autor: o nome, senão o começo do e-mail", () => {
    expect(nomeDoAutor({ nome: "Lucas Ferreira", email: "lucas@repply.local" })).toBe("Lucas Ferreira");
    expect(nomeDoAutor({ nome: "  ", email: "admin@repply.local" })).toBe("admin");
    expect(nomeDoAutor({ nome: 42, email: null })).toBe("admin");
    expect(nomeDoAutor(null)).toBe("admin removido");
  });
});

describe("envios", () => {
  const ok: EnvioResumo = {
    id: 1,
    recebidoEm: "2026-10-15T00:38:00Z",
    httpStatus: 200,
    erro: null,
    recebidas: 212,
    gravadas: 1,
    inalteradas: 203,
    removidas: 0,
    versaoScc: "5.2.1",
    camposDesconhecidos: [],
  };

  it("envio ok mostra as contagens e a versão do SCC", () => {
    expect(detalheDoEnvio(ok)).toBe(
      "212 recebidas · 1 gravada · 203 iguais · 0 removidas · SCC 5.2.1"
    );
    expect(camposNovosDoEnvio(ok)).toBeNull();
  });

  it("envio com erro mostra o erro curto e o código", () => {
    expect(
      detalheDoEnvio({ ...ok, httpStatus: 422, erro: "formato inválido", versaoScc: null })
    ).toBe("formato inválido (422)");
  });

  it("campos novos do SCC aparecem pelo nome (D-51)", () => {
    expect(camposNovosDoEnvio({ ...ok, camposDesconhecidos: ["Garcom2", "Pix"] })).toBe(
      "campos novos: Garcom2, Pix"
    );
  });
});
```

Crie `tests/admin/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DIA_FECHADO } from "../../lib/admin/horario";
import {
  type RestauranteInput,
  VALORES_INICIAIS,
  emailSchema,
  formularioDoRestaurante,
  paraOBanco,
  problemaNoReenvio,
  restauranteSchema,
} from "../../lib/admin/schemas";

function valido(): RestauranteInput {
  const dias = Array.from({ length: 7 }, () => ({ ...DIA_FECHADO }));
  dias[2] = { modo: "dois", abre1: "11:00", fecha1: "15:00", abre2: "18:00", fecha2: "02:00" };
  return {
    nome: " Bar do Zé ",
    cnpj: "12.345.678/0001-95",
    fuso: "America/Fortaleza",
    horaVirada: "5",
    dias,
  };
}

function caminhos(entrada: RestauranteInput): string[] {
  const resultado = restauranteSchema.safeParse(entrada);
  return resultado.success ? [] : resultado.error.issues.map((i) => i.path.join("."));
}

describe("formulário do restaurante", () => {
  it("o cadastro válido passa e vai para o banco como o banco grava", () => {
    const resultado = restauranteSchema.safeParse(valido());
    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(paraOBanco(resultado.data)).toEqual({
      nome: "Bar do Zé",
      cnpj: "12345678000195",
      fuso: "America/Fortaleza",
      hora_virada: "05:00",
      horario_funcionamento: [
        { dia: 2, abre: "11:00", fecha: "15:00" },
        { dia: 2, abre: "18:00", fecha: "02:00" },
      ],
    });
  });

  it("CNPJ em branco vira nulo", () => {
    const resultado = restauranteSchema.safeParse({ ...valido(), cnpj: "" });
    expect(resultado.success && paraOBanco(resultado.data).cnpj).toBeNull();
  });

  it("os valores iniciais pedem pelo menos um dia aberto", () => {
    expect(caminhos({ ...VALORES_INICIAIS, nome: "Casa nova" })).toEqual(["dias"]);
  });

  it.each([
    ["CNPJ errado", { cnpj: "12.345.678/0001-90" }, "cnpj"],
    ["fuso de fora", { fuso: "America/New_York" }, "fuso"],
    ["virada inválida", { horaVirada: "24" }, "horaVirada"],
    ["nome curto", { nome: "A" }, "nome"],
  ] as const)("%s aponta o campo", (_, mudanca, campo) => {
    expect(caminhos({ ...valido(), ...mudanca })).toEqual([campo]);
  });

  it("dia com horários que se sobrepõem aponta o dia", () => {
    const entrada = valido();
    entrada.dias[4] = { modo: "dois", abre1: "11:00", fecha1: "15:00", abre2: "14:00", fecha2: "16:00" };
    expect(caminhos(entrada)).toEqual(["dias.4"]);
  });

  it("volta do banco para o formulário", () => {
    expect(
      formularioDoRestaurante({
        nome: "Bar do Zé",
        cnpj: "12345678000195",
        fuso: "America/Fortaleza",
        hora_virada: "05:00:00",
        horario_funcionamento: [
          { dia: 2, abre: "18:00", fecha: "02:00" },
          { dia: 2, abre: "11:00", fecha: "15:00" },
        ],
      })
    ).toEqual({ ...valido(), nome: "Bar do Zé" });
  });

  it("horário ilegível do banco vira semana fechada no formulário", () => {
    const valores = formularioDoRestaurante({
      nome: "X",
      cnpj: null,
      fuso: "America/Fortaleza",
      hora_virada: "05:00:00",
      horario_funcionamento: { quebrado: true },
    });
    expect(valores.dias.every((d) => d.modo === "fechado")).toBe(true);
    expect(valores.cnpj).toBe("");
  });

  it("e-mail limpo e minúsculo", () => {
    expect(emailSchema.parse({ email: "  Dono@Bar.COM " }).email).toBe("dono@bar.com");
    expect(emailSchema.safeParse({ email: "dono" }).success).toBe(false);
  });
});

describe("pedido de reenvio (desenho §1.1, cartão 5)", () => {
  const hoje = "2026-10-14";
  it.each([
    ["2026-10-14", null],
    ["2026-06-16", null],
    ["2026-10-15", "A data não pode ser no futuro."],
    ["2026-06-15", "A data não pode ser anterior a 120 dias."],
    ["2026-02-30", "Escolha uma data válida."],
    ["", "Escolha uma data válida."],
  ])("%j → %j", (desde, problema) => {
    expect(problemaNoReenvio(desde, hoje)).toBe(problema);
  });
});
```

Crie `tests/admin/espelho-do-banco.test.ts`:

```ts
// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cnpjValido } from "../../lib/admin/cnpj";
import { FUSOS_DO_BRASIL } from "../../lib/admin/fusos";
import { ACOES_ADMIN } from "../../lib/admin/historico";
import { type Intervalo, problemaNosIntervalos } from "../../lib/admin/horario";
import { conectarBanco } from "../helpers/supabase-local";

const ter = (abre: string, fecha: string): Intervalo => ({ dia: 2, abre, fecha });

/** O formulário e o banco precisam dar a mesma resposta (desenho §2.4). */
describe("a tela e o banco conferem igual", () => {
  let banco: Client;

  beforeAll(async () => {
    banco = await conectarBanco();
  });

  afterAll(async () => {
    await banco?.end();
  });

  async function valoresDaRestricao(nome: string): Promise<string[]> {
    const { rows } = await banco.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1",
      [nome]
    );
    return [...(rows[0]?.def ?? "").matchAll(/'([^']+)'::text/g)]
      .map((m) => m[1] ?? "")
      .sort();
  }

  it.each([
    ["vazio", []],
    ["um", [ter("11:00", "15:00")]],
    ["almoço e jantar", [ter("11:00", "15:00"), ter("18:00", "02:00")]],
    ["fora de ordem", [ter("18:00", "02:00"), ter("11:00", "15:00")]],
    ["colados", [ter("00:00", "12:00"), ter("12:00", "00:00")]],
    ["três", [ter("08:00", "09:00"), ter("10:00", "11:00"), ter("12:00", "13:00")]],
    ["sobreposição", [ter("11:00", "15:00"), ter("14:00", "16:00")]],
    ["primeiro cruza", [ter("01:00", "00:30"), ter("03:00", "04:00")]],
    ["mesma abertura", [ter("11:00", "12:00"), ter("11:00", "13:00")]],
    ["abre igual a fecha", [ter("11:00", "11:00")]],
    ["dia 7", [{ dia: 7, abre: "11:00", fecha: "15:00" }]],
    ["hora 25", [ter("25:00", "15:00")]],
    ["hora sem zero", [ter("9:00", "15:00")]],
  ])("horário %s", async (_, intervalos) => {
    const { rows } = await banco.query<{ valido: boolean }>(
      "select public.horario_funcionamento_valido($1::jsonb) as valido",
      [JSON.stringify(intervalos)]
    );
    expect(problemaNosIntervalos(intervalos) === null).toBe(rows[0]?.valido);
  });

  it.each([
    "12345678000195",
    "12ABC34501DE35",
    "12345678000190",
    "11111111111111",
    "1234567800019A",
    "12abc34501de35",
  ])("CNPJ %s", async (cnpj) => {
    const { rows } = await banco.query<{ valido: boolean }>(
      "select public.cnpj_valido($1) as valido",
      [cnpj]
    );
    expect(cnpjValido(cnpj)).toBe(rows[0]?.valido);
  });

  it("a lista de fusos é a mesma do banco", async () => {
    expect(await valoresDaRestricao("restaurantes_fuso_do_brasil")).toEqual(
      FUSOS_DO_BRASIL.map((f) => f.valor).sort()
    );
  });

  it("a lista de ações do histórico é a mesma do banco", async () => {
    expect(await valoresDaRestricao("registro_admin_acao_valida")).toEqual(
      [...ACOES_ADMIN].sort()
    );
  });
});
```

Rode `npx vitest run tests/admin/textos.test.ts tests/admin/schemas.test.ts tests/admin/espelho-do-banco.test.ts` → esperado: FALHA (módulos não existem).

- [ ] **Passo 6: Mensagens, envios, histórico e esquemas**

Crie `lib/admin/mensagens.ts`:

```ts
import { plural } from "./texto";

export function enderecoDaRecepcao(urlDoSupabase: string): string {
  return `${urlDoSupabase.replace(/\/+$/, "")}/functions/v1/receber-envio`;
}

/** O texto da "Mensagem modelo para a SCC" (docs/operacao/cadastrar-restaurante.md). */
export function instrucoesParaScc(e: {
  nome: string;
  endereco: string;
  token: string;
  intervaloSegundos: number;
}): string {
  return [
    `Olá! Seguem os dados do repply food. para o restaurante ${e.nome}:`,
    "",
    `Endereço: ${e.endereco}`,
    `Token: ${e.token}          (guardar só no arquivo de configuração do SCC)`,
    `Intervalo: ${e.intervaloSegundos} segundos`,
    "",
    "Por favor, façam a carga inicial do histórico (contrato de dados, §8) e",
    "nos avisem quando o restaurante estiver enviando. Qualquer erro aparece",
    "para nós no painel de administração.",
  ].join("\n");
}

/** Mensagem para o WhatsApp do dono, com a senha provisória (D-55). */
export function mensagemDoLogin(e: {
  endereco: string;
  email: string;
  senha: string;
}): string {
  return [
    "Olá! Seu acesso ao repply food. está pronto.",
    "",
    `Endereço: ${e.endereco}`,
    `E-mail: ${e.email}`,
    `Senha provisória: ${e.senha}`,
    "",
    "No primeiro acesso, o painel pede para você criar a sua própria senha. Depois disso, a senha provisória deixa de valer.",
  ].join("\n");
}

export function mensagemDaEdicao(
  r: { recalculou: boolean; mudouFuso: boolean } | undefined
): string {
  if (!r?.recalculou) return "Dados salvos.";
  const base = "Dados salvos. Recalculamos o dia de operação das contas desta casa.";
  return r.mudouFuso
    ? `${base} Como o fuso mudou, peça um reenvio para corrigir as horas das contas que já chegaram.`
    : base;
}

/** Dono com duas casas (D-10): "Criar login" ligou a casa à conta que já existia. */
export function avisoDeLoginLigado(outrasCasas: number): string {
  const total = outrasCasas + 1;
  return total === 2
    ? "Este e-mail já tinha acesso; agora vê as duas casas."
    : `Este e-mail já tinha acesso; agora vê ${total} casas.`;
}

/** Aviso de "Redefinir senha" e "Trocar e-mail" quando o login abre mais de uma casa. */
export function avisoDeOutrasCasas(
  outrasCasas: number,
  oQueMuda: "senha" | "email"
): string {
  if (outrasCasas <= 0) return "";
  const quais =
    outrasCasas === 1 ? "outra casa" : `outras ${plural(outrasCasas, "casa", "casas")}`;
  const vale =
    oQueMuda === "senha" ? "a senha nova vale para" : "o e-mail novo vale para";
  return `Este login também abre ${quais}: ${vale} ${outrasCasas === 1 ? "as duas" : "todas"}.`;
}
```

Crie `lib/admin/envios.ts`:

```ts
import { plural } from "./texto";

export type EnvioResumo = {
  id: number;
  recebidoEm: string;
  httpStatus: number;
  erro: string | null;
  recebidas: number | null;
  gravadas: number | null;
  inalteradas: number | null;
  removidas: number | null;
  versaoScc: string | null;
  camposDesconhecidos: string[];
};

export function envioOk(e: Pick<EnvioResumo, "httpStatus">): boolean {
  return e.httpStatus === 200;
}

/** "212 recebidas · 8 gravadas · 203 iguais · 1 removida". */
export function contagensDoEnvio(
  e: Pick<EnvioResumo, "recebidas" | "gravadas" | "inalteradas" | "removidas">
): string {
  return [
    plural(e.recebidas ?? 0, "recebida", "recebidas"),
    plural(e.gravadas ?? 0, "gravada", "gravadas"),
    plural(e.inalteradas ?? 0, "igual", "iguais"),
    plural(e.removidas ?? 0, "removida", "removidas"),
  ].join(" · ");
}

export function detalheDoEnvio(e: EnvioResumo): string {
  if (!envioOk(e)) return `${e.erro ?? "erro"} (${e.httpStatus})`;
  const contagens = contagensDoEnvio(e);
  return e.versaoScc ? `${contagens} · SCC ${e.versaoScc}` : contagens;
}

/** Campos fora do contrato que o SCC mandou (só o nome, D-51). */
export function camposNovosDoEnvio(
  e: Pick<EnvioResumo, "camposDesconhecidos">
): string | null {
  return e.camposDesconhecidos.length > 0
    ? `campos novos: ${e.camposDesconhecidos.join(", ")}`
    : null;
}
```

Crie `lib/admin/historico.ts`:

```ts
import { dataEHoraNaCasa } from "./datas";

/** A mesma lista da restrição `registro_admin_acao_valida` (migration 20261015120000). */
export const ACOES_ADMIN = [
  "cadastrou",
  "editou_dados",
  "gerou_token",
  "revogou_token",
  "criou_login",
  "ligou_login",
  "redefiniu_senha",
  "trocou_email",
  "pediu_reenvio",
  "suspendeu",
  "reativou",
  "abriu_painel",
] as const;
export type AcaoAdmin = (typeof ACOES_ADMIN)[number];

const ROTULOS: Record<AcaoAdmin, string> = {
  cadastrou: "cadastrou o restaurante",
  editou_dados: "editou os dados",
  gerou_token: "gerou um token novo",
  revogou_token: "revogou o token",
  criou_login: "criou o login do cliente",
  ligou_login: "ligou um login que já existia",
  redefiniu_senha: "redefiniu a senha do cliente",
  trocou_email: "trocou o e-mail do cliente",
  pediu_reenvio: "pediu reenvio",
  suspendeu: "suspendeu o restaurante",
  reativou: "reativou o restaurante",
  abriu_painel: "abriu o painel do cliente",
};

/** `autor` já é o nome mostrado (`nomeDoAutor`). */
export type RegistroDoHistorico = {
  id: number;
  criadoEm: string;
  autor: string;
  acao: AcaoAdmin;
  detalhe: string | null;
};

export function acaoAdmin(valor: string): AcaoAdmin | null {
  return ACOES_ADMIN.find((acao) => acao === valor) ?? null;
}

export function textoDaAcao(acao: AcaoAdmin, detalhe: string | null): string {
  return detalhe ? `${ROTULOS[acao]} (${detalhe})` : ROTULOS[acao];
}

/** O nome do admin (`user_metadata.nome`); sem nome, o começo do e-mail. */
export function nomeDoAutor(
  u: { nome?: unknown; email?: string | null } | null
): string {
  if (!u) return "admin removido";
  if (typeof u.nome === "string" && u.nome.trim()) return u.nome.trim();
  return u.email?.split("@")[0] || "admin";
}

/** "14/10 21:03 · Lucas Ferreira · gerou um token novo (o antigo parou na hora)". */
export function linhaDoHistorico(r: RegistroDoHistorico, fuso: string): string {
  return `${dataEHoraNaCasa(r.criadoEm, fuso)} · ${r.autor} · ${textoDaAcao(r.acao, r.detalhe)}`;
}
```

Crie `lib/admin/schemas.ts`:

```ts
import { entrarSchema } from "@/lib/auth/schemas";
import { z } from "zod";
import { cnpjValido, formatarCnpj, limparCnpj } from "./cnpj";
import { diaValido, somarDias } from "./datas";
import { FUSO_PADRAO, ehFusoDoBrasil } from "./fusos";
import {
  DIA_FECHADO,
  type Intervalo,
  formularioDosIntervalos,
  intervalosDoFormulario,
  intervalosSchema,
  problemaNoDia,
} from "./horario";

const diaSchema = z.object({
  modo: z.enum(["fechado", "um", "dois"]),
  abre1: z.string(),
  fecha1: z.string(),
  abre2: z.string(),
  fecha2: z.string(),
});

/**
 * Cadastro e edição (mesmo formulário). Os erros apontam o campo; o do "pelo
 * menos um dia aberto" aponta `dias` (o react-hook-form o põe em
 * `errors.dias.root`). O servidor confere de novo com este mesmo esquema.
 */
export const restauranteSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(2, "Digite o nome do restaurante")
      .max(80, "Use até 80 caracteres"),
    cnpj: z.string().trim().max(20, "CNPJ inválido: confira os números"),
    fuso: z.string(),
    horaVirada: z.string(),
    dias: z.array(diaSchema).length(7),
  })
  .superRefine((d, ctx) => {
    const cnpj = limparCnpj(d.cnpj);
    if (cnpj !== "" && !cnpjValido(cnpj)) {
      ctx.addIssue({ code: "custom", path: ["cnpj"], message: "CNPJ inválido: confira os números" });
    }
    if (!ehFusoDoBrasil(d.fuso)) {
      ctx.addIssue({ code: "custom", path: ["fuso"], message: "Escolha um fuso da lista" });
    }
    if (!/^([0-9]|1[0-9]|2[0-3])$/.test(d.horaVirada)) {
      ctx.addIssue({ code: "custom", path: ["horaVirada"], message: "Escolha a hora" });
    }
    d.dias.forEach((dia, indice) => {
      const problema = problemaNoDia(dia);
      if (problema) ctx.addIssue({ code: "custom", path: ["dias", indice], message: problema });
    });
    if (d.dias.every((dia) => dia.modo === "fechado")) {
      ctx.addIssue({ code: "custom", path: ["dias"], message: "Abra a casa em pelo menos um dia" });
    }
  });
export type RestauranteInput = z.infer<typeof restauranteSchema>;

export const VALORES_INICIAIS: RestauranteInput = {
  nome: "",
  cnpj: "",
  fuso: FUSO_PADRAO,
  horaVirada: "5",
  dias: Array.from({ length: 7 }, () => ({ ...DIA_FECHADO })),
};

export type DadosDoRestaurante = {
  nome: string;
  cnpj: string | null;
  fuso: string;
  hora_virada: string;
  horario_funcionamento: Intervalo[];
};

/** Do formulário (já validado) para as colunas de `restaurantes`. */
export function paraOBanco(d: RestauranteInput): DadosDoRestaurante {
  const cnpj = limparCnpj(d.cnpj);
  return {
    nome: d.nome,
    cnpj: cnpj === "" ? null : cnpj,
    fuso: d.fuso,
    hora_virada: `${d.horaVirada.padStart(2, "0")}:00`,
    horario_funcionamento: intervalosDoFormulario(d.dias),
  };
}

/** Da linha de `restaurantes` para o formulário de edição. */
export function formularioDoRestaurante(r: {
  nome: string;
  cnpj: string | null;
  fuso: string;
  hora_virada: string;
  horario_funcionamento: unknown;
}): RestauranteInput {
  const intervalos = intervalosSchema.safeParse(r.horario_funcionamento);
  return {
    nome: r.nome,
    cnpj: r.cnpj ? formatarCnpj(r.cnpj) : "",
    fuso: r.fuso,
    horaVirada: String(Number(r.hora_virada.slice(0, 2))),
    dias: formularioDosIntervalos(intervalos.success ? intervalos.data : []),
  };
}

/** O mesmo e-mail da tela de entrar: limpo e minúsculo. */
export const emailSchema = z.object({ email: entrarSchema.shape.email });
export type EmailInput = z.infer<typeof emailSchema>;

export const DIAS_MAXIMOS_DO_REENVIO = 120;

export function primeiroDiaDoReenvio(hoje: string): string {
  return somarDias(hoje, -DIAS_MAXIMOS_DO_REENVIO);
}

/** `hoje` é o dia de hoje no fuso da casa (`hojeNaCasa`). */
export function problemaNoReenvio(desde: string, hoje: string): string | null {
  if (!diaValido(desde)) return "Escolha uma data válida.";
  if (desde > hoje) return "A data não pode ser no futuro.";
  if (desde < primeiroDiaDoReenvio(hoje)) {
    return `A data não pode ser anterior a ${DIAS_MAXIMOS_DO_REENVIO} dias.`;
  }
  return null;
}
```

Rode os testes do Passo 5 → esperado: PASSA.

- [ ] **Passo 7: Verificar e commitar**

```bash
npx biome check --write lib/admin supabase/functions/_shared/token.ts supabase/functions/receber-envio/index.ts tests/admin
npx vitest run tests/admin tests/recepcao
npx tsc --noEmit
```

(Erros de `tsc` só em `lib/auth/`, `lib/logger.ts` ou `app/error.tsx` são da Tarefa 3, em paralelo: anote e siga.)

```bash
git fetch && git status -sb && git status --short
git add lib/admin/token.ts lib/admin/senha-provisoria.ts lib/admin/cnpj.ts lib/admin/slug.ts lib/admin/fusos.ts lib/admin/horario.ts lib/admin/lista.ts lib/admin/datas.ts lib/admin/texto.ts lib/admin/mensagens.ts lib/admin/envios.ts lib/admin/historico.ts lib/admin/schemas.ts supabase/functions/_shared/token.ts supabase/functions/receber-envio/index.ts tests/admin/token.test.ts tests/admin/senha-provisoria.test.ts tests/admin/cnpj.test.ts tests/admin/slug.test.ts tests/admin/horario.test.ts tests/admin/lista.test.ts tests/admin/datas.test.ts tests/admin/textos.test.ts tests/admin/schemas.test.ts tests/admin/espelho-do-banco.test.ts
git commit -m "Cria as funções puras do admin: token, senha provisória, CNPJ, horário, lista, datas e mensagens" -m "Co-Authored-By: <trailer do seu modelo>"
```

---

## Tarefa 3: Sessão e guardas (pendências 27 e 43, modo admin, trocar de casa)  *(paralela à Tarefa 2)*

**Por quê:** a sessão do admin carregava todas as casas a cada página (pendência 43); um erro de leitura virava "lista vazia" e mandava o dono para o "acesso pendente" (pendência 27). O painel precisa saber quando é o admin vendo a casa de um cliente (faixa "só leitura", D-58) e quando o dono tem duas casas ativas ("Trocar de casa").

**Arquivos (lista fechada):**
- Modificar: `lib/auth/sessao.ts`, `lib/auth/destino.ts`, `lib/auth/actions.ts` (só `destinoDe` e um import), `lib/logger.ts`
- Criar: `app/error.tsx`
- Testes: modificar `tests/auth/sessao.test.ts`, `tests/auth/destino.test.ts`, `tests/auth/actions.test.ts`, `tests/logger.test.ts`; criar `tests/auth/tela-de-erro.test.tsx`

**Interfaces produzidas (as Tarefas 4 a 7 usam):**
- `@/lib/auth/sessao` (só servidor): `type CasaDoLogin` (igual), `type Sessao` (igual; `casas` passa a ser **só as casas ligadas ao login em `acessos`**: o admin normalmente tem `[]`), `obterSessao(): Promise<Sessao | null>`, `exigirSessao(): Promise<Sessao>`, `destinoDaSessao(s: Sessao): string`, `exigirAdmin(): Promise<Sessao>`, e **`exigirCasa(slug: string): Promise<{ sessao: Sessao; casa: CasaDoLogin; modoAdmin: boolean }>`** (`modoAdmin === sessao.ehAdmin`; o admin abre qualquer casa pelo endereço, casa inexistente → `/admin`). Falha de leitura do banco lança `Error("falha_leitura_sessao")` (vira a tela de erro) e registra `logError("falha_leitura_sessao")`.
- `@/lib/auth/destino`: `podeTrocarDeCasa(e: { ehAdmin: boolean; casas: readonly RestauranteDoLogin[] }): boolean`.
- `@/lib/logger`: códigos novos `"falha_leitura_sessao"`, `"falha_admin"`, `"falha_registro_admin"`, `"falha_recalculo_dia"`.
- `app/error.tsx`: tela de erro com "Tentar de novo" (`retry`, Next 16.3+).

- [ ] **Passo 1: Testes da sessão (falham)**

Substitua `tests/auth/sessao.test.ts` por:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type Filtros = Record<string, unknown>;

const { getUser, ehAdmin, casasDoLogin, casaPeloEndereco, logError } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    ehAdmin: vi.fn(),
    casasDoLogin: vi.fn(),
    casaPeloEndereco: vi.fn(),
    logError: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
// O redirect de verdade interrompe a função lançando um erro; o dublê faz igual.
vi.mock("next/navigation", () => ({
  redirect: (para: string) => {
    throw new Error(`REDIRECT:${para}`);
  },
}));
vi.mock("@/lib/logger", () => ({ logError }));
// Dublê do cliente do Supabase: guarda os filtros de cada consulta para o
// teste conferir o que foi pedido ao banco.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc: async () => ehAdmin(),
    from: (tabela: string) => {
      const filtros: Filtros = {};
      const consulta = {
        select: (colunas: string) => {
          filtros.select = colunas;
          return consulta;
        },
        eq: (coluna: string, valor: unknown) => {
          filtros[coluna] = valor;
          return consulta;
        },
        order: async () => casasDoLogin(tabela, filtros),
        maybeSingle: async () => casaPeloEndereco(tabela, filtros),
      };
      return consulta;
    },
  }),
}));

import { exigirAdmin, exigirCasa, obterSessao } from "@/lib/auth/sessao";

const CASA = {
  id: "c1",
  slug: "casa-x",
  nome: "Casa X",
  situacao: "ativo",
  fuso: "America/Sao_Paulo",
};
const FALHA_DE_REDE = { data: null, error: { code: "08006" } };

function entrou(
  appMetadata: Record<string, unknown>,
  admin: boolean,
  daConta: unknown[] = [CASA],
  peloEndereco: unknown = CASA
) {
  getUser.mockResolvedValue({
    data: { user: { id: "u1", email: "d@x.com", app_metadata: appMetadata } },
  });
  ehAdmin.mockReturnValue({ data: admin, error: null });
  casasDoLogin.mockReturnValue({ data: daConta, error: null });
  casaPeloEndereco.mockImplementation((_tabela: string, filtros: Filtros) => ({
    data: filtros.slug === "casa-x" ? peloEndereco : null,
    error: null,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("guardas de sessão", () => {
  it("admin com a troca de senha pendente é levado para trocar antes de entrar no admin", async () => {
    entrou({ precisa_trocar_senha: true }, true);
    await expect(exigirAdmin()).rejects.toThrow("REDIRECT:/trocar-senha");
  });

  it("admin sem pendência entra", async () => {
    entrou({}, true, []);
    const sessao = await exigirAdmin();
    expect(sessao.ehAdmin).toBe(true);
  });

  it("quem não é admin vai para o destino da própria casa", async () => {
    entrou({}, false);
    await expect(exigirAdmin()).rejects.toThrow("REDIRECT:/r/casa-x/hoje");
  });

  it("dono com a troca pendente é levado para trocar antes de ver a casa", async () => {
    entrou({ precisa_trocar_senha: true }, false);
    await expect(exigirCasa("casa-x")).rejects.toThrow("REDIRECT:/trocar-senha");
  });

  it("sem login, a casa manda para /entrar", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(exigirCasa("casa-x")).rejects.toThrow("REDIRECT:/entrar");
  });

  it("casa da conta abre, sem modo admin", async () => {
    entrou({}, false);
    const { casa, modoAdmin } = await exigirCasa("casa-x");
    expect(casa.slug).toBe("casa-x");
    expect(modoAdmin).toBe(false);
  });

  it("casa que não está entre as do login manda para o destino da conta, nunca devolve a casa", async () => {
    entrou({}, false);
    await expect(exigirCasa("casa-de-outro")).rejects.toThrow("REDIRECT:/r/casa-x/hoje");
  });

  it("conta com duas casas que pede uma terceira vai para a escolha da casa", async () => {
    entrou({}, false, [CASA, { ...CASA, id: "c2", slug: "casa-y" }]);
    await expect(exigirCasa("casa-de-outro")).rejects.toThrow("REDIRECT:/escolher-casa");
  });

  it("conta sem nenhuma casa que pede uma casa vai para o acesso pendente", async () => {
    entrou({}, false, []);
    await expect(exigirCasa("casa-x")).rejects.toThrow("REDIRECT:/acesso-pendente");
  });

  it("casa suspensa: o dono vai para o acesso pendente", async () => {
    entrou({}, false, [{ ...CASA, situacao: "suspenso" }]);
    await expect(exigirCasa("casa-x")).rejects.toThrow("REDIRECT:/acesso-pendente");
  });

  it("casa suspensa: o admin entra, para dar suporte", async () => {
    entrou({}, true, [], { ...CASA, situacao: "suspenso" });
    const { casa, modoAdmin } = await exigirCasa("casa-x");
    expect(casa.situacao).toBe("suspenso");
    expect(modoAdmin).toBe(true);
  });

  it("a troca de senha pendente vale antes de qualquer casa, até a que não existe", async () => {
    entrou({ precisa_trocar_senha: true }, false);
    await expect(exigirCasa("casa-de-outro")).rejects.toThrow("REDIRECT:/trocar-senha");
  });

  it("admin com a troca pendente também troca antes de abrir uma casa", async () => {
    entrou({ precisa_trocar_senha: true }, true);
    await expect(exigirCasa("casa-x")).rejects.toThrow("REDIRECT:/trocar-senha");
  });
});

describe("o admin não carrega todas as casas (pendência 43)", () => {
  it("a sessão lê só as casas ligadas ao login, para qualquer um", async () => {
    entrou({}, true, []);
    const sessao = await obterSessao();
    expect(sessao?.casas).toEqual([]);
    expect(casasDoLogin).toHaveBeenCalledWith(
      "restaurantes",
      expect.objectContaining({ "acessos.user_id": "u1" })
    );
  });

  it("o admin abre a casa pelo endereço, em modo admin", async () => {
    entrou({}, true, []);
    const { casa, modoAdmin } = await exigirCasa("casa-x");
    expect(casa.id).toBe("c1");
    expect(modoAdmin).toBe(true);
    expect(casaPeloEndereco).toHaveBeenCalledWith(
      "restaurantes",
      expect.objectContaining({ slug: "casa-x" })
    );
  });

  it("o admin que pede uma casa que não existe volta para o admin", async () => {
    entrou({}, true, []);
    await expect(exigirCasa("nao-existe")).rejects.toThrow("REDIRECT:/admin");
  });
});

describe("falha de leitura vira erro, não 'acesso pendente' (pendência 27)", () => {
  it("falha ao ler as casas do login", async () => {
    entrou({}, false);
    casasDoLogin.mockReturnValue(FALHA_DE_REDE);
    await expect(exigirCasa("casa-x")).rejects.toThrow("falha_leitura_sessao");
    expect(logError).toHaveBeenCalledWith("falha_leitura_sessao");
  });

  it("falha ao saber se é admin", async () => {
    entrou({}, false);
    ehAdmin.mockReturnValue(FALHA_DE_REDE);
    await expect(obterSessao()).rejects.toThrow("falha_leitura_sessao");
  });

  it("falha ao ler a casa que o admin pediu", async () => {
    entrou({}, true, []);
    casaPeloEndereco.mockReturnValue(FALHA_DE_REDE);
    await expect(exigirCasa("casa-x")).rejects.toThrow("falha_leitura_sessao");
  });
});
```

Em `tests/auth/destino.test.ts`:
- troque o import por `import { destinoDepoisDeEntrar, podeTrocarDeCasa } from "../../lib/auth/destino";`;
- no fim do arquivo, acrescente:

```ts
describe("trocar de casa (D-58)", () => {
  it("aparece para quem tem duas ou mais casas ativas", () => {
    expect(podeTrocarDeCasa({ ehAdmin: false, casas: [casa("a"), casa("b")] })).toBe(true);
  });

  it("não aparece com uma ativa e outra suspensa", () => {
    expect(
      podeTrocarDeCasa({ ehAdmin: false, casas: [casa("a"), casa("b", "suspenso")] })
    ).toBe(false);
  });

  it("não aparece para o admin (ele troca pelo admin)", () => {
    expect(podeTrocarDeCasa({ ehAdmin: true, casas: [casa("a"), casa("b")] })).toBe(false);
  });
});
```

Em `tests/auth/actions.test.ts`:
- na desestruturação do `vi.hoisted`, acrescente `casasDoDestino,` e `logError,` e, no objeto devolvido, `casasDoDestino: vi.fn(),` e `logError: vi.fn(),`;
- no dublê de `@/lib/supabase/server`, troque o bloco `from: () => ({ select: () => ({ order: async () => ({ data: [{ slug: "casa-x", situacao: "ativo" }] }) }) }),` por `from: () => ({ select: () => ({ order: async () => casasDoDestino() }) }),`;
- logo depois do `vi.mock("@/lib/auth/nucleo", …)`, acrescente `vi.mock("@/lib/logger", () => ({ logError }));`;
- no `beforeEach` do topo, acrescente `casasDoDestino.mockReturnValue({ data: [{ slug: "casa-x", situacao: "ativo" }], error: null });`;
- no fim do arquivo, acrescente:

```ts
describe("falha ao ler as casas depois de entrar (pendência 27)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("vai para a raiz, que refaz a conta, e nunca para o acesso pendente", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: donoSemTroca }, error: null });
    casasDoDestino.mockReturnValue({ data: null, error: { code: "08006" } });
    const resultado = await semEspera(
      entrarAction({ email: "dono@casa.com", senha: "qualquer-123" })
    );
    expect(resultado).toEqual({ ok: true, data: { destino: "/" } });
    expect(logError).toHaveBeenCalledWith("falha_leitura_sessao");
  });
});
```

Em `tests/logger.test.ts`, dentro do `describe("logger", …)`, acrescente:

```ts
  it("aceita os códigos da etapa 3", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const codigos = [
      "falha_leitura_sessao",
      "falha_admin",
      "falha_registro_admin",
      "falha_recalculo_dia",
    ];
    for (const codigo of codigos) logError(codigo);
    expect(erro.mock.calls.map((chamada) => chamada[1])).toEqual(codigos);
    erro.mockRestore();
  });
```

Crie `tests/auth/tela-de-erro.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErroDaTela from "@/app/error";

afterEach(cleanup);

describe("tela de erro (pendência 27)", () => {
  it("explica sem mostrar o erro técnico e tenta de novo", () => {
    const retry = vi.fn();
    render(<ErroDaTela error={new Error("falha_leitura_sessao")} retry={retry} />);
    expect(screen.getByRole("heading", { name: "Não deu para carregar agora" })).toBeTruthy();
    expect(screen.queryByText(/falha_leitura_sessao/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
```

Rode `npx vitest run tests/auth tests/logger.test.ts` → esperado: FALHA nos testes novos (`modoAdmin`, filtros, erro, `podeTrocarDeCasa`, códigos, `app/error`).

- [ ] **Passo 2: Sessão e guardas**

Substitua `lib/auth/sessao.ts` por:

```ts
import "server-only";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { destinoDepoisDeEntrar } from "./destino";
import { precisaTrocarSenha } from "./nucleo";

export type CasaDoLogin = {
  id: string;
  slug: string;
  nome: string;
  situacao: "ativo" | "suspenso";
  fuso: string;
};

export type Sessao = {
  userId: string;
  email: string;
  ehAdmin: boolean;
  precisaTrocarSenha: boolean;
  /**
   * Casas LIGADAS a este login em `acessos`. O admin normalmente não tem
   * nenhuma: abre a casa do cliente pelo endereço (`exigirCasa`), sem carregar
   * a lista de todas a cada página (pendência 43).
   */
  casas: CasaDoLogin[];
};

function paraCasa(c: {
  id: string;
  slug: string;
  nome: string;
  situacao: string;
  fuso: string;
}): CasaDoLogin {
  return {
    id: c.id,
    slug: c.slug,
    nome: c.nome,
    fuso: c.fuso,
    situacao: c.situacao === "suspenso" ? "suspenso" : "ativo",
  };
}

/**
 * Falha ao ler a sessão vira erro de verdade (a tela de erro, `app/error.tsx`),
 * nunca "sem casa": antes ela levava o dono ao "acesso pendente" (pendência
 * 27). O log leva só o código.
 */
function falhaNaSessao(): never {
  logError("falha_leitura_sessao");
  throw new Error("falha_leitura_sessao");
}

/** Uma ida ao Supabase por requisição, mesmo com layout e página pedindo. */
export const obterSessao = cache(async (): Promise<Sessao | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [admin, casas] = await Promise.all([
    supabase.rpc("eh_admin_repply"),
    supabase
      .from("restaurantes")
      .select("id, slug, nome, situacao, fuso, acessos!inner(user_id)")
      .eq("acessos.user_id", user.id)
      .order("nome"),
  ]);
  if (admin.error || casas.error) falhaNaSessao();

  return {
    userId: user.id,
    email: user.email ?? "",
    ehAdmin: admin.data === true,
    precisaTrocarSenha: precisaTrocarSenha(user),
    casas: (casas.data ?? []).map(paraCasa),
  };
});

export function destinoDaSessao(sessao: Sessao): string {
  return destinoDepoisDeEntrar({
    precisaTrocarSenha: sessao.precisaTrocarSenha,
    ehAdmin: sessao.ehAdmin,
    restaurantes: sessao.casas,
  });
}

export async function exigirSessao(): Promise<Sessao> {
  const sessao = await obterSessao();
  if (!sessao) redirect("/entrar");
  return sessao;
}

/** A casa do endereço, para o admin: uma consulta só por requisição (pendência 43). */
const casaPeloEndereco = cache(async (slug: string): Promise<CasaDoLogin | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restaurantes")
    .select("id, slug, nome, situacao, fuso")
    .eq("slug", slug)
    .maybeSingle();
  if (error) falhaNaSessao();
  return data ? paraCasa(data) : null;
});

/**
 * Guarda das telas da casa. O dono abre só as casas ligadas ao login dele. O
 * admin abre qualquer uma, para o suporte (só leitura, D-38), e `modoAdmin`
 * liga a faixa "só leitura" e o Ajustes do admin (D-58).
 */
export async function exigirCasa(
  slug: string
): Promise<{ sessao: Sessao; casa: CasaDoLogin; modoAdmin: boolean }> {
  const sessao = await exigirSessao();
  if (sessao.precisaTrocarSenha) redirect("/trocar-senha");
  if (sessao.ehAdmin) {
    const casa = await casaPeloEndereco(slug);
    if (!casa) redirect("/admin");
    return { sessao, casa, modoAdmin: true };
  }
  const casa = sessao.casas.find((c) => c.slug === slug);
  if (!casa) redirect(destinoDaSessao(sessao));
  if (casa.situacao === "suspenso") redirect("/acesso-pendente");
  return { sessao, casa, modoAdmin: false };
}

export async function exigirAdmin(): Promise<Sessao> {
  const sessao = await exigirSessao();
  if (sessao.precisaTrocarSenha) redirect("/trocar-senha");
  if (!sessao.ehAdmin) redirect(destinoDaSessao(sessao));
  return sessao;
}
```

(O filtro `.eq("acessos.user_id", …)` no recurso embutido com `!inner` foi conferido no `tsc` com os tipos atuais em 15/10/2026: compila.)

Em `lib/auth/destino.ts`, acrescente no fim:

```ts
/**
 * "Trocar de casa" no painel (D-58): para quem tem duas ou mais casas ativas.
 * O admin troca de casa pelo admin.
 */
export function podeTrocarDeCasa(e: {
  ehAdmin: boolean;
  casas: readonly RestauranteDoLogin[];
}): boolean {
  return !e.ehAdmin && e.casas.filter((c) => c.situacao === "ativo").length >= 2;
}
```

Em `lib/auth/actions.ts`:
- acrescente o import `import { logError } from "@/lib/logger";` (junto dos outros `@/lib/...`);
- na função `destinoDe`, logo depois do `const [admin, casas] = await Promise.all([...]);`, acrescente:

```ts
  // Falha passageira ao ler as casas não pode virar "acesso pendente"
  // (pendência 27): a raiz refaz a conta com a sessão já aberta e, se falhar de
  // novo, mostra a tela de erro com "Tentar de novo".
  if (admin.error || casas.error) {
    logError("falha_leitura_sessao");
    return "/";
  }
```

Em `lib/logger.ts`, troque a constante `codigosErro` por:

```ts
const codigosErro = [
  "erro_interno",
  "falha_autenticacao",
  "falha_inesperada",
  "falha_leitura_sinal",
  "falha_leitura_sessao",
  "falha_admin",
  "falha_registro_admin",
  "falha_recalculo_dia",
] as const;
```

Crie `app/error.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";

/**
 * Tela de erro do painel e do admin (pendência 27). Falha passageira ao ler a
 * sessão ou os dados cai aqui, com "Tentar de novo" (`retry` busca a tela de
 * novo no servidor), em vez de virar "acesso pendente" ou lista vazia. A
 * mensagem técnica do erro não aparece.
 */
export default function ErroDaTela({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Não deu para carregar agora</h1>
        <p className="text-sm text-muted-foreground">
          Pode ser uma falha passageira da internet ou do servidor. Tente de
          novo em instantes.
        </p>
      </div>
      <Button size="toque" className="w-full" onClick={() => retry()}>
        Tentar de novo
      </Button>
    </main>
  );
}
```

Rode `npx vitest run tests/auth tests/logger.test.ts tests/painel tests/entrada` → esperado: PASSA.

- [ ] **Passo 3: Verificar e commitar**

```bash
npx biome check --write lib/auth lib/logger.ts app/error.tsx tests/auth tests/logger.test.ts
npx tsc --noEmit
```

(Erros de `tsc` só em `lib/admin/`, `tests/admin/` ou `supabase/functions/` são da Tarefa 2, em paralelo: anote e siga.)

```bash
git fetch && git status -sb && git status --short
git add lib/auth/sessao.ts lib/auth/destino.ts lib/auth/actions.ts lib/logger.ts app/error.tsx tests/auth/sessao.test.ts tests/auth/destino.test.ts tests/auth/actions.test.ts tests/logger.test.ts tests/auth/tela-de-erro.test.tsx
git commit -m "Lê só as casas do login, abre a casa do admin pelo endereço e trata a falha de leitura como erro" -m "Co-Authored-By: <trailer do seu modelo>"
```

---

## Verificação do par 2 ‖ 3 (controlador)

- [ ] Com as Tarefas 2 e 3 commitadas: `npx tsc --noEmit`, `npm run check`, `npx vitest run`, `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 npm run build`. Esperado: tudo limpo. Erro de integração vai para um agente de conserto com a lista completa, antes da Tarefa 4.

---

## Tarefa 4: Funções do servidor do admin e leitura dos dados

**Por quê:** é aqui que mora a decisão de segurança (desenho §2.1): cada função do servidor confere o admin por dentro, grava pelo login do admin (a RLS barra os outros), usa a chave de serviço só para o Auth e registra no histórico. As telas (Tarefas 5 a 7) só chamam estas funções.

**Arquivos (lista fechada):**
- Criar: `lib/admin/tipos.ts`, `lib/admin/dados.ts`, `lib/admin/registro.ts`, `lib/admin/actions.ts`, `components/admin/cartao.tsx`
- Testes (criar): `tests/admin/acoes-recusam.test.ts`, `tests/admin/acoes-contra-o-banco.test.ts`

**Interfaces consumidas:** Tarefa 1 (tabelas, funções e tipos do banco), Tarefa 2 (todo o `lib/admin/*` puro), Tarefa 3 (`exigirAdmin`, `obterSessao`, códigos do `logError`). Do código existente: `AVISO_TROCA` e `precisaTrocarSenha` (`@/lib/auth/nucleo`), `createClient` (`@/lib/supabase/server`), `createServiceClient` (`@/lib/supabase/service`), `estadoDoSinal` (`@/lib/painel/selo`).

**Interfaces produzidas (as Tarefas 5 a 7 usam; nomes e tipos exatos):**
- `@/lib/admin/tipos`: `Resultado<T = void> = { ok: true; data?: T } | { ok: false; error: string }`; `TokenDoDetalhe = { id; prefixo; criadoEm; criadoPor (nome); ultimoUsoEm: string | null; expiraEm: string | null }`; `LoginDoDetalhe = { userId; email; ultimoAcessoEm: string | null; precisaTrocarSenha: boolean; outrasCasas: number }`; `DetalheDoRestaurante = { agoraIso: string; restaurante: { id; slug; nome; cnpj: string | null; fuso; horaVirada ("05:00"); horario: Intervalo[]; situacao: "ativo" | "suspenso"; pedidoReenvioDesde: string | null; intervaloEnvioSegundos: number }; sinal: { estado: EstadoSinal | null; ultimoEnvioOkEm: string | null }; tokens: TokenDoDetalhe[] (válidos, o mais novo primeiro, nunca o hash); logins: LoginDoDetalhe[]; envios: EnvioResumo[] (20); historico: RegistroDoHistorico[] (30) }`; `RestauranteParaEditar = { id: string; nome: string; valores: RestauranteInput }`; `TokenGerado = { token: string; instrucoes: string }`; `LoginCriado = { tipo: "novo"; email: string; senha: string; mensagem: string } | { tipo: "ligado"; email: string; outrasCasas: number }`; `SenhaRedefinida = { email: string; senha: string; mensagem: string; outrasCasas: number }`; `EdicaoSalva = { recalculou: boolean; mudouFuso: boolean }`.
- `@/lib/admin/dados` (só servidor; cada uma começa por `exigirAdmin()`; falha de leitura lança erro e vira a tela de erro): `listarRestaurantes(): Promise<LinhaDaLista[]>`, `detalheDoRestaurante(id: string): Promise<DetalheDoRestaurante | null>`, `restauranteParaEditar(id: string): Promise<RestauranteParaEditar | null>`, `emailsDosLoginsDaCasa(restauranteId: string): Promise<string[]>`.
- `@/lib/admin/registro` (só servidor): `registrarNoHistorico(supabase, e: { autor: string; restauranteId: string; acao: AcaoAdmin; detalhe?: string | null }): Promise<boolean>`, `registrarAberturaDoPainel(restauranteId: string): Promise<void>` (nunca lança; só registra se a sessão for de admin; no máximo uma vez por hora).
- `@/lib/admin/actions` (`"use server"`): `cadastrarRestauranteAction(input: RestauranteInput): Promise<Resultado<{ id: string }>>`, `editarRestauranteAction(id: string, input: RestauranteInput): Promise<Resultado<EdicaoSalva>>`, `gerarTokenAction(restauranteId: string, antigo: "agora" | "24h"): Promise<Resultado<TokenGerado>>`, `revogarTokensAction(restauranteId: string): Promise<Resultado>`, `criarLoginAction(restauranteId: string, input: EmailInput): Promise<Resultado<LoginCriado>>`, `redefinirSenhaAction(restauranteId: string, userId: string): Promise<Resultado<SenhaRedefinida>>`, `trocarEmailAction(restauranteId: string, userId: string, input: EmailInput): Promise<Resultado<{ outrasCasas: number }>>`, `pedirReenvioAction(restauranteId: string, input: { desde: string }): Promise<Resultado>`, `mudarSituacaoAction(restauranteId: string, situacao: "ativo" | "suspenso"): Promise<Resultado>`. Todas chamam `revalidatePath("/admin", "layout")` depois de mudar algo.
- `@/components/admin/cartao`: `Cartao({ titulo: string; children: ReactNode; className?: string })` (componente sem estado, serve no servidor e no navegador).

- [ ] **Passo 1: Teste "recusa sem tocar no banco" (falha)**

Crie `tests/admin/acoes-recusam.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { exigirAdmin, createClient, createServiceClient } = vi.hoisted(() => ({
  exigirAdmin: vi.fn(),
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/sessao", () => ({ exigirAdmin, obterSessao: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient }));

import * as acoes from "@/lib/admin/actions";
import { VALORES_INICIAIS } from "@/lib/admin/schemas";

const ID = "6f1c2b9e-1d2a-4c3b-8a4d-5e6f7a8b9c0d";

const chamadas: [string, () => Promise<unknown>][] = [
  ["cadastrar", () => acoes.cadastrarRestauranteAction(VALORES_INICIAIS)],
  ["editar", () => acoes.editarRestauranteAction(ID, VALORES_INICIAIS)],
  ["gerar token", () => acoes.gerarTokenAction(ID, "agora")],
  ["revogar token", () => acoes.revogarTokensAction(ID)],
  ["criar login", () => acoes.criarLoginAction(ID, { email: "dono@exemplo.com" })],
  ["redefinir senha", () => acoes.redefinirSenhaAction(ID, ID)],
  ["trocar e-mail", () => acoes.trocarEmailAction(ID, ID, { email: "novo@exemplo.com" })],
  ["pedir reenvio", () => acoes.pedirReenvioAction(ID, { desde: "2026-10-01" })],
  ["suspender", () => acoes.mudarSituacaoAction(ID, "suspenso")],
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toda função do servidor do admin confere por dentro (POST direto)", () => {
  it.each(chamadas)(
    "%s recusa quem não é admin sem tocar no banco",
    async (_, chamar) => {
      exigirAdmin.mockRejectedValue(new Error("REDIRECT:/r/casa-x/hoje"));
      await expect(chamar()).rejects.toThrow("REDIRECT");
      expect(createClient).not.toHaveBeenCalled();
      expect(createServiceClient).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["editar", () => acoes.editarRestauranteAction("nao-e-uuid", VALORES_INICIAIS)],
    ["gerar token", () => acoes.gerarTokenAction("nao-e-uuid", "agora")],
    ["revogar token", () => acoes.revogarTokensAction("../outro")],
    ["criar login", () => acoes.criarLoginAction("1 or 1=1", { email: "dono@exemplo.com" })],
    ["redefinir senha", () => acoes.redefinirSenhaAction(ID, "nao-e-uuid")],
    ["trocar e-mail", () => acoes.trocarEmailAction("x", ID, { email: "novo@exemplo.com" })],
    ["pedir reenvio", () => acoes.pedirReenvioAction("x", { desde: "2026-10-01" })],
    ["suspender", () => acoes.mudarSituacaoAction("x", "suspenso")],
  ] as const)(
    "%s com id que não é UUID é recusado sem tocar no banco",
    async (_, chamar) => {
      exigirAdmin.mockResolvedValue({ userId: ID, ehAdmin: true });
      expect(await chamar()).toMatchObject({ ok: false });
      expect(createClient).not.toHaveBeenCalled();
    }
  );

  it("cadastro inválido volta com a frase do campo, sem tocar no banco", async () => {
    exigirAdmin.mockResolvedValue({ userId: ID, ehAdmin: true });
    expect(await acoes.cadastrarRestauranteAction(VALORES_INICIAIS)).toEqual({
      ok: false,
      error: "Digite o nome do restaurante",
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});
```

Rode `npx vitest run tests/admin/acoes-recusam.test.ts` → esperado: FALHA (módulo não existe).

- [ ] **Passo 2: Teste contra o banco e o Auth locais (falha)**

Crie `tests/admin/acoes-contra-o-banco.test.ts`:

```ts
// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";
import {
  conectarBanco,
  envelhecerSinal,
  envelope,
  enviar,
} from "../helpers/supabase-local";

const estado = vi.hoisted(() => ({
  cliente: null as unknown,
  sessao: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "http://127.0.0.1:3000" }),
}));
// O admin de verdade, logado no Auth local: a RLS do banco vale de verdade.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => estado.cliente,
}));
vi.mock("@/lib/auth/sessao", () => ({
  exigirAdmin: async () => estado.sessao,
  obterSessao: async () => estado.sessao,
}));

import {
  cadastrarRestauranteAction,
  criarLoginAction,
  editarRestauranteAction,
  gerarTokenAction,
  mudarSituacaoAction,
  pedirReenvioAction,
  redefinirSenhaAction,
  revogarTokensAction,
  trocarEmailAction,
} from "@/lib/admin/actions";
import { detalheDoRestaurante, listarRestaurantes } from "@/lib/admin/dados";
import { hojeNaCasa, somarDias } from "@/lib/admin/datas";
import { DIA_FECHADO } from "@/lib/admin/horario";
import { registrarAberturaDoPainel } from "@/lib/admin/registro";
import type { RestauranteInput } from "@/lib/admin/schemas";

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const servico = criarCliente<Database>(URL_LOCAL, chaveLocal("service_role"), opcoes);
const sufixo = randomUUID().slice(0, 8);
const email = (quem: string) => `${quem}-${sufixo}@teste.repply.local`;
const senhaDoAdmin = `admin-${randomUUID()}`;
const CNPJ = "13.579.246/0001-01";
const registros: string[] = [];
const segredos: string[] = [];

let banco: Client;
let adminId = "";
let casaA = "";
let casaB = "";
let donoId = "";
let senhaDoDono = "";

function cadastro(nome: string, cnpj = ""): RestauranteInput {
  const dias = Array.from({ length: 7 }, () => ({ ...DIA_FECHADO }));
  dias[2] = { ...DIA_FECHADO, modo: "um" };
  return { nome, cnpj, fuso: "America/Fortaleza", horaVirada: "5", dias };
}

async function entrar(emailDaConta: string, senha: string) {
  const cliente = criarCliente<Database>(URL_LOCAL, chaveLocal("anon"), opcoes);
  const { data, error } = await cliente.auth.signInWithPassword({
    email: emailDaConta,
    password: senha,
  });
  return { cliente, sessao: data.session, error };
}

beforeAll(async () => {
  vi.stubEnv("SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", chaveLocal("service_role"));
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  // Tudo o que o código escrever no registro do servidor fica guardado para o
  // último teste conferir que nenhuma senha nem token vazou.
  for (const metodo of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      registros.push(JSON.stringify(args));
    });
  }
  banco = await conectarBanco();
  const { data, error } = await servico.auth.admin.createUser({
    email: email("admin"),
    password: senhaDoAdmin,
    email_confirm: true,
    user_metadata: { nome: "Admin de Teste" },
  });
  if (error || !data.user) throw new Error("não criou o admin de teste");
  adminId = data.user.id;
  await banco.query("insert into public.admins_repply (user_id) values ($1)", [adminId]);
  const { cliente, error: erroDeEntrada } = await entrar(email("admin"), senhaDoAdmin);
  if (erroDeEntrada) throw new Error("o admin de teste não entrou");
  estado.cliente = cliente;
  estado.sessao = {
    userId: adminId,
    email: email("admin"),
    ehAdmin: true,
    precisaTrocarSenha: false,
    casas: [],
  };
});

afterAll(async () => {
  try {
    await banco.query("delete from public.restaurantes where slug like $1", [`%${sufixo}%`]);
    const contas = await banco.query<{ id: string }>(
      "select id from auth.users where email like $1",
      [`%-${sufixo}@teste.repply.local`]
    );
    for (const { id } of contas.rows) await servico.auth.admin.deleteUser(id);
  } finally {
    await banco.end();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  }
});

describe("funções do servidor do admin contra o banco e o Auth locais", () => {
  it("cadastra duas casas com o mesmo nome: a segunda ganha número no endereço", async () => {
    const primeira = await cadastrarRestauranteAction(cadastro(`Casa Ação ${sufixo}`, CNPJ));
    const segunda = await cadastrarRestauranteAction(cadastro(`Casa Ação ${sufixo}`));
    casaA = (primeira.ok && primeira.data?.id) || "";
    casaB = (segunda.ok && segunda.data?.id) || "";
    const { rows } = await banco.query<{ slug: string; cnpj: string | null; horario: unknown }>(
      `select slug, cnpj, horario_funcionamento as horario from public.restaurantes
        where id = any($1::uuid[]) order by criado_em`,
      [[casaA, casaB]]
    );
    expect(rows.map((r) => r.slug)).toEqual([`casa-acao-${sufixo}`, `casa-acao-${sufixo}-2`]);
    expect(rows[0]?.cnpj).toBe("13579246000101");
    expect(rows[0]?.horario).toEqual([{ dia: 2, abre: "11:00", fecha: "15:00" }]);
  });

  it("CNPJ repetido é recusado com frase do produto", async () => {
    expect(await cadastrarRestauranteAction(cadastro(`Outra ${sufixo}`, CNPJ))).toEqual({
      ok: false,
      error: "Já existe um restaurante com este CNPJ.",
    });
  });

  it("gera o token: aparece uma vez e a recepção aceita", async () => {
    const gerado = await gerarTokenAction(casaA, "agora");
    if (!gerado.ok || !gerado.data) throw new Error("não gerou o token");
    segredos.push(gerado.data.token);
    expect(gerado.data.token).toMatch(/^rf_[0-9A-Za-z]{32}$/);
    expect(gerado.data.instrucoes).toContain(gerado.data.token);
    expect(gerado.data.instrucoes).toContain(
      "http://127.0.0.1:54321/functions/v1/receber-envio"
    );
    expect((await enviar(gerado.data.token, envelope([]))).status).toBe(200);
  });

  it("'em 24 h': o antigo e o novo valem juntos; revogar para os dois", async () => {
    const antigo = segredos[0] ?? "";
    const novo = await gerarTokenAction(casaA, "24h");
    if (!novo.ok || !novo.data) throw new Error("não gerou o token");
    segredos.push(novo.data.token);
    await envelhecerSinal(banco, casaA);
    expect((await enviar(antigo, envelope([]))).status).toBe(200);
    await envelhecerSinal(banco, casaA);
    expect((await enviar(novo.data.token, envelope([]))).status).toBe(200);
    expect(await revogarTokensAction(casaA)).toEqual({ ok: true });
    expect((await enviar(novo.data.token, envelope([]))).status).toBe(401);
    expect(await revogarTokensAction(casaA)).toEqual({
      ok: false,
      error: "Esta casa não tem token válido para revogar.",
    });
  });

  it("cria o login com e-mail novo: senha provisória e troca obrigatória", async () => {
    const criado = await criarLoginAction(casaA, { email: email("dono").toUpperCase() });
    if (!criado.ok || criado.data?.tipo !== "novo") throw new Error("não criou o login");
    senhaDoDono = criado.data.senha;
    segredos.push(senhaDoDono);
    expect(criado.data.email).toBe(email("dono"));
    expect(senhaDoDono).toHaveLength(12);
    expect(criado.data.mensagem).toContain(senhaDoDono);
    expect(criado.data.mensagem).toContain("http://127.0.0.1:3000");
    const { data } = await servico.rpc("id_do_login_por_email", { p_email: email("dono") });
    donoId = data ?? "";
    const conta = await servico.auth.admin.getUserById(donoId);
    expect(conta.data.user?.app_metadata?.precisa_trocar_senha).toBe(true);
    expect((await entrar(email("dono"), senhaDoDono)).error).toBeNull();
  });

  it("o mesmo e-mail na segunda casa liga a conta, sem mudar a senha (D-10)", async () => {
    expect(await criarLoginAction(casaB, { email: email("dono") })).toEqual({
      ok: true,
      data: { tipo: "ligado", email: email("dono"), outrasCasas: 1 },
    });
    expect((await entrar(email("dono"), senhaDoDono)).error).toBeNull();
  });

  it("ligar de novo na mesma casa e ligar um admin são recusados", async () => {
    expect(await criarLoginAction(casaB, { email: email("dono") })).toEqual({
      ok: false,
      error: "Este e-mail já tem acesso a esta casa.",
    });
    expect(await criarLoginAction(casaB, { email: email("admin") })).toEqual({
      ok: false,
      error: "Este e-mail é de um admin da Repply.",
    });
  });

  it("redefinir a senha desconecta os aparelhos e liga a troca obrigatória (D-55)", async () => {
    const aberto = await entrar(email("dono"), senhaDoDono);
    if (!aberto.sessao) throw new Error("o dono não entrou");
    const nova = await redefinirSenhaAction(casaA, donoId);
    if (!nova.ok || !nova.data) throw new Error("não redefiniu");
    segredos.push(nova.data.senha);
    expect(nova.data.outrasCasas).toBe(1);
    expect(nova.data.mensagem).toContain(nova.data.senha);
    expect((await servico.auth.getUser(aberto.sessao.access_token)).data.user).toBeNull();
    expect((await entrar(email("dono"), senhaDoDono)).error?.code).toBe("invalid_credentials");
    expect((await entrar(email("dono"), nova.data.senha)).error).toBeNull();
    const conta = await servico.auth.admin.getUserById(donoId);
    expect(conta.data.user?.app_metadata?.precisa_trocar_senha).toBe(true);
    senhaDoDono = nova.data.senha;
  });

  it("não mexe em login que não é da casa (nem no do admin)", async () => {
    expect(await redefinirSenhaAction(casaA, adminId)).toEqual({
      ok: false,
      error: "Este login não é desta casa.",
    });
  });

  it("troca o e-mail na hora, sem confirmação, e recusa e-mail de outro login", async () => {
    expect(await trocarEmailAction(casaA, donoId, { email: email("admin") })).toEqual({
      ok: false,
      error: "Este e-mail já é de outro login.",
    });
    expect(await trocarEmailAction(casaA, donoId, { email: email("novo") })).toEqual({
      ok: true,
      data: { outrasCasas: 1 },
    });
    expect((await entrar(email("novo"), senhaDoDono)).error).toBeNull();
  });

  it("pede reenvio dentro do limite e recusa data fora dele", async () => {
    const hoje = hojeNaCasa(new Date(), "America/Fortaleza");
    expect(await pedirReenvioAction(casaA, { desde: somarDias(hoje, 1) })).toEqual({
      ok: false,
      error: "A data não pode ser no futuro.",
    });
    expect(await pedirReenvioAction(casaA, { desde: somarDias(hoje, -121) })).toEqual({
      ok: false,
      error: "A data não pode ser anterior a 120 dias.",
    });
    expect(await pedirReenvioAction(casaA, { desde: somarDias(hoje, -3) })).toEqual({ ok: true });
    const { rows } = await banco.query<{ desde: string }>(
      "select pedido_reenvio_desde::text as desde from public.restaurantes where id = $1",
      [casaA]
    );
    expect(rows[0]?.desde).toBe(somarDias(hoje, -3));
  });

  it("suspende e reativa (D-57)", async () => {
    expect(await mudarSituacaoAction(casaB, "suspenso")).toEqual({ ok: true });
    const lido = await banco.query("select situacao from public.restaurantes where id = $1", [casaB]);
    expect(lido.rows[0]).toEqual({ situacao: "suspenso" });
    expect(await mudarSituacaoAction(casaB, "ativo")).toEqual({ ok: true });
  });

  it("editar a virada recalcula o dia de operação das contas", async () => {
    // Conta aberta às 03:00 de 10/10 em Fortaleza: com a virada às 5h é do dia
    // 09; com a virada às 2h passa a ser do dia 10.
    await banco.query(
      `insert into public.entradas (restaurante_id, cod_entrada, aberta_em, dia_operacao, valor_consumido, pago, hash_origem)
       values ($1, 1, '2026-10-10T06:00:00Z', '2026-10-09', 10, true, 'teste-virada')`,
      [casaA]
    );
    expect(
      await editarRestauranteAction(casaA, {
        ...cadastro(`Casa Ação ${sufixo}`, CNPJ),
        horaVirada: "2",
      })
    ).toEqual({ ok: true, data: { recalculou: true, mudouFuso: false } });
    const { rows } = await banco.query<{ dia: string }>(
      "select dia_operacao::text as dia from public.entradas where restaurante_id = $1",
      [casaA]
    );
    expect(rows[0]?.dia).toBe("2026-10-10");
  });

  it("o detalhe junta tudo, sem o hash do token, com o nome de quem fez", async () => {
    const gerado = await gerarTokenAction(casaA, "agora");
    if (gerado.ok && gerado.data) segredos.push(gerado.data.token);
    const detalhe = await detalheDoRestaurante(casaA);
    if (!detalhe) throw new Error("sem detalhe");
    expect(detalhe.restaurante.horaVirada).toBe("02:00");
    expect(detalhe.restaurante.pedidoReenvioDesde).not.toBeNull();
    expect(detalhe.tokens).toHaveLength(1);
    expect(Object.keys(detalhe.tokens[0] ?? {})).not.toContain("hash");
    expect(detalhe.tokens[0]?.criadoPor).toBe("Admin de Teste");
    expect(detalhe.logins).toEqual([
      expect.objectContaining({
        userId: donoId,
        email: email("novo"),
        precisaTrocarSenha: true,
        outrasCasas: 1,
      }),
    ]);
    expect(detalhe.envios.length).toBeGreaterThan(0);
    expect(detalhe.historico.map((h) => h.acao)).toEqual(
      expect.arrayContaining([
        "cadastrou",
        "gerou_token",
        "revogou_token",
        "criou_login",
        "redefiniu_senha",
        "trocou_email",
        "pediu_reenvio",
        "editou_dados",
      ])
    );
    expect(detalhe.historico.every((h) => h.autor === "Admin de Teste")).toBe(true);
    expect(await detalheDoRestaurante(randomUUID())).toBeNull();
    expect(await detalheDoRestaurante("nao-e-uuid")).toBeNull();
  });

  it("a lista traz as casas novas com a versão do SCC", async () => {
    const minhas = (await listarRestaurantes()).filter((l) => l.slug.includes(sufixo));
    expect(minhas.map((l) => l.id).sort()).toEqual([casaA, casaB].sort());
    expect(minhas.find((l) => l.id === casaA)?.versaoScc).toBe("teste-1.0");
  });

  it("'abriu o painel' entra uma vez por hora", async () => {
    await registrarAberturaDoPainel(casaB);
    await registrarAberturaDoPainel(casaB);
    const { rows } = await banco.query<{ total: number }>(
      "select count(*)::int as total from public.registro_admin where restaurante_id = $1 and acao = 'abriu_painel'",
      [casaB]
    );
    expect(rows[0]?.total).toBe(1);
  });

  it("o histórico não guarda senha, token nem e-mail completo (D-59)", async () => {
    const { rows } = await banco.query<{ detalhe: string | null }>(
      "select detalhe from public.registro_admin where restaurante_id = any($1::uuid[])",
      [[casaA, casaB]]
    );
    const tudo = rows.map((r) => r.detalhe ?? "").join("\n");
    for (const segredo of [...segredos, email("dono"), email("novo")]) {
      expect(tudo).not.toContain(segredo);
    }
  });

  it("nenhuma senha nem token foi para o registro do servidor", () => {
    expect(segredos.length).toBeGreaterThanOrEqual(5);
    const tudo = registros.join("\n");
    for (const segredo of segredos) expect(tudo).not.toContain(segredo);
  });
});
```

Rode `npx vitest run tests/admin/acoes-contra-o-banco.test.ts` → esperado: FALHA (módulos não existem).

- [ ] **Passo 3: Tipos, histórico e casca dos cartões**

Crie `lib/admin/tipos.ts`:

```ts
import type { EstadoSinal } from "@/lib/painel/selo";
import type { EnvioResumo } from "./envios";
import type { RegistroDoHistorico } from "./historico";
import type { Intervalo } from "./horario";
import type { RestauranteInput } from "./schemas";

/** O que toda função do servidor do admin devolve (CLAUDE.md §5). */
export type Resultado<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type TokenDoDetalhe = {
  id: string;
  prefixo: string;
  criadoEm: string;
  /** Nome de quem gerou (`nomeDoAutor`). */
  criadoPor: string;
  ultimoUsoEm: string | null;
  /** Só no token que está saindo (troca "em 24 h"). */
  expiraEm: string | null;
};

export type LoginDoDetalhe = {
  userId: string;
  email: string;
  ultimoAcessoEm: string | null;
  precisaTrocarSenha: boolean;
  /** Quantas OUTRAS casas este login abre (dono com duas casas, D-10). */
  outrasCasas: number;
};

export type DetalheDoRestaurante = {
  /** Momento da leitura no servidor: base de "usado há…" e do "hoje". */
  agoraIso: string;
  restaurante: {
    id: string;
    slug: string;
    nome: string;
    cnpj: string | null;
    fuso: string;
    /** "05:00" */
    horaVirada: string;
    horario: Intervalo[];
    situacao: "ativo" | "suspenso";
    pedidoReenvioDesde: string | null;
    intervaloEnvioSegundos: number;
  };
  sinal: { estado: EstadoSinal | null; ultimoEnvioOkEm: string | null };
  /** Válidos, o mais novo primeiro. Nunca o hash. */
  tokens: TokenDoDetalhe[];
  logins: LoginDoDetalhe[];
  /** Os 20 mais recentes. */
  envios: EnvioResumo[];
  /** As 30 ações mais recentes. */
  historico: RegistroDoHistorico[];
};

export type RestauranteParaEditar = {
  id: string;
  nome: string;
  valores: RestauranteInput;
};

export type TokenGerado = { token: string; instrucoes: string };

export type LoginCriado =
  | { tipo: "novo"; email: string; senha: string; mensagem: string }
  | { tipo: "ligado"; email: string; outrasCasas: number };

export type SenhaRedefinida = {
  email: string;
  senha: string;
  mensagem: string;
  outrasCasas: number;
};

export type EdicaoSalva = { recalculou: boolean; mudouFuso: boolean };
```

Crie `lib/admin/registro.ts`:

```ts
import "server-only";
import { obterSessao } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import type { AcaoAdmin } from "./historico";

type ClienteServidor = Awaited<ReturnType<typeof createClient>>;

/**
 * Uma linha no histórico (D-59), pelo login do admin: a RLS só aceita
 * `autor = auth.uid()`. A falha não desfaz a ação, que já aconteceu: fica no
 * log pelo código, e a função devolve `false`.
 */
export async function registrarNoHistorico(
  supabase: ClienteServidor,
  e: {
    autor: string;
    restauranteId: string;
    acao: AcaoAdmin;
    detalhe?: string | null;
  }
): Promise<boolean> {
  const { error } = await supabase.from("registro_admin").insert({
    autor: e.autor,
    restaurante_id: e.restauranteId,
    acao: e.acao,
    detalhe: e.detalhe ?? null,
  });
  if (error) {
    logError("falha_registro_admin");
    return false;
  }
  return true;
}

/**
 * "abriu o painel do cliente" (D-59), chamado pelo layout da casa. O banco
 * aceita no máximo uma linha por hora por admin e casa (índice único): a
 * segunda tentativa dá 23505 e não é falha. Nunca lança: o painel abre mesmo
 * se o histórico falhar.
 */
export async function registrarAberturaDoPainel(restauranteId: string): Promise<void> {
  try {
    const sessao = await obterSessao();
    if (!sessao?.ehAdmin) return;
    const supabase = await createClient();
    const { error } = await supabase.from("registro_admin").insert({
      autor: sessao.userId,
      restaurante_id: restauranteId,
      acao: "abriu_painel",
    });
    if (error && error.code !== "23505") logError("falha_registro_admin");
  } catch {
    logError("falha_registro_admin");
  }
}
```

Crie `components/admin/cartao.tsx`:

```tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Os cartões do detalhe do restaurante (tela aprovada `docs/telas/admin.html`). */
export function Cartao({
  titulo,
  children,
  className,
}: {
  titulo: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-background p-4",
        className
      )}
    >
      <h2 className="label-mono text-quiet">{titulo}</h2>
      {children}
    </section>
  );
}
```

- [ ] **Passo 4: Leitura dos dados**

Crie `lib/admin/dados.ts`:

```ts
import "server-only";
import { precisaTrocarSenha } from "@/lib/auth/nucleo";
import { exigirAdmin } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { estadoDoSinal } from "@/lib/painel/selo";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database.types";
import { z } from "zod";
import type { EnvioResumo } from "./envios";
import { type RegistroDoHistorico, acaoAdmin, nomeDoAutor } from "./historico";
import { intervalosSchema } from "./horario";
import type { LinhaDaLista } from "./lista";
import { formularioDoRestaurante } from "./schemas";
import type {
  DetalheDoRestaurante,
  LoginDoDetalhe,
  RestauranteParaEditar,
  TokenDoDetalhe,
} from "./tipos";

type LinhaDaVisao = Database["public"]["Views"]["restaurantes_no_admin"]["Row"];
type ClienteServidor = Awaited<ReturnType<typeof createClient>>;
type Servico = ReturnType<typeof createServiceClient>;
type UsuarioDoAuth = {
  email: string;
  nome: unknown;
  ultimoAcessoEm: string | null;
  precisaTrocarSenha: boolean;
};

const idSchema = z.uuid();

/** Falha de leitura vira a tela de erro, nunca lista vazia (pendência 27). */
function falhou(): never {
  logError("falha_admin");
  throw new Error("falha_leitura_admin");
}

function linhaDaVisao(l: LinhaDaVisao): LinhaDaLista | null {
  if (!l.id || !l.slug || !l.nome || !l.fuso) return null;
  return {
    id: l.id,
    slug: l.slug,
    nome: l.nome,
    situacao: l.situacao === "suspenso" ? "suspenso" : "ativo",
    fuso: l.fuso,
    estado: estadoDoSinal(l.estado),
    ultimoEnvioOkEm: l.ultimo_envio_ok_em,
    versaoScc: l.versao_scc,
  };
}

/** A lista do admin, pela visão `restaurantes_no_admin` (vale a RLS do admin). */
export async function listarRestaurantes(): Promise<LinhaDaLista[]> {
  await exigirAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restaurantes_no_admin")
    .select("id, slug, nome, situacao, fuso, estado, ultimo_envio_ok_em, versao_scc");
  if (error) falhou();
  return (data ?? []).flatMap((linha) => {
    const lida = linhaDaVisao(linha);
    return lida ? [lida] : [];
  });
}

/**
 * Contas do Auth pelo id, com a chave de serviço. Só é chamada depois de
 * `exigirAdmin()`, com ids que a RLS do admin acabou de devolver.
 */
async function lerUsuarios(
  servico: Servico,
  ids: readonly string[]
): Promise<Map<string, UsuarioDoAuth | null>> {
  const unicos = [...new Set(ids)];
  const lidos = await Promise.all(
    unicos.map(async (id): Promise<[string, UsuarioDoAuth | null]> => {
      const { data, error } = await servico.auth.admin.getUserById(id);
      if (error || !data.user) return [id, null];
      return [
        id,
        {
          email: data.user.email ?? "",
          nome: data.user.user_metadata?.nome,
          ultimoAcessoEm: data.user.last_sign_in_at ?? null,
          precisaTrocarSenha: precisaTrocarSenha(data.user),
        },
      ];
    })
  );
  return new Map(lidos);
}

/** Quantas OUTRAS casas cada login abre. */
async function contarOutrasCasas(
  supabase: ClienteServidor,
  ids: readonly string[],
  restauranteId: string
): Promise<Map<string, number>> {
  const contagem = new Map<string, number>();
  if (ids.length === 0) return contagem;
  const { data, error } = await supabase
    .from("acessos")
    .select("user_id, restaurante_id")
    .in("user_id", [...ids]);
  if (error) falhou();
  for (const acesso of data ?? []) {
    if (acesso.restaurante_id !== restauranteId) {
      contagem.set(acesso.user_id, (contagem.get(acesso.user_id) ?? 0) + 1);
    }
  }
  return contagem;
}

export async function detalheDoRestaurante(
  id: string
): Promise<DetalheDoRestaurante | null> {
  await exigirAdmin();
  if (!idSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  const agora = new Date();

  const [restaurante, sinal, tokens, acessos, envios, historico] = await Promise.all([
    supabase
      .from("restaurantes")
      .select(
        "id, slug, nome, cnpj, fuso, hora_virada, horario_funcionamento, situacao, pedido_reenvio_desde, intervalo_envio_segundos"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("sinal_de_vida")
      .select("estado, ultimo_envio_ok_em")
      .eq("restaurante_id", id)
      .maybeSingle(),
    // Nunca o hash (desenho §2.5).
    supabase
      .from("tokens_envio")
      .select("id, prefixo, criado_em, criado_por, ultimo_uso_em, expira_em")
      .eq("restaurante_id", id)
      .is("revogado_em", null)
      .order("criado_em", { ascending: false }),
    supabase.from("acessos").select("user_id").eq("restaurante_id", id),
    supabase
      .from("envios")
      .select(
        "id, recebido_em, http_status, erro, recebidas, gravadas, inalteradas, removidas, versao_scc, campos_desconhecidos"
      )
      .eq("restaurante_id", id)
      .order("recebido_em", { ascending: false })
      .limit(20),
    supabase
      .from("registro_admin")
      .select("id, criado_em, autor, acao, detalhe")
      .eq("restaurante_id", id)
      .order("criado_em", { ascending: false })
      .limit(30),
  ]);
  if (
    restaurante.error ||
    sinal.error ||
    tokens.error ||
    acessos.error ||
    envios.error ||
    historico.error
  ) {
    falhou();
  }
  const r = restaurante.data;
  if (!r) return null;

  const tokensValidos = (tokens.data ?? []).filter(
    (t) => t.expira_em === null || Date.parse(t.expira_em) > agora.getTime()
  );
  const idsDosLogins = (acessos.data ?? []).map((a) => a.user_id);
  const autores = [
    ...(historico.data ?? []).flatMap((h) => (h.autor ? [h.autor] : [])),
    ...tokensValidos.flatMap((t) => (t.criado_por ? [t.criado_por] : [])),
  ];
  const [usuarios, outrasCasas] = await Promise.all([
    lerUsuarios(createServiceClient(), [...idsDosLogins, ...autores]),
    contarOutrasCasas(supabase, idsDosLogins, id),
  ]);
  const nome = (autor: string | null) =>
    autor ? nomeDoAutor(usuarios.get(autor) ?? { email: null }) : "admin removido";

  const logins: LoginDoDetalhe[] = idsDosLogins.map((userId) => {
    const usuario = usuarios.get(userId);
    // Sem ler a conta não dá para mostrar o acesso do cliente com verdade.
    if (!usuario) falhou();
    return {
      userId,
      email: usuario.email,
      ultimoAcessoEm: usuario.ultimoAcessoEm,
      precisaTrocarSenha: usuario.precisaTrocarSenha,
      outrasCasas: outrasCasas.get(userId) ?? 0,
    };
  });

  const tokensDoDetalhe: TokenDoDetalhe[] = tokensValidos.map((t) => ({
    id: t.id,
    prefixo: t.prefixo,
    criadoEm: t.criado_em,
    criadoPor: nome(t.criado_por),
    ultimoUsoEm: t.ultimo_uso_em,
    expiraEm: t.expira_em,
  }));

  const enviosDoDetalhe: EnvioResumo[] = (envios.data ?? []).map((e) => ({
    id: e.id,
    recebidoEm: e.recebido_em,
    httpStatus: e.http_status,
    erro: e.erro,
    recebidas: e.recebidas,
    gravadas: e.gravadas,
    inalteradas: e.inalteradas,
    removidas: e.removidas,
    versaoScc: e.versao_scc,
    camposDesconhecidos: e.campos_desconhecidos,
  }));

  const historicoMostrado: RegistroDoHistorico[] = (historico.data ?? []).flatMap((h) => {
    const acao = acaoAdmin(h.acao);
    if (!acao) return [];
    return [
      { id: h.id, criadoEm: h.criado_em, autor: nome(h.autor), acao, detalhe: h.detalhe },
    ];
  });

  const horario = intervalosSchema.safeParse(r.horario_funcionamento);
  return {
    agoraIso: agora.toISOString(),
    restaurante: {
      id: r.id,
      slug: r.slug,
      nome: r.nome,
      cnpj: r.cnpj,
      fuso: r.fuso,
      horaVirada: r.hora_virada.slice(0, 5),
      horario: horario.success ? horario.data : [],
      situacao: r.situacao === "suspenso" ? "suspenso" : "ativo",
      pedidoReenvioDesde: r.pedido_reenvio_desde,
      intervaloEnvioSegundos: r.intervalo_envio_segundos,
    },
    sinal: {
      estado: estadoDoSinal(sinal.data?.estado),
      ultimoEnvioOkEm: sinal.data?.ultimo_envio_ok_em ?? null,
    },
    tokens: tokensDoDetalhe,
    logins,
    envios: enviosDoDetalhe,
    historico: historicoMostrado,
  };
}

export async function restauranteParaEditar(
  id: string
): Promise<RestauranteParaEditar | null> {
  await exigirAdmin();
  if (!idSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restaurantes")
    .select("id, nome, cnpj, fuso, hora_virada, horario_funcionamento")
    .eq("id", id)
    .maybeSingle();
  if (error) falhou();
  if (!data) return null;
  return { id: data.id, nome: data.nome, valores: formularioDoRestaurante(data) };
}

/** Os e-mails dos logins da casa, para o Ajustes do admin (D-58). */
export async function emailsDosLoginsDaCasa(restauranteId: string): Promise<string[]> {
  await exigirAdmin();
  if (!idSchema.safeParse(restauranteId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acessos")
    .select("user_id")
    .eq("restaurante_id", restauranteId);
  if (error) falhou();
  const usuarios = await lerUsuarios(
    createServiceClient(),
    (data ?? []).map((a) => a.user_id)
  );
  return [...usuarios.values()].flatMap((u) => (u?.email ? [u.email] : []));
}
```

- [ ] **Passo 5: As funções do servidor**

Crie `lib/admin/actions.ts`:

```ts
"use server";

import { AVISO_TROCA } from "@/lib/auth/nucleo";
import { exigirAdmin } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { dataBr, hojeNaCasa } from "./datas";
import { type Intervalo, intervalosSchema } from "./horario";
import { enderecoDaRecepcao, instrucoesParaScc, mensagemDoLogin } from "./mensagens";
import { registrarNoHistorico } from "./registro";
import {
  type DadosDoRestaurante,
  type EmailInput,
  type RestauranteInput,
  emailSchema,
  paraOBanco,
  problemaNoReenvio,
  restauranteSchema,
} from "./schemas";
import { gerarSenhaProvisoria } from "./senha-provisoria";
import { slugDoNome, slugLivre } from "./slug";
import { mascararEmail } from "./texto";
import type {
  EdicaoSalva,
  LoginCriado,
  Resultado,
  SenhaRedefinida,
  TokenGerado,
} from "./tipos";
import { gerarToken, hashDoToken, prefixoDoToken } from "./token";

/*
 * Funções do servidor do admin (desenho §2.1). Regras de TODAS:
 *   1. a primeira linha é `await exigirAdmin()`: toda função daqui é chamável
 *      por POST direto, então a decisão mora aqui, não na página;
 *   2. ids que chegam do navegador são conferidos: formato UUID, casa lida
 *      pela RLS do admin, login ligado à casa e que não é admin;
 *   3. a tela recebe frase do produto; o log, só o código. Senha e token
 *      nunca vão para log nem para o histórico;
 *   4. escrita que deveria mudar uma linha e mudou zero é erro.
 */

const FALHA = "Não foi possível concluir agora. Tente de novo em instantes.";
const NAO_ENCONTRADO = "Restaurante não encontrado.";
const idSchema = z.uuid();

type ClienteServidor = Awaited<ReturnType<typeof createClient>>;
type Casa = {
  id: string;
  nome: string;
  fuso: string;
  intervalo_envio_segundos: number;
};

function falha(): { ok: false; error: string } {
  logError("falha_admin");
  return { ok: false, error: FALHA };
}

function recusa(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function primeiroErro(issues: readonly { message: string }[]): string {
  return issues[0]?.message ?? "Confira os dados";
}

function idsValidos(...ids: string[]): boolean {
  return ids.every((id) => idSchema.safeParse(id).success);
}

/** A lista e o detalhe do admin se atualizam depois de qualquer mudança. */
function atualizarTelas(): void {
  revalidatePath("/admin", "layout");
}

async function enderecoDoPainel(): Promise<string> {
  const origem = (await headers()).get("origin");
  return process.env.NEXT_PUBLIC_APP_URL || origem || "https://food.repplyhub.com.br";
}

/** A casa pelo login do admin: a RLS só devolve se for admin. */
async function lerCasa(
  supabase: ClienteServidor,
  id: string
): Promise<Casa | "nao_encontrada" | "falhou"> {
  const { data, error } = await supabase
    .from("restaurantes")
    .select("id, nome, fuso, intervalo_envio_segundos")
    .eq("id", id)
    .maybeSingle();
  if (error) return "falhou";
  return data ?? "nao_encontrada";
}

/** O login precisa ser desta casa e não pode ser de um admin da Repply. */
async function conferirLogin(
  supabase: ClienteServidor,
  restauranteId: string,
  userId: string
): Promise<string | null> {
  const [acesso, admin] = await Promise.all([
    supabase
      .from("acessos")
      .select("user_id")
      .eq("restaurante_id", restauranteId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("admins_repply").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (acesso.error || admin.error) {
    logError("falha_admin");
    return FALHA;
  }
  if (!acesso.data) return "Este login não é desta casa.";
  if (admin.data) return "Este login é de um admin da Repply e não muda por aqui.";
  return null;
}

async function contarOutrasCasas(
  supabase: ClienteServidor,
  userId: string,
  restauranteId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("acessos")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("restaurante_id", restauranteId);
  if (error) {
    logError("falha_admin");
    return 0;
  }
  return count ?? 0;
}

function chaveDoHorario(lista: readonly Intervalo[]): string {
  return JSON.stringify(
    [...lista].sort((a, b) => a.dia - b.dia || (a.abre < b.abre ? -1 : 1))
  );
}

/** "nome, CNPJ, fuso, virada do dia, horário" (só o que mudou). */
function camposQueMudaram(
  atual: {
    nome: string;
    cnpj: string | null;
    fuso: string;
    hora_virada: string;
    horario_funcionamento: unknown;
  },
  novo: DadosDoRestaurante
): string {
  const mudou: string[] = [];
  if (atual.nome !== novo.nome) mudou.push("nome");
  if (atual.cnpj !== novo.cnpj) mudou.push("CNPJ");
  if (atual.fuso !== novo.fuso) mudou.push("fuso");
  if (atual.hora_virada.slice(0, 5) !== novo.hora_virada) mudou.push("virada do dia");
  const antes = intervalosSchema.safeParse(atual.horario_funcionamento);
  if (chaveDoHorario(antes.success ? antes.data : []) !== chaveDoHorario(novo.horario_funcionamento)) {
    mudou.push("horário");
  }
  return mudou.length > 0 ? mudou.join(", ") : "sem mudança";
}

export async function cadastrarRestauranteAction(
  input: RestauranteInput
): Promise<Resultado<{ id: string }>> {
  const sessao = await exigirAdmin();
  const dados = restauranteSchema.safeParse(input);
  if (!dados.success) return recusa(primeiroErro(dados.error.issues));
  const banco = paraOBanco(dados.data);
  const supabase = await createClient();

  if (banco.cnpj) {
    const { data: mesmo, error } = await supabase
      .from("restaurantes")
      .select("id")
      .eq("cnpj", banco.cnpj)
      .maybeSingle();
    if (error) return falha();
    if (mesmo) return recusa("Já existe um restaurante com este CNPJ.");
  }

  // O endereço sai do nome e não muda depois (links e favoritos do dono).
  const base = slugDoNome(banco.nome);
  const { data: parecidos, error: erroDoEndereco } = await supabase
    .from("restaurantes")
    .select("slug")
    .like("slug", `${base}%`);
  if (erroDoEndereco) return falha();
  const slug = slugLivre(base, (parecidos ?? []).map((r) => r.slug));

  const { data: criado, error } = await supabase
    .from("restaurantes")
    .insert({ slug, ...banco })
    .select("id")
    .single();
  if (error?.code === "23505") {
    return recusa(
      "Outro cadastro com o mesmo endereço ou CNPJ acabou de ser salvo. Confira a lista e tente de novo."
    );
  }
  if (error || !criado) return falha();

  await registrarNoHistorico(supabase, {
    autor: sessao.userId,
    restauranteId: criado.id,
    acao: "cadastrou",
    detalhe: banco.nome,
  });
  atualizarTelas();
  return { ok: true, data: { id: criado.id } };
}

export async function editarRestauranteAction(
  id: string,
  input: RestauranteInput
): Promise<Resultado<EdicaoSalva>> {
  const sessao = await exigirAdmin();
  if (!idsValidos(id)) return recusa(NAO_ENCONTRADO);
  const dados = restauranteSchema.safeParse(input);
  if (!dados.success) return recusa(primeiroErro(dados.error.issues));
  const banco = paraOBanco(dados.data);
  const supabase = await createClient();

  const { data: atual, error: erroAtual } = await supabase
    .from("restaurantes")
    .select("nome, cnpj, fuso, hora_virada, horario_funcionamento")
    .eq("id", id)
    .maybeSingle();
  if (erroAtual) return falha();
  if (!atual) return recusa(NAO_ENCONTRADO);

  if (banco.cnpj && banco.cnpj !== atual.cnpj) {
    const { data: outro, error } = await supabase
      .from("restaurantes")
      .select("id")
      .eq("cnpj", banco.cnpj)
      .neq("id", id)
      .maybeSingle();
    if (error) return falha();
    if (outro) return recusa("Já existe um restaurante com este CNPJ.");
  }

  const { count, error } = await supabase
    .from("restaurantes")
    .update(banco, { count: "exact" })
    .eq("id", id);
  if (error?.code === "23505") return recusa("Já existe um restaurante com este CNPJ.");
  if (error) return falha();
  if (count !== 1) return recusa(NAO_ENCONTRADO);

  const mudouFuso = banco.fuso !== atual.fuso;
  const mudouVirada = banco.hora_virada !== atual.hora_virada.slice(0, 5);
  let recalculou = false;
  let recalculoFalhou = false;
  if (mudouFuso || mudouVirada) {
    // O dia de operação das contas depende do fuso e da virada (CLAUDE.md §7).
    const { error: erroDoRecalculo } = await createServiceClient().rpc(
      "recalcular_dia_operacao",
      { p_restaurante_id: id }
    );
    if (erroDoRecalculo) {
      logError("falha_recalculo_dia");
      recalculoFalhou = true;
    } else {
      recalculou = true;
    }
  }

  await registrarNoHistorico(supabase, {
    autor: sessao.userId,
    restauranteId: id,
    acao: "editou_dados",
    detalhe: camposQueMudaram(atual, banco),
  });
  atualizarTelas();
  if (recalculoFalhou) {
    return recusa(
      "Os dados foram salvos, mas o dia de operação das contas não foi recalculado. Avise a equipe técnica."
    );
  }
  return { ok: true, data: { recalculou, mudouFuso } };
}

export async function gerarTokenAction(
  restauranteId: string,
  antigo: "agora" | "24h"
): Promise<Resultado<TokenGerado>> {
  await exigirAdmin();
  if (!idsValidos(restauranteId)) return recusa(NAO_ENCONTRADO);
  if (antigo !== "agora" && antigo !== "24h") {
    return recusa("Escolha quando o token antigo para.");
  }
  const supabase = await createClient();
  const casa = await lerCasa(supabase, restauranteId);
  if (casa === "falhou") return falha();
  if (casa === "nao_encontrada") return recusa(NAO_ENCONTRADO);

  const token = gerarToken();
  // A troca e o histórico acontecem numa transação só, no banco (D-38).
  const { error } = await supabase.rpc("trocar_token_envio", {
    p_restaurante: restauranteId,
    p_hash: hashDoToken(token),
    p_prefixo: prefixoDoToken(token),
    p_antigo: antigo,
  });
  if (error?.code === "42501") return recusa("Só a equipe Repply pode gerar token.");
  if (error?.code === "P0002") return recusa(NAO_ENCONTRADO);
  if (error) return falha();

  atualizarTelas();
  return {
    ok: true,
    data: {
      token,
      instrucoes: instrucoesParaScc({
        nome: casa.nome,
        endereco: enderecoDaRecepcao(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""),
        token,
        intervaloSegundos: casa.intervalo_envio_segundos,
      }),
    },
  };
}

export async function revogarTokensAction(restauranteId: string): Promise<Resultado> {
  await exigirAdmin();
  if (!idsValidos(restauranteId)) return recusa(NAO_ENCONTRADO);
  const supabase = await createClient();
  const { error } = await supabase.rpc("revogar_tokens_envio", {
    p_restaurante: restauranteId,
  });
  if (error?.code === "P0001") return recusa("Esta casa não tem token válido para revogar.");
  if (error?.code === "P0002") return recusa(NAO_ENCONTRADO);
  if (error?.code === "42501") return recusa("Só a equipe Repply pode revogar token.");
  if (error) return falha();
  atualizarTelas();
  return { ok: true };
}

/** "Criar login" com um e-mail que já tem conta: liga a casa, sem mudar a senha (D-10). */
async function ligarLoginExistente(
  supabase: ClienteServidor,
  autor: string,
  restauranteId: string,
  userId: string,
  email: string
): Promise<Resultado<LoginCriado>> {
  const { data: admin, error: erroAdmin } = await supabase
    .from("admins_repply")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (erroAdmin) return falha();
  if (admin) return recusa("Este e-mail é de um admin da Repply.");

  const { error } = await supabase
    .from("acessos")
    .insert({ user_id: userId, restaurante_id: restauranteId });
  if (error?.code === "23505") return recusa("Este e-mail já tem acesso a esta casa.");
  if (error) return falha();

  const outrasCasas = await contarOutrasCasas(supabase, userId, restauranteId);
  await registrarNoHistorico(supabase, {
    autor,
    restauranteId,
    acao: "ligou_login",
    detalhe: mascararEmail(email),
  });
  atualizarTelas();
  return { ok: true, data: { tipo: "ligado", email, outrasCasas } };
}

export async function criarLoginAction(
  restauranteId: string,
  input: EmailInput
): Promise<Resultado<LoginCriado>> {
  const sessao = await exigirAdmin();
  if (!idsValidos(restauranteId)) return recusa(NAO_ENCONTRADO);
  const dados = emailSchema.safeParse(input);
  if (!dados.success) return recusa(primeiroErro(dados.error.issues));
  const { email } = dados.data;
  const supabase = await createClient();
  const casa = await lerCasa(supabase, restauranteId);
  if (casa === "falhou") return falha();
  if (casa === "nao_encontrada") return recusa(NAO_ENCONTRADO);
  const servico = createServiceClient();

  const existente = await servico.rpc("id_do_login_por_email", { p_email: email });
  if (existente.error) return falha();
  if (existente.data) {
    return ligarLoginExistente(supabase, sessao.userId, restauranteId, existente.data, email);
  }

  const senha = gerarSenhaProvisoria();
  const criado = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    app_metadata: { [AVISO_TROCA]: true },
  });
  if (criado.error?.code === "email_exists") {
    // Outro admin criou a mesma conta agora há pouco: liga em vez de criar.
    const deNovo = await servico.rpc("id_do_login_por_email", { p_email: email });
    if (deNovo.error || !deNovo.data) return falha();
    return ligarLoginExistente(supabase, sessao.userId, restauranteId, deNovo.data, email);
  }
  if (criado.error || !criado.data.user) return falha();
  const userId = criado.data.user.id;

  const { error: erroDoAcesso } = await supabase
    .from("acessos")
    .insert({ user_id: userId, restaurante_id: restauranteId });
  if (erroDoAcesso) {
    // Sem a ligação a conta não serve, e a senha não foi mostrada: desfaz a
    // conta recém-criada para o próximo "Criar login" começar do zero.
    await servico.auth.admin.deleteUser(userId);
    return falha();
  }

  await registrarNoHistorico(supabase, {
    autor: sessao.userId,
    restauranteId,
    acao: "criou_login",
    detalhe: mascararEmail(email),
  });
  atualizarTelas();
  return {
    ok: true,
    data: {
      tipo: "novo",
      email,
      senha,
      mensagem: mensagemDoLogin({ endereco: await enderecoDoPainel(), email, senha }),
    },
  };
}

export async function redefinirSenhaAction(
  restauranteId: string,
  userId: string
): Promise<Resultado<SenhaRedefinida>> {
  const sessao = await exigirAdmin();
  if (!idsValidos(restauranteId, userId)) return recusa("Login não encontrado.");
  const supabase = await createClient();
  const problema = await conferirLogin(supabase, restauranteId, userId);
  if (problema) return recusa(problema);

  const servico = createServiceClient();
  const senha = gerarSenhaProvisoria();
  const { data, error } = await servico.auth.admin.updateUserById(userId, {
    password: senha,
    app_metadata: { [AVISO_TROCA]: true },
  });
  const email = data.user?.email;
  if (error || data.user?.app_metadata?.[AVISO_TROCA] !== true || !email) return falha();

  // Desconecta os aparelhos daquele login (D-55). O Auth local (v2.197) já
  // derruba as sessões quando o admin troca a senha, mas isso não é contrato:
  // a função do banco garante. Zero sessões encerradas é normal.
  const encerradas = await servico.rpc("encerrar_sessoes_do_login", { p_user_id: userId });
  if (encerradas.error) {
    logError("falha_admin");
    return recusa(
      "A senha nova foi gravada, mas não deu para desconectar os aparelhos. Clique em “Redefinir senha” de novo."
    );
  }

  const outrasCasas = await contarOutrasCasas(supabase, userId, restauranteId);
  await registrarNoHistorico(supabase, {
    autor: sessao.userId,
    restauranteId,
    acao: "redefiniu_senha",
    detalhe: outrasCasas > 0 ? `login de ${outrasCasas + 1} casas` : null,
  });
  atualizarTelas();
  return {
    ok: true,
    data: {
      email,
      senha,
      mensagem: mensagemDoLogin({ endereco: await enderecoDoPainel(), email, senha }),
      outrasCasas,
    },
  };
}

export async function trocarEmailAction(
  restauranteId: string,
  userId: string,
  input: EmailInput
): Promise<Resultado<{ outrasCasas: number }>> {
  const sessao = await exigirAdmin();
  if (!idsValidos(restauranteId, userId)) return recusa("Login não encontrado.");
  const dados = emailSchema.safeParse(input);
  if (!dados.success) return recusa(primeiroErro(dados.error.issues));
  const { email } = dados.data;
  const supabase = await createClient();
  const problema = await conferirLogin(supabase, restauranteId, userId);
  if (problema) return recusa(problema);

  const servico = createServiceClient();
  // O Auth responde erro 500 sem código ao trocar para um e-mail que já existe
  // (medido no local): confere antes.
  const dono = await servico.rpc("id_do_login_por_email", { p_email: email });
  if (dono.error) return falha();
  if (dono.data === userId) return recusa("Este já é o e-mail deste login.");
  if (dono.data) return recusa("Este e-mail já é de outro login.");

  // Sem e-mail de confirmação: o admin é a fonte (desenho §1.1, cartão 3).
  const { data, error } = await servico.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });
  if (error || data.user?.email !== email) return falha();

  const outrasCasas = await contarOutrasCasas(supabase, userId, restauranteId);
  await registrarNoHistorico(supabase, {
    autor: sessao.userId,
    restauranteId,
    acao: "trocou_email",
    detalhe: `para ${mascararEmail(email)}`,
  });
  atualizarTelas();
  return { ok: true, data: { outrasCasas } };
}

export async function pedirReenvioAction(
  restauranteId: string,
  input: { desde: string }
): Promise<Resultado> {
  const sessao = await exigirAdmin();
  if (!idsValidos(restauranteId)) return recusa(NAO_ENCONTRADO);
  const desde = typeof input?.desde === "string" ? input.desde : "";
  const supabase = await createClient();
  const casa = await lerCasa(supabase, restauranteId);
  if (casa === "falhou") return falha();
  if (casa === "nao_encontrada") return recusa(NAO_ENCONTRADO);

  // "Hoje" é o dia da casa, não o do servidor.
  const problema = problemaNoReenvio(desde, hojeNaCasa(new Date(), casa.fuso));
  if (problema) return recusa(problema);

  const { count, error } = await supabase
    .from("restaurantes")
    .update({ pedido_reenvio_desde: desde }, { count: "exact" })
    .eq("id", restauranteId);
  if (error) return falha();
  if (count !== 1) return recusa(NAO_ENCONTRADO);

  await registrarNoHistorico(supabase, {
    autor: sessao.userId,
    restauranteId,
    acao: "pediu_reenvio",
    detalhe: `desde ${dataBr(desde)}`,
  });
  atualizarTelas();
  return { ok: true };
}

export async function mudarSituacaoAction(
  restauranteId: string,
  situacao: "ativo" | "suspenso"
): Promise<Resultado> {
  const sessao = await exigirAdmin();
  if (!idsValidos(restauranteId) || (situacao !== "ativo" && situacao !== "suspenso")) {
    return recusa("Pedido inválido.");
  }
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("restaurantes")
    .update({ situacao }, { count: "exact" })
    .eq("id", restauranteId);
  if (error) return falha();
  if (count !== 1) return recusa(NAO_ENCONTRADO);

  await registrarNoHistorico(supabase, {
    autor: sessao.userId,
    restauranteId,
    acao: situacao === "suspenso" ? "suspendeu" : "reativou",
  });
  atualizarTelas();
  return { ok: true };
}
```

- [ ] **Passo 6: Rodar os testes**

```bash
npx vitest run tests/admin/acoes-recusam.test.ts tests/admin/acoes-contra-o-banco.test.ts
```

Esperado: PASSA. Se aparecer `over_request_rate_limit`/`429` no login de teste (o Auth local aceita 30 entradas a cada 5 min), espere 5 minutos e rode de novo; não é defeito. Confira também que nenhum texto do Supabase vai cru para a tela: `grep -nE "error\??\.message" lib/admin/actions.ts lib/admin/dados.ts lib/admin/registro.ts` deve voltar vazio (o `issues[0]?.message` do zod é a frase do próprio produto).

- [ ] **Passo 7: Verificar e commitar**

```bash
npx biome check --write lib/admin components/admin tests/admin
npx tsc --noEmit
npx vitest run
git fetch && git status -sb && git status --short
git add lib/admin/tipos.ts lib/admin/dados.ts lib/admin/registro.ts lib/admin/actions.ts components/admin/cartao.tsx tests/admin/acoes-recusam.test.ts tests/admin/acoes-contra-o-banco.test.ts
git commit -m "Cria as funções do servidor do admin: cadastro, token, login do cliente, reenvio, situação e histórico" -m "Co-Authored-By: <trailer do seu modelo>"
```

---

## Tarefa 5: Casca do admin, lista e detalhe (cartões de leitura)  *(paralela às Tarefas 6 e 7)*

**Por quê:** a tela aprovada (`docs/telas/admin.html`): barra escura com a marca e "admin"; lista na ordem de atenção, com contadores, selo do vigia (D-53), último envio no fuso da casa e versão do SCC; no computador a lista fica à esquerda e o restaurante à direita; no celular, cada um na sua tela.

**Arquivos (lista fechada):**
- Criar: `app/admin/layout.tsx`, `app/admin/restaurantes/[id]/page.tsx`, `components/admin/topo-admin.tsx`, `components/admin/lista-restaurantes.tsx`, `components/admin/cartoes/cartao-dados.tsx`, `components/admin/cartoes/cartao-envios.tsx`, `components/admin/cartoes/cartao-historico.tsx`
- Substituir: `app/admin/page.tsx` (era o provisório da etapa 2)
- Testes (criar): `tests/admin/lista-restaurantes.test.tsx`, `tests/admin/topo-admin.test.tsx`, `tests/admin/cartoes-de-leitura.test.tsx`

**Interfaces consumidas:** Tarefa 2 (`ordenarParaAtencao`, `contadoresDaLista`, `LinhaDaLista`, `momentoNaCasa`, `formatarCnpj`, `rotuloDoFuso`, `formatarHora`, `resumoDoHorario`, `envioOk`, `detalheDoEnvio`, `camposNovosDoEnvio`, `linhaDoHistorico`), Tarefa 3 (`exigirAdmin`), Tarefa 4 (`listarRestaurantes`, `detalheDoRestaurante`, `DetalheDoRestaurante`, `Cartao`). Do código existente: `SeloDados`, `seloDoSinal`, `Logo`, `BotaoSair`, `buttonVariants`.
**Da Tarefa 6, em paralelo** (a página de detalhe importa; o `tsc` só fecha quando a 6 terminar): `CartaoToken`, `CartaoAcesso`, `CartaoReenvio`, `CartaoSituacao`, todos com a assinatura `({ detalhe }: { detalhe: DetalheDoRestaurante }) => JSX.Element`, em `@/components/admin/cartoes/cartao-token`, `…/cartao-acesso`, `…/cartao-reenvio`, `…/cartao-situacao`.

**Interfaces produzidas:**
- `@/components/admin/lista-restaurantes`: `ListaRestaurantes({ linhas: readonly LinhaDaLista[]; agoraIso: string; selecionado?: string | null; tituloPrincipal?: boolean })` e `EtiquetaSuspenso()`.
- `@/components/admin/topo-admin`: `TopoAdmin({ email: string })`.
- `@/components/admin/cartoes/cartao-dados`: `CartaoDados({ detalhe })`; o botão "Ver o painel do cliente" é um `<a href="/r/<slug>/hoje">` comum (sem pré-carregamento).
- `CartaoEnvios({ detalhe })`, `CartaoHistorico({ detalhe })`.

- [ ] **Passo 1: Testes da lista, do topo e dos cartões de leitura (falham)**

Crie `tests/admin/lista-restaurantes.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ListaRestaurantes } from "@/components/admin/lista-restaurantes";
import type { LinhaDaLista } from "@/lib/admin/lista";

afterEach(cleanup);

// Quarta 14/10/2026, 21:40 em Fortaleza.
const agoraIso = "2026-10-15T00:40:00Z";

const linha = (parcial: Partial<LinhaDaLista> & Pick<LinhaDaLista, "id" | "nome">): LinhaDaLista => ({
  slug: parcial.id,
  situacao: "ativo",
  fuso: "America/Fortaleza",
  estado: "em_dia",
  ultimoEnvioOkEm: "2026-10-15T00:38:00Z",
  versaoScc: "5.2.1",
  ...parcial,
});

const linhas = [
  linha({ id: "bar", nome: "Bar do Zé" }),
  linha({ id: "mar", nome: "Sabor do Mar", estado: "parado", ultimoEnvioOkEm: "2026-10-12T21:00:00Z", versaoScc: "5.1.8" }),
  linha({ id: "velho", nome: "Casa Velha", situacao: "suspenso", estado: "fechado" }),
  linha({ id: "forno", nome: "Forno a Lenha", estado: null, ultimoEnvioOkEm: null, versaoScc: null }),
];

describe("lista de restaurantes do admin", () => {
  it("sem restaurantes, diz isso e mostra o botão de cadastrar", () => {
    render(<ListaRestaurantes linhas={[]} agoraIso={agoraIso} />);
    expect(screen.getByText("Nenhum restaurante cadastrado ainda.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "+ Cadastrar restaurante" }).getAttribute("href")
    ).toBe("/admin/restaurantes/novo");
  });

  it("contadores com o total e os estados que existem", () => {
    render(<ListaRestaurantes linhas={linhas} agoraIso={agoraIso} />);
    const resumo = screen.getByRole("list", { name: "Resumo dos envios" });
    expect(within(resumo).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "4 cadastrados",
      "1 em dia",
      "1 parado",
      "1 aguardando",
      "1 suspenso",
    ]);
  });

  it("no celular, cartões na ordem de atenção com selo curto e último envio", () => {
    render(<ListaRestaurantes linhas={linhas} agoraIso={agoraIso} />);
    const cartoes = screen.getByRole("list", { name: "Restaurantes" });
    const links = within(cartoes).getAllByRole("link");
    expect(links.map((l) => l.querySelector("strong")?.textContent)).toEqual([
      "Sabor do Mar",
      "Forno a Lenha",
      "Bar do Zé",
      "Casa Velha",
    ]);
    expect(links[0]?.getAttribute("href")).toBe("/admin/restaurantes/mar");
    expect(within(links[2] as HTMLElement).getByText("hoje 21:38")).toBeTruthy();
    expect(within(links[3] as HTMLElement).getByText("suspenso")).toBeTruthy();
    expect(within(links[1] as HTMLElement).getByText("—")).toBeTruthy();
  });

  it("no computador, tabela com as quatro colunas e a casa escolhida marcada", () => {
    render(<ListaRestaurantes linhas={linhas} agoraIso={agoraIso} selecionado="bar" />);
    const tabela = screen.getByRole("table");
    expect(
      within(tabela).getAllByRole("columnheader").map((th) => th.textContent)
    ).toEqual(["Restaurante", "Envio de dados", "Último envio", "SCC"]);
    const linhasDaTabela = within(tabela).getAllByRole("row").slice(1);
    expect(linhasDaTabela.map((tr) => within(tr).getAllByRole("cell")[3]?.textContent)).toEqual([
      "5.1.8",
      "—",
      "5.2.1",
      "5.2.1",
    ]);
    expect(within(tabela).getByText("atualizado há 2 min")).toBeTruthy();
    expect(within(tabela).getByText("aguardando o 1º envio")).toBeTruthy();
    expect(
      within(tabela).getByRole("link", { name: "Bar do Zé" }).getAttribute("aria-current")
    ).toBe("page");
  });

  it("o título pode ser secundário (detalhe no computador)", () => {
    render(<ListaRestaurantes linhas={linhas} agoraIso={agoraIso} tituloPrincipal={false} />);
    expect(screen.getByRole("heading", { level: 2, name: "Restaurantes" })).toBeTruthy();
  });
});
```

Crie `tests/admin/topo-admin.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/actions", () => ({ sairAction: vi.fn() }));

import { TopoAdmin } from "@/components/admin/topo-admin";

afterEach(cleanup);

describe("topo do admin", () => {
  it("mostra o e-mail, a troca de senha que volta ao admin e o sair (computador e menu do celular)", () => {
    render(<TopoAdmin email="admin@repply.local" />);
    expect(screen.getAllByText("admin@repply.local")).toHaveLength(2);
    expect(
      screen
        .getAllByRole("link", { name: "Trocar minha senha" })
        .map((link) => link.getAttribute("href"))
    ).toEqual(["/trocar-senha?voltar=%2Fadmin", "/trocar-senha?voltar=%2Fadmin"]);
    expect(screen.getAllByRole("button", { name: "Sair" })).toHaveLength(2);
    expect(screen.getByLabelText("Menu da conta")).toBeTruthy();
    expect(screen.getByText("admin")).toBeTruthy();
  });
});
```

Crie `tests/admin/cartoes-de-leitura.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CartaoDados } from "@/components/admin/cartoes/cartao-dados";
import { CartaoEnvios } from "@/components/admin/cartoes/cartao-envios";
import { CartaoHistorico } from "@/components/admin/cartoes/cartao-historico";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";

afterEach(cleanup);

const ID = "11111111-1111-4111-8111-111111111111";

function detalhe(parcial: Partial<DetalheDoRestaurante> = {}): DetalheDoRestaurante {
  return {
    agoraIso: "2026-10-15T00:40:00Z",
    restaurante: {
      id: ID,
      slug: "bar-do-ze",
      nome: "Bar do Zé",
      cnpj: "12345678000195",
      fuso: "America/Fortaleza",
      horaVirada: "05:00",
      horario: [2, 3, 4, 5, 6, 0].flatMap((dia) => [
        { dia, abre: "11:00", fecha: "15:00" },
        { dia, abre: "18:00", fecha: "02:00" },
      ]),
      situacao: "ativo",
      pedidoReenvioDesde: null,
      intervaloEnvioSegundos: 300,
    },
    sinal: { estado: "em_dia", ultimoEnvioOkEm: "2026-10-15T00:38:00Z" },
    tokens: [],
    logins: [],
    envios: [],
    historico: [],
    ...parcial,
  };
}

describe("cartão Dados", () => {
  it("mostra os dados no formato da casa e as duas ações", () => {
    render(<CartaoDados detalhe={detalhe()} />);
    for (const texto of [
      "12.345.678/0001-95",
      "Fortaleza · CE, RN, PB, PI e MA (UTC−3)",
      "5h",
      "ter–dom · 11h–15h e 18h–2h",
      "ativo",
    ]) {
      expect(screen.getByText(texto)).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: "Editar dados" }).getAttribute("href")).toBe(
      `/admin/restaurantes/${ID}/editar`
    );
    expect(
      screen.getByRole("link", { name: "Ver o painel do cliente" }).getAttribute("href")
    ).toBe("/r/bar-do-ze/hoje");
  });

  it("sem CNPJ diz 'não informado'", () => {
    const base = detalhe();
    render(<CartaoDados detalhe={{ ...base, restaurante: { ...base.restaurante, cnpj: null } }} />);
    expect(screen.getByText("não informado")).toBeTruthy();
  });
});

describe("cartão Últimos envios", () => {
  it("sem envios, diz isso", () => {
    render(<CartaoEnvios detalhe={detalhe()} />);
    expect(screen.getByText("Nenhum envio ainda.")).toBeTruthy();
  });

  it("mostra hora no fuso da casa, resultado em texto, contagens, versão e campos novos", () => {
    render(
      <CartaoEnvios
        detalhe={detalhe({
          envios: [
            {
              id: 2,
              recebidoEm: "2026-10-15T00:38:00Z",
              httpStatus: 200,
              erro: null,
              recebidas: 212,
              gravadas: 8,
              inalteradas: 203,
              removidas: 1,
              versaoScc: "5.2.1",
              camposDesconhecidos: ["Pix"],
            },
            {
              id: 1,
              recebidoEm: "2026-10-15T00:28:00Z",
              httpStatus: 422,
              erro: "formato inválido",
              recebidas: null,
              gravadas: null,
              inalteradas: null,
              removidas: null,
              versaoScc: null,
              camposDesconhecidos: [],
            },
          ],
        })}
      />
    );
    expect(screen.getByText("hoje 21:38")).toBeTruthy();
    expect(screen.getByText("ok")).toBeTruthy();
    expect(screen.getByText("erro")).toBeTruthy();
    expect(
      screen.getByText("212 recebidas · 8 gravadas · 203 iguais · 1 removida · SCC 5.2.1")
    ).toBeTruthy();
    expect(screen.getByText("formato inválido (422)")).toBeTruthy();
    expect(screen.getByText("campos novos: Pix")).toBeTruthy();
  });
});

describe("cartão Histórico", () => {
  it("sem ações, diz isso", () => {
    render(<CartaoHistorico detalhe={detalhe()} />);
    expect(screen.getByText("Nenhuma ação registrada ainda.")).toBeTruthy();
  });

  it("cada ação numa linha, sem senha nem token", () => {
    render(
      <CartaoHistorico
        detalhe={detalhe({
          historico: [
            {
              id: 1,
              criadoEm: "2026-10-15T00:03:00Z",
              autor: "Lucas Ferreira",
              acao: "gerou_token",
              detalhe: "o antigo parou na hora",
            },
          ],
        })}
      />
    );
    expect(
      screen.getByText(
        "14/10 21:03 · Lucas Ferreira · gerou um token novo (o antigo parou na hora)"
      )
    ).toBeTruthy();
  });
});
```

Rode `npx vitest run tests/admin/lista-restaurantes.test.tsx tests/admin/topo-admin.test.tsx tests/admin/cartoes-de-leitura.test.tsx` → esperado: FALHA (componentes não existem).

- [ ] **Passo 2: Topo e lista**

Crie `components/admin/topo-admin.tsx`:

```tsx
import { BotaoSair } from "@/components/entrada/botao-sair";
import { Logo } from "@/components/marca/logo";
import { Menu } from "lucide-react";
import Link from "next/link";

const TROCAR_SENHA = `/trocar-senha?voltar=${encodeURIComponent("/admin")}`;

/**
 * Topo do admin (tela aprovada): barra escura com a marca e a etiqueta
 * "admin"; à direita, o e-mail de quem está dentro, "Trocar minha senha" e
 * "Sair". No celular os dois ficam num menu (☰) que abre sem JavaScript.
 * O tomate só aparece no símbolo (D-42): o `Logo` cuida disso.
 */
export function TopoAdmin({ email }: { email: string }) {
  return (
    <header className="scheme-ink sticky top-0 z-20">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 md:px-6">
        <Link href="/admin" className="flex min-h-11 items-center gap-2">
          <Logo variante="escuro" />
          <span className="number-mono rounded-full border px-2 py-0.5 text-xs text-quiet">
            admin
          </span>
        </Link>

        <nav aria-label="Conta" className="hidden items-center gap-4 md:flex">
          <span className="text-sm text-quiet">{email}</span>
          <Link href={TROCAR_SENHA} className="text-sm underline underline-offset-4">
            Trocar minha senha
          </Link>
          <div className="w-28">
            <BotaoSair variante="outline" />
          </div>
        </nav>

        <details className="relative md:hidden">
          <summary
            aria-label="Menu da conta"
            className="flex size-11 cursor-pointer list-none items-center justify-center rounded-lg [&::-webkit-details-marker]:hidden"
          >
            <Menu aria-hidden="true" className="size-6" />
          </summary>
          <div className="scheme-paper absolute top-12 right-0 flex w-64 flex-col gap-2 rounded-xl border p-3 shadow-lg">
            <span className="break-all text-sm text-quiet">{email}</span>
            <Link
              href={TROCAR_SENHA}
              className="flex min-h-11 items-center text-sm underline underline-offset-4"
            >
              Trocar minha senha
            </Link>
            <BotaoSair variante="outline" />
          </div>
        </details>
      </div>
    </header>
  );
}
```

Crie `components/admin/lista-restaurantes.tsx`:

```tsx
import { SeloDados } from "@/components/painel/selo-dados";
import { buttonVariants } from "@/components/ui/button";
import { momentoNaCasa } from "@/lib/admin/datas";
import {
  type LinhaDaLista,
  contadoresDaLista,
  ordenarParaAtencao,
} from "@/lib/admin/lista";
import { seloDoSinal } from "@/lib/painel/selo";
import { cn } from "@/lib/utils";
import Link from "next/link";

/** Etiqueta "suspenso", sempre com texto (a cor nunca é o único canal). */
export function EtiquetaSuspenso() {
  return (
    <span className="number-mono inline-flex w-fit items-center rounded-full border border-current px-2 py-0.5 text-xs">
      suspenso
    </span>
  );
}

type Props = {
  linhas: readonly LinhaDaLista[];
  /** Momento da leitura, para "há X min" e "hoje 21:38" (no fuso de cada casa). */
  agoraIso: string;
  selecionado?: string | null;
  /** `false` no detalhe do computador, onde o título da página é o restaurante. */
  tituloPrincipal?: boolean;
};

/**
 * Lista de restaurantes (desenho §1.1): ordem de atenção, contadores, selo do
 * vigia (D-53), último envio no fuso da casa e versão do SCC. Cartões no
 * celular; tabela no computador.
 */
export function ListaRestaurantes({
  linhas,
  agoraIso,
  selecionado = null,
  tituloPrincipal = true,
}: Props) {
  const agora = new Date(agoraIso);
  const ordenadas = ordenarParaAtencao(linhas);
  const Titulo = tituloPrincipal ? "h1" : "h2";
  const selo = (l: LinhaDaLista) =>
    seloDoSinal({ estado: l.estado, ultimoEnvioOkEm: l.ultimoEnvioOkEm, agora, fuso: l.fuso });
  const endereco = (l: LinhaDaLista) => `/admin/restaurantes/${l.id}`;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Titulo className="text-2xl font-semibold">Restaurantes</Titulo>
        <Link
          href="/admin/restaurantes/novo"
          className={cn(buttonVariants({ size: "toque" }), "md:h-9 md:text-sm")}
        >
          + Cadastrar restaurante
        </Link>
      </div>

      {linhas.length === 0 ? (
        <p className="brand-surface rounded-xl p-6 text-quiet">
          Nenhum restaurante cadastrado ainda.
        </p>
      ) : (
        <>
          <ul aria-label="Resumo dos envios" className="flex flex-wrap gap-2">
            {contadoresDaLista(linhas).map((texto) => (
              <li key={texto} className="number-mono rounded-full border px-3 py-1 text-xs">
                {texto}
              </li>
            ))}
          </ul>

          <ul aria-label="Restaurantes" className="flex flex-col gap-2 md:hidden">
            {ordenadas.map((l) => (
              <li key={l.id}>
                <Link
                  href={endereco(l)}
                  aria-current={l.id === selecionado ? "page" : undefined}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <strong className="truncate">{l.nome}</strong>
                    <span className="number-mono text-xs text-quiet">
                      {momentoNaCasa(l.ultimoEnvioOkEm, agora, l.fuso)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <SeloDados selo={selo(l)} compacto />
                    {l.situacao === "suspenso" ? <EtiquetaSuspenso /> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <table className="hidden w-full border-separate border-spacing-0 overflow-hidden rounded-xl border text-sm md:table">
            <thead>
              <tr className="text-left">
                {["Restaurante", "Envio de dados", "Último envio", "SCC"].map((coluna) => (
                  <th
                    key={coluna}
                    scope="col"
                    className="label-mono border-b px-3 py-2 font-normal text-quiet"
                  >
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((l) => {
                const atual = l.id === selecionado;
                return (
                  <tr key={l.id} className={cn(atual && "bg-muted")}>
                    <td className={cn("border-b px-3 py-2", atual && "border-l-4 border-l-primary")}>
                      <span className="flex flex-wrap items-center gap-2">
                        <Link
                          href={endereco(l)}
                          aria-current={atual ? "page" : undefined}
                          className={cn("underline-offset-4 hover:underline", atual && "font-bold")}
                        >
                          {l.nome}
                        </Link>
                        {l.situacao === "suspenso" ? <EtiquetaSuspenso /> : null}
                      </span>
                    </td>
                    <td className="border-b px-3 py-2">
                      <SeloDados selo={selo(l)} />
                    </td>
                    <td className="number-mono border-b px-3 py-2">
                      {momentoNaCasa(l.ultimoEnvioOkEm, agora, l.fuso)}
                    </td>
                    <td className="number-mono border-b px-3 py-2">{l.versaoScc ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
```

- [ ] **Passo 3: Cartões de leitura**

Crie `components/admin/cartoes/cartao-dados.tsx`:

```tsx
import { Cartao } from "@/components/admin/cartao";
import { buttonVariants } from "@/components/ui/button";
import { formatarCnpj } from "@/lib/admin/cnpj";
import { rotuloDoFuso } from "@/lib/admin/fusos";
import { formatarHora, resumoDoHorario } from "@/lib/admin/horario";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";
import { cn } from "@/lib/utils";
import Link from "next/link";

const BOTAO = cn(buttonVariants({ variant: "outline", size: "toque" }), "md:h-9 md:text-sm");

/** Cartão 1 do detalhe (desenho §1.1). */
export function CartaoDados({ detalhe }: { detalhe: DetalheDoRestaurante }) {
  const r = detalhe.restaurante;
  const linhas: [string, string][] = [
    ["Nome", r.nome],
    ["CNPJ", r.cnpj ? formatarCnpj(r.cnpj) : "não informado"],
    ["Fuso", rotuloDoFuso(r.fuso)],
    ["O dia vira às", formatarHora(r.horaVirada)],
    ["Funcionamento", resumoDoHorario(r.horario)],
    ["Situação", r.situacao === "suspenso" ? "suspenso" : "ativo"],
  ];
  return (
    <Cartao titulo="Dados">
      <dl className="flex flex-col divide-y text-sm">
        {linhas.map(([rotulo, valor]) => (
          <div
            key={rotulo}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
          >
            <dt className="text-quiet">{rotulo}</dt>
            <dd className="text-right">{valor}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Link href={`/admin/restaurantes/${r.id}/editar`} className={BOTAO}>
          Editar dados
        </Link>
        {/* <a> comum, sem pré-carregamento: abrir o painel registra "abriu o
            painel do cliente" no histórico (D-59), e isso só pode acontecer
            quando o admin abre de fato. */}
        <a href={`/r/${r.slug}/hoje`} className={BOTAO}>
          Ver o painel do cliente
        </a>
      </div>
    </Cartao>
  );
}
```

Crie `components/admin/cartoes/cartao-envios.tsx`:

```tsx
import { Cartao } from "@/components/admin/cartao";
import { momentoNaCasa } from "@/lib/admin/datas";
import { camposNovosDoEnvio, detalheDoEnvio, envioOk } from "@/lib/admin/envios";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";
import { cn } from "@/lib/utils";

/** Cartão 4: os 20 envios mais recentes, com os erros e os campos novos (D-51). */
export function CartaoEnvios({ detalhe }: { detalhe: DetalheDoRestaurante }) {
  const { envios, restaurante } = detalhe;
  const agora = new Date(detalhe.agoraIso);
  return (
    <Cartao titulo="Últimos envios">
      {envios.length === 0 ? (
        <p className="text-sm text-quiet">Nenhum envio ainda.</p>
      ) : (
        <ol className="flex flex-col divide-y">
          {envios.map((envio) => {
            const ok = envioOk(envio);
            const camposNovos = camposNovosDoEnvio(envio);
            return (
              <li key={envio.id} className="flex flex-col gap-1 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="number-mono">
                    {momentoNaCasa(envio.recebidoEm, agora, restaurante.fuso)}
                  </span>
                  <span
                    className={cn(
                      "number-mono rounded-full px-2 py-0.5 text-xs",
                      ok ? "status-success" : "status-danger"
                    )}
                  >
                    {ok ? "ok" : "erro"}
                  </span>
                </div>
                <p className="number-mono text-xs text-quiet">{detalheDoEnvio(envio)}</p>
                {camposNovos ? <p className="text-xs">{camposNovos}</p> : null}
              </li>
            );
          })}
        </ol>
      )}
    </Cartao>
  );
}
```

Crie `components/admin/cartoes/cartao-historico.tsx`:

```tsx
import { Cartao } from "@/components/admin/cartao";
import { linhaDoHistorico } from "@/lib/admin/historico";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";

/** Cartão 7: as últimas 30 ações do admin nesta casa (D-59). */
export function CartaoHistorico({ detalhe }: { detalhe: DetalheDoRestaurante }) {
  return (
    <Cartao titulo="Histórico">
      {detalhe.historico.length === 0 ? (
        <p className="text-sm text-quiet">Nenhuma ação registrada ainda.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {detalhe.historico.map((registro) => (
            <li key={registro.id} className="number-mono text-xs leading-relaxed">
              {linhaDoHistorico(registro, detalhe.restaurante.fuso)}
            </li>
          ))}
        </ol>
      )}
    </Cartao>
  );
}
```

Rode os testes do Passo 1 → esperado: PASSA.

- [ ] **Passo 4: As páginas do admin**

Crie `app/admin/layout.tsx`:

```tsx
import { TopoAdmin } from "@/components/admin/topo-admin";
import { exigirAdmin } from "@/lib/auth/sessao";
import type { ReactNode } from "react";

/**
 * Casca do admin (D-38, D-39): barra escura no topo e o conteúdo no tema
 * escolhido. Cada página chama `exigirAdmin()` de novo (o layout não roda em
 * toda navegação), e cada função do servidor também.
 */
export default async function LayoutAdmin({ children }: { children: ReactNode }) {
  const sessao = await exigirAdmin();
  return (
    <div className="min-h-dvh bg-background">
      <TopoAdmin email={sessao.email} />
      <main className="mx-auto w-full max-w-7xl px-4 pt-4 pb-10 md:px-6 md:pt-6">
        {children}
      </main>
    </div>
  );
}
```

Substitua `app/admin/page.tsx` por:

```tsx
import { ListaRestaurantes } from "@/components/admin/lista-restaurantes";
import { listarRestaurantes } from "@/lib/admin/dados";
import { exigirAdmin } from "@/lib/auth/sessao";

export const metadata = { title: "Admin · repply food." };

/** Lista de restaurantes. No computador, à direita, "Escolha um restaurante". */
export default async function PaginaAdmin() {
  await exigirAdmin();
  const linhas = await listarRestaurantes();
  return (
    <div className="lg:grid lg:grid-cols-[1.35fr_1fr] lg:items-start lg:gap-6">
      <ListaRestaurantes linhas={linhas} agoraIso={new Date().toISOString()} />
      <aside className="hidden lg:block">
        <p className="brand-surface rounded-xl p-6 text-quiet">
          Escolha um restaurante para ver os dados, o token de envio, o acesso
          do cliente e os últimos envios.
        </p>
      </aside>
    </div>
  );
}
```

Crie `app/admin/restaurantes/[id]/page.tsx`:

```tsx
import { CartaoAcesso } from "@/components/admin/cartoes/cartao-acesso";
import { CartaoDados } from "@/components/admin/cartoes/cartao-dados";
import { CartaoEnvios } from "@/components/admin/cartoes/cartao-envios";
import { CartaoHistorico } from "@/components/admin/cartoes/cartao-historico";
import { CartaoReenvio } from "@/components/admin/cartoes/cartao-reenvio";
import { CartaoSituacao } from "@/components/admin/cartoes/cartao-situacao";
import { CartaoToken } from "@/components/admin/cartoes/cartao-token";
import {
  EtiquetaSuspenso,
  ListaRestaurantes,
} from "@/components/admin/lista-restaurantes";
import { SeloDados } from "@/components/painel/selo-dados";
import { detalheDoRestaurante, listarRestaurantes } from "@/lib/admin/dados";
import { exigirAdmin } from "@/lib/auth/sessao";
import { seloDoSinal } from "@/lib/painel/selo";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = { title: "Restaurante · admin · repply food." };

/**
 * Detalhe do restaurante (desenho §1.1). No computador, a lista continua à
 * esquerda, com a casa marcada; no celular, tela própria com "‹ Restaurantes".
 */
export default async function PaginaRestaurante({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirAdmin();
  const [detalhe, linhas] = await Promise.all([
    detalheDoRestaurante(id),
    listarRestaurantes(),
  ]);
  if (!detalhe) notFound();
  const { restaurante, sinal } = detalhe;
  const selo = seloDoSinal({
    estado: sinal.estado,
    ultimoEnvioOkEm: sinal.ultimoEnvioOkEm,
    agora: new Date(detalhe.agoraIso),
    fuso: restaurante.fuso,
  });

  return (
    <div className="lg:grid lg:grid-cols-[1.35fr_1fr] lg:items-start lg:gap-6">
      <div className="hidden lg:block">
        <ListaRestaurantes
          linhas={linhas}
          agoraIso={detalhe.agoraIso}
          selecionado={restaurante.id}
          tituloPrincipal={false}
        />
      </div>
      <div className="flex flex-col gap-4">
        <Link
          href="/admin"
          className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4 lg:hidden"
        >
          ‹ Restaurantes
        </Link>
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{restaurante.nome}</h1>
            {restaurante.situacao === "suspenso" ? <EtiquetaSuspenso /> : null}
          </div>
          <SeloDados selo={selo} />
        </header>
        <CartaoDados detalhe={detalhe} />
        <CartaoToken detalhe={detalhe} />
        <CartaoAcesso detalhe={detalhe} />
        <CartaoEnvios detalhe={detalhe} />
        <CartaoReenvio detalhe={detalhe} />
        <CartaoSituacao detalhe={detalhe} />
        <CartaoHistorico detalhe={detalhe} />
      </div>
    </div>
  );
}
```

- [ ] **Passo 5: Verificar e commitar**

```bash
npx biome check --write app/admin/layout.tsx app/admin/page.tsx "app/admin/restaurantes/[id]/page.tsx" components/admin/topo-admin.tsx components/admin/lista-restaurantes.tsx components/admin/cartoes/cartao-dados.tsx components/admin/cartoes/cartao-envios.tsx components/admin/cartoes/cartao-historico.tsx tests/admin/lista-restaurantes.test.tsx tests/admin/topo-admin.test.tsx tests/admin/cartoes-de-leitura.test.tsx
npx vitest run tests/admin/lista-restaurantes.test.tsx tests/admin/topo-admin.test.tsx tests/admin/cartoes-de-leitura.test.tsx
npx tsc --noEmit
```

(Erros de `tsc` só por `components/admin/cartoes/cartao-{token,acesso,reenvio,situacao}` faltando, ou em `app/admin/restaurantes/novo` e `…/editar`, são da Tarefa 6; em `app/r/` ou `components/painel/` são da Tarefa 7: anote e siga. `git status` não pode mostrar `app/admin/restaurantes/novo/` nem `…/[id]/editar/` no seu `git add`.)

```bash
git fetch && git status -sb && git status --short
git add app/admin/layout.tsx app/admin/page.tsx "app/admin/restaurantes/[id]/page.tsx" components/admin/topo-admin.tsx components/admin/lista-restaurantes.tsx components/admin/cartoes/cartao-dados.tsx components/admin/cartoes/cartao-envios.tsx components/admin/cartoes/cartao-historico.tsx tests/admin/lista-restaurantes.test.tsx tests/admin/topo-admin.test.tsx tests/admin/cartoes-de-leitura.test.tsx
git commit -m "Cria a casca do admin, a lista de restaurantes e o detalhe com os cartões de leitura" -m "Co-Authored-By: <trailer do seu modelo>"
```

---

## Tarefa 6: Cadastro, edição e cartões com ação  *(paralela às Tarefas 5 e 7)*

**Por quê:** o formulário do restaurante com o editor de horário (D-56) e os quatro cartões que mudam alguma coisa: token (D-38), acesso do cliente (D-55), pedir reenvio e situação (D-57). Token e senha aparecem uma vez, num quadro "Copie agora" que só existe no estado da tela.

**Arquivos (lista fechada):**
- Criar: `components/admin/botao-copiar.tsx`, `components/admin/quadro-copie-agora.tsx`, `components/admin/confirmacao.tsx`, `components/admin/formulario-email.tsx`, `components/admin/editor-horario.tsx`, `components/admin/formulario-restaurante.tsx`, `components/admin/cartoes/cartao-token.tsx`, `components/admin/cartoes/cartao-acesso.tsx`, `components/admin/cartoes/cartao-reenvio.tsx`, `components/admin/cartoes/cartao-situacao.tsx`, `app/admin/restaurantes/novo/page.tsx`, `app/admin/restaurantes/[id]/editar/page.tsx`
- Testes (criar): `tests/admin/formularios-antes-de-carregar.test.tsx`, `tests/admin/formulario-restaurante.test.tsx`, `tests/admin/cartoes-com-acao.test.tsx`

**Interfaces consumidas:** Tarefa 2 (`restauranteSchema`, `RestauranteInput`, `VALORES_INICIAIS`, `emailSchema`, `EmailInput`, `problemaNoReenvio`, `primeiroDiaDoReenvio`, `DIAS_DA_SEMANA`, `ModoDoDia`, `FUSOS_DO_BRASIL`, `mensagemDaEdicao`, `avisoDeLoginLigado`, `avisoDeOutrasCasas`, `mascararToken`, `plural`, `momentoNaCasa`, `horaNaCasa`, `dataCurtaNaCasa`, `hojeNaCasa`, `diaCurto`), Tarefa 3 (`exigirAdmin`), Tarefa 4 (todas as ações de `@/lib/admin/actions`, `restauranteParaEditar`, `Cartao`, os tipos de `@/lib/admin/tipos`). Do código existente: `TextField`, `useHidratado`, `Button`, `buttonVariants`, `Input`, `Label`, `FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormMessage`, `tempoDesde`, `toast` (sonner).

**Interfaces produzidas (a Tarefa 5 importa os quatro cartões; assinatura fixa):**
- `@/components/admin/cartoes/cartao-token`: `CartaoToken({ detalhe }: { detalhe: DetalheDoRestaurante })`.
- `@/components/admin/cartoes/cartao-acesso`: `CartaoAcesso({ detalhe }: { detalhe: DetalheDoRestaurante })`.
- `@/components/admin/cartoes/cartao-reenvio`: `CartaoReenvio({ detalhe }: { detalhe: DetalheDoRestaurante })`.
- `@/components/admin/cartoes/cartao-situacao`: `CartaoSituacao({ detalhe }: { detalhe: DetalheDoRestaurante })`.
- `FormularioRestaurante(props: { modo: "cadastro"; valoresIniciais: RestauranteInput } | { modo: "edicao"; restauranteId: string; valoresIniciais: RestauranteInput })`, `EditorHorario()`, `FormularioEmail({ rotulo, botao, aviso?, aoEnviar, aoCancelar? })`, `Confirmacao({ texto, rotuloConfirmar, enviando, aoConfirmar, aoCancelar, children? })`, `QuadroCopieAgora({ titulo, rotulo, valor, copias })`, `BotaoCopiar({ rotulo, texto })`.

- [ ] **Passo 1: Testes dos formulários antes de carregar (falham)**

Crie `tests/admin/formularios-antes-de-carregar.test.tsx`:

```tsx
// @vitest-environment jsdom
//
// A mesma trava dos formulários de entrada (CLAUDE.md §10): se o admin apertar
// Enter antes de a página carregar o JavaScript, o navegador faz o envio
// nativo. Com `method="post"` nada vai para o endereço, e com o botão desligado
// o Enter nem envia.
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/admin/actions", () => ({
  cadastrarRestauranteAction: vi.fn(),
  editarRestauranteAction: vi.fn(),
  pedirReenvioAction: vi.fn(),
}));

import { CartaoReenvio } from "@/components/admin/cartoes/cartao-reenvio";
import { Confirmacao } from "@/components/admin/confirmacao";
import { FormularioEmail } from "@/components/admin/formulario-email";
import { FormularioRestaurante } from "@/components/admin/formulario-restaurante";
import { VALORES_INICIAIS } from "@/lib/admin/schemas";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";

const DETALHE: DetalheDoRestaurante = {
  agoraIso: "2026-10-15T00:40:00Z",
  restaurante: {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "bar-do-ze",
    nome: "Bar do Zé",
    cnpj: null,
    fuso: "America/Fortaleza",
    horaVirada: "05:00",
    horario: [],
    situacao: "ativo",
    pedidoReenvioDesde: null,
    intervaloEnvioSegundos: 300,
  },
  sinal: { estado: null, ultimoEnvioOkEm: null },
  tokens: [],
  logins: [],
  envios: [],
  historico: [],
};

const casos: { nome: string; tela: () => ReactElement; botao: string }[] = [
  {
    nome: "cadastro do restaurante",
    tela: () => <FormularioRestaurante modo="cadastro" valoresIniciais={VALORES_INICIAIS} />,
    botao: "Cadastrar restaurante",
  },
  {
    nome: "edição do restaurante",
    tela: () => (
      <FormularioRestaurante modo="edicao" restauranteId="r1" valoresIniciais={VALORES_INICIAIS} />
    ),
    botao: "Salvar",
  },
  {
    nome: "e-mail do cliente",
    tela: () => (
      <FormularioEmail rotulo="E-mail do cliente" botao="Criar login" aoEnviar={async () => null} />
    ),
    botao: "Criar login",
  },
  {
    nome: "confirmação",
    tela: () => (
      <Confirmacao
        texto="Tem certeza?"
        rotuloConfirmar="Suspender"
        enviando={false}
        aoConfirmar={() => undefined}
        aoCancelar={() => undefined}
      />
    ),
    botao: "Suspender",
  },
  {
    nome: "pedido de reenvio",
    tela: () => <CartaoReenvio detalhe={DETALHE} />,
    botao: "Pedir reenvio",
  },
];

function htmlDoServidor(tela: ReactElement): Document {
  return new DOMParser().parseFromString(renderToString(tela), "text/html");
}

describe.each(casos)("formulário de $nome, antes de a página carregar", ({ tela, botao }) => {
  it('sai do servidor com method="post"', () => {
    const form = htmlDoServidor(tela()).querySelector("form");
    expect(form?.getAttribute("method")?.toLowerCase()).toBe("post");
  });

  it("sai do servidor com o botão de enviar desligado", () => {
    const enviar = [...htmlDoServidor(tela()).querySelectorAll("button[type=submit]")].find(
      (b) => b.textContent?.trim() === botao
    );
    expect(enviar).toBeDefined();
    expect(enviar?.hasAttribute("disabled")).toBe(true);
  });
});
```

Crie `tests/admin/formulario-restaurante.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push, cadastrar, editar } = vi.hoisted(() => ({
  push: vi.fn(),
  cadastrar: vi.fn(),
  editar: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/admin/actions", () => ({
  cadastrarRestauranteAction: cadastrar,
  editarRestauranteAction: editar,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FormularioRestaurante } from "@/components/admin/formulario-restaurante";
import { type RestauranteInput, VALORES_INICIAIS } from "@/lib/admin/schemas";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const VALIDOS: RestauranteInput = {
  ...VALORES_INICIAIS,
  nome: "Bar do Zé",
  dias: VALORES_INICIAIS.dias.map((d, dia) => (dia === 2 ? { ...d, modo: "um" as const } : d)),
};

function preencherNome(nome: string) {
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: nome } });
}

async function enviar(botao = "Cadastrar restaurante") {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: botao }));
  });
}

describe("formulário do restaurante (cadastro e edição)", () => {
  it("sem nenhum dia aberto, pede um e não chama o servidor", async () => {
    render(<FormularioRestaurante modo="cadastro" valoresIniciais={VALORES_INICIAIS} />);
    preencherNome("Bar do Zé");
    await enviar();
    expect(await screen.findByText("Abra a casa em pelo menos um dia")).toBeTruthy();
    expect(cadastrar).not.toHaveBeenCalled();
  });

  it("abre a terça com um horário, copia para os outros dias e cadastra", async () => {
    cadastrar.mockResolvedValue({ ok: true, data: { id: "novo-id" } });
    render(<FormularioRestaurante modo="cadastro" valoresIniciais={VALORES_INICIAIS} />);
    preencherNome("Bar do Zé");
    const terca = screen.getByRole("group", { name: "Terça" });
    fireEvent.click(within(terca).getByLabelText("Um horário"));
    fireEvent.change(within(terca).getByLabelText("Terça: fecha"), {
      target: { value: "23:00" },
    });
    fireEvent.click(within(terca).getByRole("button", { name: "Copiar para os outros dias" }));
    await enviar();
    await waitFor(() => expect(cadastrar).toHaveBeenCalledOnce());
    const enviado = cadastrar.mock.calls[0]?.[0] as RestauranteInput;
    expect(
      enviado.dias.every((d) => d.modo === "um" && d.abre1 === "11:00" && d.fecha1 === "23:00")
    ).toBe(true);
    expect(push).toHaveBeenCalledWith("/admin/restaurantes/novo-id");
  });

  it("horários que se sobrepõem mostram o problema no próprio dia", async () => {
    render(<FormularioRestaurante modo="cadastro" valoresIniciais={VALORES_INICIAIS} />);
    preencherNome("Bar do Zé");
    const sexta = screen.getByRole("group", { name: "Sexta" });
    fireEvent.click(within(sexta).getByLabelText("Dois horários"));
    fireEvent.change(within(sexta).getByLabelText("Sexta: abre de novo"), {
      target: { value: "14:00" },
    });
    await enviar();
    expect(
      await within(sexta).findByText("Os dois horários do mesmo dia não podem se sobrepor.")
    ).toBeTruthy();
    expect(cadastrar).not.toHaveBeenCalled();
  });

  it("o erro do servidor aparece no formulário, sem sair da tela", async () => {
    cadastrar.mockResolvedValue({ ok: false, error: "Já existe um restaurante com este CNPJ." });
    render(<FormularioRestaurante modo="cadastro" valoresIniciais={VALIDOS} />);
    await enviar();
    expect(await screen.findByText("Já existe um restaurante com este CNPJ.")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("na edição, salva e volta para o detalhe", async () => {
    editar.mockResolvedValue({ ok: true, data: { recalculou: true, mudouFuso: false } });
    render(<FormularioRestaurante modo="edicao" restauranteId="r1" valoresIniciais={VALIDOS} />);
    expect(
      screen.getByText(/Mudar o fuso ou a hora da virada recalcula o dia de operação/)
    ).toBeTruthy();
    await enviar("Salvar");
    await waitFor(() =>
      expect(editar).toHaveBeenCalledWith("r1", expect.objectContaining({ nome: "Bar do Zé" }))
    );
    expect(push).toHaveBeenCalledWith("/admin/restaurantes/r1");
  });
});
```

Rode `npx vitest run tests/admin/formularios-antes-de-carregar.test.tsx tests/admin/formulario-restaurante.test.tsx` → esperado: FALHA (componentes não existem).

- [ ] **Passo 2: Peças pequenas: copiar, quadro, confirmação e e-mail**

Crie `components/admin/botao-copiar.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Copia o texto para a área de transferência. Se o navegador recusar (página
 * sem HTTPS, permissão negada), mostra o texto num campo para copiar à mão.
 */
export function BotaoCopiar({ rotulo, texto }: { rotulo: string; texto: string }) {
  const [estado, setEstado] = useState<"pronto" | "copiado" | "falhou">("pronto");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("copiado");
      toast.success("Copiado.");
    } catch {
      setEstado("falhou");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="toque"
        className="md:h-9 md:text-sm"
        onClick={copiar}
      >
        {estado === "copiado" ? `${rotulo} ✓` : rotulo}
      </Button>
      {estado === "falhou" ? (
        <label className="flex flex-col gap-1 text-xs">
          Não deu para copiar sozinho. Selecione o texto e copie:
          <textarea
            readOnly
            value={texto}
            rows={Math.min(10, texto.split("\n").length + 1)}
            onFocus={(evento) => evento.currentTarget.select()}
            className="number-mono rounded-lg border border-input bg-background p-2 text-xs"
          />
        </label>
      ) : null}
    </div>
  );
}
```

Crie `components/admin/quadro-copie-agora.tsx`:

```tsx
"use client";

import { BotaoCopiar } from "./botao-copiar";

/**
 * Mostra uma única vez o que não aparece de novo (token, senha provisória).
 * Vive só no estado da tela: sair da página apaga o quadro (desenho §1.1).
 * A borda laranja é elemento gráfico (3:1); o texto fica no tom normal.
 */
export function QuadroCopieAgora({
  titulo,
  rotulo,
  valor,
  copias,
}: {
  titulo: string;
  rotulo: string;
  valor: string;
  copias: readonly { rotulo: string; texto: string }[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-primary p-4">
      {/* <output> tem role="status": o leitor de tela anuncia o quadro. */}
      <output className="block font-bold">{titulo}</output>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-quiet">{rotulo}</span>
        <code className="number-mono select-all break-all rounded-lg bg-muted px-3 py-2 text-base">
          {valor}
        </code>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {copias.map((copia) => (
          <BotaoCopiar key={copia.rotulo} rotulo={copia.rotulo} texto={copia.texto} />
        ))}
      </div>
    </div>
  );
}
```

Crie `components/admin/confirmacao.tsx`:

```tsx
"use client";

import { useHidratado } from "@/components/forms/use-hidratado";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

/**
 * Pergunta antes de uma ação séria (trocar ou revogar o token, redefinir a
 * senha, suspender). É um formulário de verdade: `method="post"` e botão
 * desligado até a página carregar (CLAUDE.md §10).
 */
export function Confirmacao({
  texto,
  rotuloConfirmar,
  enviando,
  aoConfirmar,
  aoCancelar,
  children,
}: {
  texto: string;
  rotuloConfirmar: string;
  enviando: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
  children?: ReactNode;
}) {
  const hidratado = useHidratado();
  return (
    <form
      method="post"
      onSubmit={(evento) => {
        evento.preventDefault();
        aoConfirmar();
      }}
      className="flex flex-col gap-3 rounded-xl border p-3"
    >
      <p className="text-sm">{texto}</p>
      {children}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="submit"
          size="toque"
          className="md:h-9 md:text-sm"
          disabled={!hidratado || enviando}
        >
          {enviando ? "Enviando…" : rotuloConfirmar}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="toque"
          className="md:h-9 md:text-sm"
          onClick={aoCancelar}
          disabled={enviando}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
```

Crie `components/admin/formulario-email.tsx`:

```tsx
"use client";

import { TextField } from "@/components/forms/form-field";
import { useHidratado } from "@/components/forms/use-hidratado";
import { Button } from "@/components/ui/button";
import { type EmailInput, emailSchema } from "@/lib/admin/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";

/**
 * Um e-mail e um botão: "Criar login" e "Trocar e-mail". `aoEnviar` devolve a
 * frase do erro, ou `null` se deu certo. `method="post"` e botão desligado até
 * a página carregar (CLAUDE.md §10).
 */
export function FormularioEmail({
  rotulo,
  botao,
  aviso,
  aoEnviar,
  aoCancelar,
}: {
  rotulo: string;
  botao: string;
  aviso?: string;
  aoEnviar: (valores: EmailInput) => Promise<string | null>;
  aoCancelar?: () => void;
}) {
  const hidratado = useHidratado();
  const [enviando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<EmailInput>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  function enviar(valores: EmailInput) {
    setErro(null);
    iniciar(async () => {
      const problema = await aoEnviar(valores);
      if (problema) setErro(problema);
      else form.reset({ email: "" });
    });
  }

  return (
    <FormProvider {...form}>
      <form
        method="post"
        onSubmit={form.handleSubmit(enviar)}
        className="flex flex-col gap-3"
        noValidate
      >
        <TextField
          name="email"
          control={form.control}
          label={rotulo}
          inputProps={{ type: "email", autoComplete: "off", inputMode: "email" }}
        />
        {aviso ? <p className="text-sm text-quiet">{aviso}</p> : null}
        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            size="toque"
            className="md:h-9 md:text-sm"
            disabled={!hidratado || enviando}
          >
            {enviando ? "Enviando…" : botao}
          </Button>
          {aoCancelar ? (
            <Button
              type="button"
              variant="ghost"
              size="toque"
              className="md:h-9 md:text-sm"
              onClick={aoCancelar}
              disabled={enviando}
            >
              Cancelar
            </Button>
          ) : null}
        </div>
      </form>
    </FormProvider>
  );
}
```

- [ ] **Passo 3: Editor de horário e formulário do restaurante**

Crie `components/admin/editor-horario.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DIAS_DA_SEMANA, type ModoDoDia } from "@/lib/admin/horario";
import type { RestauranteInput } from "@/lib/admin/schemas";
import { useId } from "react";
import { useFormContext, useWatch } from "react-hook-form";

const MODOS: { valor: ModoDoDia; rotulo: string }[] = [
  { valor: "fechado", rotulo: "Fechado" },
  { valor: "um", rotulo: "Um horário" },
  { valor: "dois", rotulo: "Dois horários" },
];

type CampoDeHora = "abre1" | "fecha1" | "abre2" | "fecha2";

function CampoHora({
  dia,
  nomeDoDia,
  campo,
  rotulo,
}: {
  dia: number;
  nomeDoDia: string;
  campo: CampoDeHora;
  rotulo: string;
}) {
  const { register } = useFormContext<RestauranteInput>();
  const id = useId();
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id}>{rotulo}</label>
      {/* O nome acessível leva o dia ("Terça: fecha"): são 7 blocos iguais. */}
      <Input
        id={id}
        type="time"
        step={60}
        aria-label={`${nomeDoDia}: ${rotulo.toLowerCase()}`}
        {...register(`dias.${dia}.${campo}`)}
      />
    </div>
  );
}

/**
 * Horário de funcionamento (D-56): um bloco por dia, de domingo a sábado,
 * "Fechado", "Um horário" ou "Dois horários" (almoço e jantar). Fecha antes de
 * abrir quer dizer que passa da meia-noite. A mesma regra do banco
 * (`problemaNoDia`, via `restauranteSchema`).
 */
export function EditorHorario() {
  const {
    register,
    getValues,
    setValue,
    formState: { errors, isSubmitted },
  } = useFormContext<RestauranteInput>();
  const dias = useWatch<RestauranteInput, "dias">({ name: "dias" });
  const erroGeral = errors.dias?.root?.message ?? errors.dias?.message;

  function copiarParaOsOutros(origem: number) {
    const modelo = getValues(`dias.${origem}`);
    setValue(
      "dias",
      Array.from({ length: 7 }, () => ({ ...modelo })),
      { shouldDirty: true, shouldValidate: isSubmitted }
    );
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">Horário de funcionamento</legend>
      <p className="text-sm text-quiet">
        Se fecha antes de abrir (por exemplo, das 18:00 às 02:00), o horário
        passa da meia-noite.
      </p>
      {erroGeral ? (
        <p role="alert" className="text-sm text-destructive">
          {erroGeral}
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {DIAS_DA_SEMANA.map(({ dia, longo }) => {
          const modo = dias?.[dia]?.modo ?? "fechado";
          const erroDoDia = errors.dias?.[dia]?.message;
          return (
            <fieldset key={dia} className="flex flex-col gap-3 rounded-xl border p-3">
              <legend className="px-1 text-sm font-bold">{longo}</legend>
              <div className="flex flex-wrap gap-x-4">
                {MODOS.map(({ valor, rotulo }) => (
                  <label key={valor} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      value={valor}
                      className="size-4 accent-primary"
                      {...register(`dias.${dia}.modo`)}
                    />
                    {rotulo}
                  </label>
                ))}
              </div>
              {modo !== "fechado" ? (
                <div className="grid grid-cols-2 gap-2">
                  <CampoHora dia={dia} nomeDoDia={longo} campo="abre1" rotulo="Abre" />
                  <CampoHora dia={dia} nomeDoDia={longo} campo="fecha1" rotulo="Fecha" />
                  {modo === "dois" ? (
                    <>
                      <CampoHora dia={dia} nomeDoDia={longo} campo="abre2" rotulo="Abre de novo" />
                      <CampoHora dia={dia} nomeDoDia={longo} campo="fecha2" rotulo="Fecha de novo" />
                    </>
                  ) : null}
                </div>
              ) : null}
              {erroDoDia ? (
                <p role="alert" className="text-sm text-destructive">
                  {erroDoDia}
                </p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="toque"
                className="w-fit md:h-9 md:text-sm"
                onClick={() => copiarParaOsOutros(dia)}
              >
                Copiar para os outros dias
              </Button>
            </fieldset>
          );
        })}
      </div>
    </fieldset>
  );
}
```

Crie `components/admin/formulario-restaurante.tsx`:

```tsx
"use client";

import { EditorHorario } from "@/components/admin/editor-horario";
import { TextField } from "@/components/forms/form-field";
import { useHidratado } from "@/components/forms/use-hidratado";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  cadastrarRestauranteAction,
  editarRestauranteAction,
} from "@/lib/admin/actions";
import { FUSOS_DO_BRASIL } from "@/lib/admin/fusos";
import { mensagemDaEdicao } from "@/lib/admin/mensagens";
import { type RestauranteInput, restauranteSchema } from "@/lib/admin/schemas";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

const CLASSE_DO_SELETOR =
  "h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm";
const HORAS = Array.from({ length: 24 }, (_, hora) => String(hora));

type Props =
  | { modo: "cadastro"; valoresIniciais: RestauranteInput }
  | { modo: "edicao"; restauranteId: string; valoresIniciais: RestauranteInput };

/**
 * Cadastro e edição do restaurante (mesmo formulário, desenho §1.1). O `slug`
 * sai do nome só no cadastro. O servidor confere tudo de novo com o mesmo
 * esquema. `method="post"` e botão desligado até a página carregar.
 */
export function FormularioRestaurante(props: Props) {
  const router = useRouter();
  const hidratado = useHidratado();
  const [enviando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<RestauranteInput>({
    resolver: zodResolver(restauranteSchema),
    defaultValues: props.valoresIniciais,
  });
  const voltarPara =
    props.modo === "edicao" ? `/admin/restaurantes/${props.restauranteId}` : "/admin";

  function enviar(valores: RestauranteInput) {
    setErro(null);
    iniciar(async () => {
      if (props.modo === "cadastro") {
        const resultado = await cadastrarRestauranteAction(valores);
        if (!resultado.ok) {
          setErro(resultado.error);
          return;
        }
        toast.success("Restaurante cadastrado. Agora gere o token de envio.");
        router.push(resultado.data ? `/admin/restaurantes/${resultado.data.id}` : "/admin");
        return;
      }
      const resultado = await editarRestauranteAction(props.restauranteId, valores);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      toast.success(mensagemDaEdicao(resultado.data));
      router.push(voltarPara);
    });
  }

  return (
    <FormProvider {...form}>
      <form
        method="post"
        onSubmit={form.handleSubmit(enviar)}
        className="flex flex-col gap-6"
        noValidate
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            name="nome"
            control={form.control}
            label="Nome"
            inputProps={{ autoComplete: "off" }}
          />
          <TextField
            name="cnpj"
            control={form.control}
            label="CNPJ (opcional)"
            description="Com ou sem pontuação."
            inputProps={{ autoComplete: "off" }}
          />
          <FormField
            control={form.control}
            name="fuso"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fuso</FormLabel>
                <FormControl>
                  <select {...field} className={CLASSE_DO_SELETOR}>
                    {FUSOS_DO_BRASIL.map((fuso) => (
                      <option key={fuso.valor} value={fuso.valor}>
                        {fuso.rotulo}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="horaVirada"
            render={({ field }) => (
              <FormItem>
                <FormLabel>O dia vira às</FormLabel>
                <FormControl>
                  <select {...field} className={CLASSE_DO_SELETOR}>
                    {HORAS.map((hora) => (
                      <option key={hora} value={hora}>
                        {`${hora}h`}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <EditorHorario />

        {props.modo === "edicao" ? (
          <p className="text-sm text-quiet">
            Mudar o fuso ou a hora da virada recalcula o dia de operação das
            contas desta casa.
          </p>
        ) : null}
        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            size="toque"
            className="md:h-9 md:text-sm"
            disabled={!hidratado || enviando}
          >
            {enviando ? "Salvando…" : props.modo === "cadastro" ? "Cadastrar restaurante" : "Salvar"}
          </Button>
          <Link
            href={voltarPara}
            className={cn(buttonVariants({ variant: "ghost", size: "toque" }), "md:h-9 md:text-sm")}
          >
            Cancelar
          </Link>
        </div>
      </form>
    </FormProvider>
  );
}
```

Rode `npx vitest run tests/admin/formulario-restaurante.test.tsx` → esperado: PASSA. (O de "antes de carregar" só passa no Passo 5, porque usa o `CartaoReenvio`.)

- [ ] **Passo 4: Testes dos cartões com ação (falham)**

Crie `tests/admin/cartoes-com-acao.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const acoes = vi.hoisted(() => ({
  gerar: vi.fn(),
  revogar: vi.fn(),
  criar: vi.fn(),
  redefinir: vi.fn(),
  trocar: vi.fn(),
  situacao: vi.fn(),
  reenvio: vi.fn(),
}));

vi.mock("@/lib/admin/actions", () => ({
  gerarTokenAction: acoes.gerar,
  revogarTokensAction: acoes.revogar,
  criarLoginAction: acoes.criar,
  redefinirSenhaAction: acoes.redefinir,
  trocarEmailAction: acoes.trocar,
  mudarSituacaoAction: acoes.situacao,
  pedirReenvioAction: acoes.reenvio,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CartaoAcesso } from "@/components/admin/cartoes/cartao-acesso";
import { CartaoReenvio } from "@/components/admin/cartoes/cartao-reenvio";
import { CartaoSituacao } from "@/components/admin/cartoes/cartao-situacao";
import { CartaoToken } from "@/components/admin/cartoes/cartao-token";
import type { DetalheDoRestaurante, LoginDoDetalhe, TokenDoDetalhe } from "@/lib/admin/tipos";

const ID = "11111111-1111-4111-8111-111111111111";
const escrever = vi.fn();

function detalhe(parcial: Partial<DetalheDoRestaurante> = {}): DetalheDoRestaurante {
  return {
    agoraIso: "2026-10-15T00:40:00Z", // quarta 14/10, 21:40 em Fortaleza
    restaurante: {
      id: ID,
      slug: "bar-do-ze",
      nome: "Bar do Zé",
      cnpj: null,
      fuso: "America/Fortaleza",
      horaVirada: "05:00",
      horario: [],
      situacao: "ativo",
      pedidoReenvioDesde: null,
      intervaloEnvioSegundos: 300,
    },
    sinal: { estado: null, ultimoEnvioOkEm: null },
    tokens: [],
    logins: [],
    envios: [],
    historico: [],
    ...parcial,
  };
}

const TOKEN: TokenDoDetalhe = {
  id: "t1",
  prefixo: "rf_8f3k",
  criadoEm: "2026-10-02T15:00:00Z",
  criadoPor: "Lucas",
  ultimoUsoEm: null,
  expiraEm: null,
};

const LOGIN: LoginDoDetalhe = {
  userId: "u1",
  email: "dono@exemplo.com",
  ultimoAcessoEm: "2026-10-14T01:10:00Z", // terça 13/10, 22:10 em Fortaleza
  precisaTrocarSenha: true,
  outrasCasas: 1,
};

async function clicar(nome: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nome }));
  });
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  escrever.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: escrever },
    configurable: true,
  });
});

describe("cartão Token de envio (D-38)", () => {
  it("sem token: gera, mostra uma vez e copia o token e as instruções", async () => {
    acoes.gerar.mockResolvedValue({ ok: true, data: { token: "rf_TOKEN", instrucoes: "INSTRUÇÕES" } });
    render(<CartaoToken detalhe={detalhe()} />);
    expect(screen.getByText("Esta casa ainda não tem token de envio.")).toBeTruthy();
    await clicar("Gerar token");
    expect(acoes.gerar).toHaveBeenCalledWith(ID, "agora");
    expect(await screen.findByText("Copie agora: este token não aparece de novo")).toBeTruthy();
    expect(screen.getByText("rf_TOKEN")).toBeTruthy();
    await clicar("Copiar instruções para a SCC");
    expect(escrever).toHaveBeenCalledWith("INSTRUÇÕES");
    await clicar("Copiar token");
    expect(escrever).toHaveBeenCalledWith("rf_TOKEN");
  });

  it("com token: só o começo, quem criou e o uso; o novo pergunta e começa em 'agora'", async () => {
    acoes.gerar.mockResolvedValue({ ok: true, data: { token: "rf_NOVO", instrucoes: "x" } });
    render(<CartaoToken detalhe={detalhe({ tokens: [TOKEN] })} />);
    expect(screen.getByText("rf_8f3k••••")).toBeTruthy();
    expect(screen.getByText("criado 02/10 por Lucas")).toBeTruthy();
    expect(screen.getByText("ainda não usado")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gerar novo token" }));
    expect((screen.getByLabelText("Agora (padrão)") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText(/Em 24 horas/));
    await clicar("Gerar novo token");
    expect(acoes.gerar).toHaveBeenCalledWith(ID, "24h");
  });

  it("durante a troca de 24 h, mostra quando o antigo para", () => {
    render(
      <CartaoToken
        detalhe={detalhe({
          tokens: [
            { ...TOKEN, id: "t2", prefixo: "rf_new1", ultimoUsoEm: "2026-10-15T00:38:00Z" },
            { ...TOKEN, prefixo: "rf_ab12", expiraEm: "2026-10-16T00:03:00Z" },
          ],
        })}
      />
    );
    expect(screen.getByText("usado há 2 min")).toBeTruthy();
    expect(screen.getByText("O token anterior (rf_ab12••••) para às 21:03 (15/10).")).toBeTruthy();
  });

  it("revogar pergunta antes e avisa que o SCC para", async () => {
    acoes.revogar.mockResolvedValue({ ok: true });
    render(<CartaoToken detalhe={detalhe({ tokens: [TOKEN] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Revogar token" }));
    expect(screen.getByText("O SCC para de enviar até receber um token novo.")).toBeTruthy();
    await clicar("Revogar token");
    expect(acoes.revogar).toHaveBeenCalledWith(ID);
  });

  it("erro do servidor aparece no cartão", async () => {
    acoes.gerar.mockResolvedValue({ ok: false, error: "Só a equipe Repply pode gerar token." });
    render(<CartaoToken detalhe={detalhe()} />);
    await clicar("Gerar token");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Só a equipe Repply pode gerar token."
    );
  });
});

describe("cartão Acesso do cliente (D-55)", () => {
  it("sem login: cria e mostra a senha uma vez, com a mensagem do WhatsApp", async () => {
    acoes.criar.mockResolvedValue({
      ok: true,
      data: { tipo: "novo", email: "dono@exemplo.com", senha: "Ab3dEf7hJk9m", mensagem: "MENSAGEM" },
    });
    render(<CartaoAcesso detalhe={detalhe()} />);
    fireEvent.change(screen.getByLabelText("E-mail do cliente"), {
      target: { value: "dono@exemplo.com" },
    });
    await clicar("Criar login");
    await waitFor(() => expect(acoes.criar).toHaveBeenCalledWith(ID, { email: "dono@exemplo.com" }));
    expect(await screen.findByText("Copie agora: esta senha não aparece de novo")).toBeTruthy();
    expect(screen.getByText("Ab3dEf7hJk9m")).toBeTruthy();
    await clicar("Copiar mensagem para o WhatsApp");
    expect(escrever).toHaveBeenCalledWith("MENSAGEM");
  });

  it("e-mail que já tinha conta: avisa que agora vê as duas casas (D-10)", async () => {
    acoes.criar.mockResolvedValue({
      ok: true,
      data: { tipo: "ligado", email: "dono@exemplo.com", outrasCasas: 1 },
    });
    render(<CartaoAcesso detalhe={detalhe()} />);
    fireEvent.change(screen.getByLabelText("E-mail do cliente"), {
      target: { value: "dono@exemplo.com" },
    });
    await clicar("Criar login");
    expect(
      await screen.findByText("Este e-mail já tinha acesso; agora vê as duas casas.")
    ).toBeTruthy();
  });

  it("com login: e-mail, último acesso e troca pendente; redefinir avisa das outras casas", async () => {
    acoes.redefinir.mockResolvedValue({
      ok: true,
      data: { email: "dono@exemplo.com", senha: "Zx2cVb3nMq4w", mensagem: "MSG", outrasCasas: 1 },
    });
    render(<CartaoAcesso detalhe={detalhe({ logins: [LOGIN] })} />);
    expect(screen.getByText("dono@exemplo.com")).toBeTruthy();
    expect(screen.getByText("último acesso: ontem 22:10")).toBeTruthy();
    expect(screen.getByText("precisa trocar a senha")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));
    expect(
      screen.getByText(/Este login também abre outra casa: a senha nova vale para as duas\./)
    ).toBeTruthy();
    await clicar("Redefinir senha");
    expect(acoes.redefinir).toHaveBeenCalledWith(ID, "u1");
    expect(await screen.findByText("Zx2cVb3nMq4w")).toBeTruthy();
  });

  it("trocar e-mail avisa que vale para as outras casas e manda o e-mail novo", async () => {
    acoes.trocar.mockResolvedValue({ ok: true, data: { outrasCasas: 1 } });
    render(<CartaoAcesso detalhe={detalhe({ logins: [LOGIN] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Trocar e-mail" }));
    expect(screen.getByText(/o e-mail novo vale para as duas/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("E-mail novo"), {
      target: { value: "novo@exemplo.com" },
    });
    await clicar("Trocar e-mail");
    await waitFor(() =>
      expect(acoes.trocar).toHaveBeenCalledWith(ID, "u1", { email: "novo@exemplo.com" })
    );
  });
});

describe("cartão Pedir reenvio", () => {
  it("mostra o pedido pendente e recusa data no futuro sem chamar o servidor", async () => {
    const base = detalhe();
    render(
      <CartaoReenvio
        detalhe={{ ...base, restaurante: { ...base.restaurante, pedidoReenvioDesde: "2026-10-01" } }}
      />
    );
    expect(screen.getByText("Pedido de reenvio desde 01/10, aguardando o SCC.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-20" } });
    await clicar("Pedir reenvio");
    expect(screen.getByText("A data não pode ser no futuro.")).toBeTruthy();
    expect(acoes.reenvio).not.toHaveBeenCalled();
  });

  it("data válida vai para o servidor", async () => {
    acoes.reenvio.mockResolvedValue({ ok: true });
    render(<CartaoReenvio detalhe={detalhe()} />);
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-01" } });
    await clicar("Pedir reenvio");
    expect(acoes.reenvio).toHaveBeenCalledWith(ID, { desde: "2026-10-01" });
  });
});

describe("cartão Situação (D-57)", () => {
  it("suspender pergunta com o que acontece", async () => {
    acoes.situacao.mockResolvedValue({ ok: true });
    render(<CartaoSituacao detalhe={detalhe()} />);
    fireEvent.click(screen.getByRole("button", { name: "Suspender" }));
    expect(
      screen.getByText(/os dados continuam guardados e o SCC continua enviando/)
    ).toBeTruthy();
    await clicar("Suspender");
    expect(acoes.situacao).toHaveBeenCalledWith(ID, "suspenso");
  });

  it("casa suspensa oferece reativar", async () => {
    acoes.situacao.mockResolvedValue({ ok: true });
    const base = detalhe();
    render(
      <CartaoSituacao
        detalhe={{ ...base, restaurante: { ...base.restaurante, situacao: "suspenso" } }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Reativar" }));
    await clicar("Reativar");
    expect(acoes.situacao).toHaveBeenCalledWith(ID, "ativo");
  });
});
```

Rode `npx vitest run tests/admin/cartoes-com-acao.test.tsx` → esperado: FALHA (cartões não existem).

- [ ] **Passo 5: Os quatro cartões com ação**

Crie `components/admin/cartoes/cartao-token.tsx`:

```tsx
"use client";

import { Cartao } from "@/components/admin/cartao";
import { Confirmacao } from "@/components/admin/confirmacao";
import { QuadroCopieAgora } from "@/components/admin/quadro-copie-agora";
import { useHidratado } from "@/components/forms/use-hidratado";
import { Button } from "@/components/ui/button";
import { gerarTokenAction, revogarTokensAction } from "@/lib/admin/actions";
import { dataCurtaNaCasa, horaNaCasa } from "@/lib/admin/datas";
import { mascararToken } from "@/lib/admin/texto";
import type { DetalheDoRestaurante, TokenGerado } from "@/lib/admin/tipos";
import { tempoDesde } from "@/lib/painel/selo";
import { useState, useTransition } from "react";
import { toast } from "sonner";

const BOTAO = "md:h-9 md:text-sm";

/**
 * Cartão 2 (desenho §1.1, D-38). O token completo aparece uma única vez,
 * logo depois de gerado; o quadro vive no estado da tela e some ao sair da
 * página. "Usado há…" é o último uso do token mais novo.
 */
export function CartaoToken({ detalhe }: { detalhe: DetalheDoRestaurante }) {
  const { restaurante, tokens } = detalhe;
  const [atual, ...anteriores] = tokens;
  const hidratado = useHidratado();
  const [etapa, setEtapa] = useState<"nada" | "trocar" | "revogar">("nada");
  const [antigo, setAntigo] = useState<"agora" | "24h">("agora");
  const [gerado, setGerado] = useState<TokenGerado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function gerar(quando: "agora" | "24h") {
    setErro(null);
    iniciar(async () => {
      const resultado = await gerarTokenAction(restaurante.id, quando);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      if (resultado.data) setGerado(resultado.data);
      setEtapa("nada");
    });
  }

  function revogar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await revogarTokensAction(restaurante.id);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      setGerado(null);
      setEtapa("nada");
      toast.success("Token revogado. O SCC para de enviar até receber um token novo.");
    });
  }

  return (
    <Cartao titulo="Token de envio">
      {gerado ? (
        <QuadroCopieAgora
          titulo="Copie agora: este token não aparece de novo"
          rotulo="Token"
          valor={gerado.token}
          copias={[
            { rotulo: "Copiar token", texto: gerado.token },
            { rotulo: "Copiar instruções para a SCC", texto: gerado.instrucoes },
          ]}
        />
      ) : null}

      {atual ? (
        <div className="flex flex-col gap-1 text-sm">
          <span className="number-mono font-bold">{mascararToken(atual.prefixo)}</span>
          <span className="text-quiet">
            {`criado ${dataCurtaNaCasa(atual.criadoEm, restaurante.fuso)} por ${atual.criadoPor}`}
          </span>
          <span className="text-quiet">
            {atual.ultimoUsoEm
              ? `usado ${tempoDesde(new Date(atual.ultimoUsoEm), new Date(detalhe.agoraIso))}`
              : "ainda não usado"}
          </span>
          {anteriores.map((token) =>
            token.expiraEm ? (
              <span key={token.id} className="text-quiet">
                {`O token anterior (${mascararToken(token.prefixo)}) para às ${horaNaCasa(token.expiraEm, restaurante.fuso)} (${dataCurtaNaCasa(token.expiraEm, restaurante.fuso)}).`}
              </span>
            ) : null
          )}
        </div>
      ) : (
        <p className="text-sm text-quiet">Esta casa ainda não tem token de envio.</p>
      )}

      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}

      {etapa === "trocar" ? (
        <Confirmacao
          texto="Quando o token antigo para de valer?"
          rotuloConfirmar="Gerar novo token"
          enviando={enviando}
          aoConfirmar={() => gerar(antigo)}
          aoCancelar={() => setEtapa("nada")}
        >
          <fieldset className="flex flex-col">
            <legend className="sr-only">Quando o token antigo para</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="antigo"
                checked={antigo === "agora"}
                onChange={() => setAntigo("agora")}
                className="size-4 accent-primary"
              />
              Agora (padrão)
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="antigo"
                checked={antigo === "24h"}
                onChange={() => setAntigo("24h")}
                className="size-4 accent-primary"
              />
              Em 24 horas (o SCC tem um dia para trocar)
            </label>
          </fieldset>
        </Confirmacao>
      ) : etapa === "revogar" ? (
        <Confirmacao
          texto="O SCC para de enviar até receber um token novo."
          rotuloConfirmar="Revogar token"
          enviando={enviando}
          aoConfirmar={revogar}
          aoCancelar={() => setEtapa("nada")}
        />
      ) : atual ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            size="toque"
            className={BOTAO}
            onClick={() => {
              setAntigo("agora");
              setEtapa("trocar");
            }}
          >
            Gerar novo token
          </Button>
          <Button
            type="button"
            variant="outline"
            size="toque"
            className={BOTAO}
            onClick={() => setEtapa("revogar")}
          >
            Revogar token
          </Button>
        </div>
      ) : (
        <form
          method="post"
          onSubmit={(evento) => {
            evento.preventDefault();
            gerar("agora");
          }}
        >
          <Button
            type="submit"
            size="toque"
            className={BOTAO}
            disabled={!hidratado || enviando}
          >
            {enviando ? "Gerando…" : "Gerar token"}
          </Button>
        </form>
      )}
    </Cartao>
  );
}
```

Crie `components/admin/cartoes/cartao-acesso.tsx`:

```tsx
"use client";

import { Cartao } from "@/components/admin/cartao";
import { Confirmacao } from "@/components/admin/confirmacao";
import { FormularioEmail } from "@/components/admin/formulario-email";
import { QuadroCopieAgora } from "@/components/admin/quadro-copie-agora";
import { Button } from "@/components/ui/button";
import {
  criarLoginAction,
  redefinirSenhaAction,
  trocarEmailAction,
} from "@/lib/admin/actions";
import { momentoNaCasa } from "@/lib/admin/datas";
import { avisoDeLoginLigado, avisoDeOutrasCasas } from "@/lib/admin/mensagens";
import type { EmailInput } from "@/lib/admin/schemas";
import { plural } from "@/lib/admin/texto";
import type { DetalheDoRestaurante, LoginDoDetalhe } from "@/lib/admin/tipos";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type SenhaParaCopiar = { email: string; senha: string; mensagem: string };
const BOTAO = "md:h-9 md:text-sm";

function juntar(...frases: string[]): string {
  return frases.filter((frase) => frase !== "").join(" ");
}

/**
 * Cartão 3 (desenho §1.1, D-55): criar login, redefinir senha e trocar
 * e-mail. A senha provisória aparece uma vez, com a mensagem pronta para o
 * WhatsApp; sair da página apaga o quadro.
 */
export function CartaoAcesso({ detalhe }: { detalhe: DetalheDoRestaurante }) {
  const { restaurante, logins } = detalhe;
  const [senha, setSenha] = useState<SenhaParaCopiar | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function criar(valores: EmailInput): Promise<string | null> {
    setAviso(null);
    const resultado = await criarLoginAction(restaurante.id, valores);
    if (!resultado.ok) return resultado.error;
    if (resultado.data?.tipo === "novo") setSenha(resultado.data);
    if (resultado.data?.tipo === "ligado") {
      setAviso(avisoDeLoginLigado(resultado.data.outrasCasas));
    }
    return null;
  }

  return (
    <Cartao titulo="Acesso do cliente">
      {senha ? (
        <QuadroCopieAgora
          titulo="Copie agora: esta senha não aparece de novo"
          rotulo={`Senha provisória de ${senha.email}`}
          valor={senha.senha}
          copias={[{ rotulo: "Copiar mensagem para o WhatsApp", texto: senha.mensagem }]}
        />
      ) : null}
      {aviso ? (
        <output className="brand-surface block rounded-lg p-3 text-sm">{aviso}</output>
      ) : null}
      {logins.length === 0 ? (
        <>
          <p className="text-sm text-quiet">Esta casa ainda não tem login.</p>
          <FormularioEmail rotulo="E-mail do cliente" botao="Criar login" aoEnviar={criar} />
        </>
      ) : (
        <ul className="flex flex-col gap-4">
          {logins.map((login) => (
            <li key={login.userId}>
              <LinhaDoLogin
                login={login}
                detalhe={detalhe}
                aoRedefinir={setSenha}
                aoAvisar={setAviso}
              />
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

function LinhaDoLogin({
  login,
  detalhe,
  aoRedefinir,
  aoAvisar,
}: {
  login: LoginDoDetalhe;
  detalhe: DetalheDoRestaurante;
  aoRedefinir: (senha: SenhaParaCopiar) => void;
  aoAvisar: (texto: string | null) => void;
}) {
  const { restaurante } = detalhe;
  const [etapa, setEtapa] = useState<"nada" | "redefinir" | "email">("nada");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const ultimoAcesso = login.ultimoAcessoEm
    ? `último acesso: ${momentoNaCasa(login.ultimoAcessoEm, new Date(detalhe.agoraIso), restaurante.fuso)}`
    : "ainda não entrou";

  function redefinir() {
    setErro(null);
    iniciar(async () => {
      const resultado = await redefinirSenhaAction(restaurante.id, login.userId);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      if (resultado.data) {
        aoRedefinir({
          email: resultado.data.email,
          senha: resultado.data.senha,
          mensagem: resultado.data.mensagem,
        });
        aoAvisar(avisoDeOutrasCasas(resultado.data.outrasCasas, "senha") || null);
      }
      setEtapa("nada");
    });
  }

  async function trocarEmail(valores: EmailInput): Promise<string | null> {
    const resultado = await trocarEmailAction(restaurante.id, login.userId, valores);
    if (!resultado.ok) return resultado.error;
    toast.success("E-mail trocado. O cliente já entra com o e-mail novo.");
    setEtapa("nada");
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 text-sm">
        <span className="break-all font-bold">{login.email}</span>
        <span className="text-quiet">{ultimoAcesso}</span>
        {login.outrasCasas > 0 ? (
          <span className="text-quiet">
            {`abre ${plural(login.outrasCasas + 1, "casa", "casas")}`}
          </span>
        ) : null}
        {login.precisaTrocarSenha ? (
          <span className="number-mono w-fit rounded-full border px-2 py-0.5 text-xs">
            precisa trocar a senha
          </span>
        ) : null}
      </div>
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
      {etapa === "redefinir" ? (
        <Confirmacao
          texto={juntar(
            "Gera uma senha provisória nova, pede a troca no próximo acesso e desconecta os aparelhos deste login.",
            avisoDeOutrasCasas(login.outrasCasas, "senha")
          )}
          rotuloConfirmar="Redefinir senha"
          enviando={enviando}
          aoConfirmar={redefinir}
          aoCancelar={() => setEtapa("nada")}
        />
      ) : etapa === "email" ? (
        <FormularioEmail
          rotulo="E-mail novo"
          botao="Trocar e-mail"
          aviso={juntar(
            "O cliente passa a entrar com o e-mail novo, sem e-mail de confirmação.",
            avisoDeOutrasCasas(login.outrasCasas, "email")
          )}
          aoEnviar={trocarEmail}
          aoCancelar={() => setEtapa("nada")}
        />
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="toque"
            className={BOTAO}
            onClick={() => setEtapa("redefinir")}
          >
            Redefinir senha
          </Button>
          <Button
            type="button"
            variant="outline"
            size="toque"
            className={BOTAO}
            onClick={() => setEtapa("email")}
          >
            Trocar e-mail
          </Button>
        </div>
      )}
    </div>
  );
}
```

Crie `components/admin/cartoes/cartao-reenvio.tsx`:

```tsx
"use client";

import { Cartao } from "@/components/admin/cartao";
import { useHidratado } from "@/components/forms/use-hidratado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pedirReenvioAction } from "@/lib/admin/actions";
import { diaCurto, hojeNaCasa } from "@/lib/admin/datas";
import {
  DIAS_MAXIMOS_DO_REENVIO,
  primeiroDiaDoReenvio,
  problemaNoReenvio,
} from "@/lib/admin/schemas";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";
import { type FormEvent, useId, useState, useTransition } from "react";
import { toast } from "sonner";

/**
 * Cartão 5 (contrato §8): o SCC manda de novo tudo desde a data, na resposta
 * ao próximo envio. O banco limpa o pedido sozinho quando o reenvio começa.
 */
export function CartaoReenvio({ detalhe }: { detalhe: DetalheDoRestaurante }) {
  const { restaurante } = detalhe;
  const hoje = hojeNaCasa(new Date(detalhe.agoraIso), restaurante.fuso);
  const idDoCampo = useId();
  const hidratado = useHidratado();
  const [desde, setDesde] = useState(hoje);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function pedir(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const problema = problemaNoReenvio(desde, hoje);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    iniciar(async () => {
      const resultado = await pedirReenvioAction(restaurante.id, { desde });
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      toast.success("Pedido de reenvio registrado. Vai na próxima resposta ao SCC.");
    });
  }

  return (
    <Cartao titulo="Pedir reenvio">
      {restaurante.pedidoReenvioDesde ? (
        <output className="brand-surface block rounded-lg p-3 text-sm">
          {`Pedido de reenvio desde ${diaCurto(restaurante.pedidoReenvioDesde)}, aguardando o SCC.`}
        </output>
      ) : null}
      <p className="text-sm text-quiet">
        {`O SCC manda de novo tudo desde a data escolhida. Até ${DIAS_MAXIMOS_DO_REENVIO} dias para trás.`}
      </p>
      <form
        method="post"
        onSubmit={pedir}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        noValidate
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={idDoCampo}>Desde</Label>
          <Input
            id={idDoCampo}
            type="date"
            min={primeiroDiaDoReenvio(hoje)}
            max={hoje}
            value={desde}
            onChange={(evento) => setDesde(evento.target.value)}
          />
        </div>
        <Button
          type="submit"
          size="toque"
          className="md:h-9 md:text-sm"
          disabled={!hidratado || enviando}
        >
          {enviando ? "Enviando…" : "Pedir reenvio"}
        </Button>
      </form>
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
    </Cartao>
  );
}
```

Crie `components/admin/cartoes/cartao-situacao.tsx`:

```tsx
"use client";

import { Cartao } from "@/components/admin/cartao";
import { Confirmacao } from "@/components/admin/confirmacao";
import { Button } from "@/components/ui/button";
import { mudarSituacaoAction } from "@/lib/admin/actions";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";
import { useState, useTransition } from "react";
import { toast } from "sonner";

/** Cartão 6 (D-57): suspender ou reativar. Os dados ficam e o SCC continua enviando. */
export function CartaoSituacao({ detalhe }: { detalhe: DetalheDoRestaurante }) {
  const { restaurante } = detalhe;
  const suspenso = restaurante.situacao === "suspenso";
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function mudar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await mudarSituacaoAction(
        restaurante.id,
        suspenso ? "ativo" : "suspenso"
      );
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      toast.success(suspenso ? "Restaurante reativado." : "Restaurante suspenso.");
      setConfirmando(false);
    });
  }

  return (
    <Cartao titulo="Situação">
      <p className="text-sm">
        {suspenso
          ? "Suspenso: o dono vê o aviso de acesso suspenso."
          : "Ativo: o dono vê o painel."}
      </p>
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
      {confirmando ? (
        <Confirmacao
          texto={
            suspenso
              ? "O dono volta a ver o painel."
              : "O dono deixa de ver o painel e vê o aviso com o WhatsApp da Repply; os dados continuam guardados e o SCC continua enviando."
          }
          rotuloConfirmar={suspenso ? "Reativar" : "Suspender"}
          enviando={enviando}
          aoConfirmar={mudar}
          aoCancelar={() => setConfirmando(false)}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="toque"
          className="w-full sm:w-fit md:h-9 md:text-sm"
          onClick={() => setConfirmando(true)}
        >
          {suspenso ? "Reativar" : "Suspender"}
        </Button>
      )}
    </Cartao>
  );
}
```

Rode `npx vitest run tests/admin/formularios-antes-de-carregar.test.tsx tests/admin/formulario-restaurante.test.tsx tests/admin/cartoes-com-acao.test.tsx` → esperado: PASSA.

- [ ] **Passo 6: Páginas de cadastro e edição**

Crie `app/admin/restaurantes/novo/page.tsx`:

```tsx
import { FormularioRestaurante } from "@/components/admin/formulario-restaurante";
import { VALORES_INICIAIS } from "@/lib/admin/schemas";
import { exigirAdmin } from "@/lib/auth/sessao";
import Link from "next/link";

export const metadata = { title: "Cadastrar restaurante · admin · repply food." };

export default async function PaginaNovoRestaurante() {
  await exigirAdmin();
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/admin"
        className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4"
      >
        ‹ Restaurantes
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Cadastrar restaurante</h1>
        <p className="text-sm text-quiet">
          O endereço do painel sai do nome e não muda depois. Turnos, limite da
          conta esquecida e intervalo de envio ficam com o padrão.
        </p>
      </div>
      <FormularioRestaurante modo="cadastro" valoresIniciais={VALORES_INICIAIS} />
    </section>
  );
}
```

Crie `app/admin/restaurantes/[id]/editar/page.tsx`:

```tsx
import { FormularioRestaurante } from "@/components/admin/formulario-restaurante";
import { restauranteParaEditar } from "@/lib/admin/dados";
import { exigirAdmin } from "@/lib/auth/sessao";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = { title: "Editar restaurante · admin · repply food." };

export default async function PaginaEditarRestaurante({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirAdmin();
  const restaurante = await restauranteParaEditar(id);
  if (!restaurante) notFound();
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href={`/admin/restaurantes/${restaurante.id}`}
        className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4"
      >
        {`‹ ${restaurante.nome}`}
      </Link>
      <h1 className="text-2xl font-semibold">Editar dados</h1>
      <FormularioRestaurante
        modo="edicao"
        restauranteId={restaurante.id}
        valoresIniciais={restaurante.valores}
      />
    </section>
  );
}
```

- [ ] **Passo 7: Verificar e commitar**

```bash
npx biome check --write components/admin/botao-copiar.tsx components/admin/quadro-copie-agora.tsx components/admin/confirmacao.tsx components/admin/formulario-email.tsx components/admin/editor-horario.tsx components/admin/formulario-restaurante.tsx components/admin/cartoes/cartao-token.tsx components/admin/cartoes/cartao-acesso.tsx components/admin/cartoes/cartao-reenvio.tsx components/admin/cartoes/cartao-situacao.tsx app/admin/restaurantes/novo "app/admin/restaurantes/[id]/editar" tests/admin/formularios-antes-de-carregar.test.tsx tests/admin/formulario-restaurante.test.tsx tests/admin/cartoes-com-acao.test.tsx
npx vitest run tests/admin/formularios-antes-de-carregar.test.tsx tests/admin/formulario-restaurante.test.tsx tests/admin/cartoes-com-acao.test.tsx
npx tsc --noEmit
```

(Erros de `tsc` só em `app/admin/{layout,page}.tsx`, `app/admin/restaurantes/[id]/page.tsx` ou nos componentes da lista e do topo são da Tarefa 5; em `app/r/` ou `components/painel/`, da Tarefa 7: anote e siga.)

```bash
git fetch && git status -sb && git status --short
git add components/admin/botao-copiar.tsx components/admin/quadro-copie-agora.tsx components/admin/confirmacao.tsx components/admin/formulario-email.tsx components/admin/editor-horario.tsx components/admin/formulario-restaurante.tsx components/admin/cartoes/cartao-token.tsx components/admin/cartoes/cartao-acesso.tsx components/admin/cartoes/cartao-reenvio.tsx components/admin/cartoes/cartao-situacao.tsx app/admin/restaurantes/novo/page.tsx "app/admin/restaurantes/[id]/editar/page.tsx" tests/admin/formularios-antes-de-carregar.test.tsx tests/admin/formulario-restaurante.test.tsx tests/admin/cartoes-com-acao.test.tsx
git commit -m "Cria o cadastro e a edição do restaurante e os cartões de token, acesso, reenvio e situação" -m "Co-Authored-By: <trailer do seu modelo>"
```

---

## Tarefa 7: Painel do cliente: faixa do admin, Ajustes do admin e "Trocar de casa"  *(paralela às Tarefas 5 e 6)*

**Por quê:** D-58 e D-59. O admin que abre o painel de um cliente vê, em todas as telas da casa, a faixa "Você está vendo o painel de X · só leitura · Voltar ao admin"; em Ajustes, o login do cliente no lugar de "E-mail / Trocar senha / Sair". Abrir o painel entra no histórico (uma vez por hora). O dono com duas ou mais casas ativas ganha "Trocar de casa".

**Arquivos (lista fechada):**
- Modificar: `app/r/[slug]/layout.tsx`, `app/r/[slug]/ajustes/page.tsx`, `components/painel/moldura-painel.tsx`
- Criar: `components/painel/faixa-modo-leitura.tsx`
- Testes (criar): `tests/painel/modo-leitura.test.tsx`, `tests/painel/layout-da-casa.test.tsx`, `tests/painel/ajustes.test.tsx`

**Interfaces consumidas:** Tarefa 3 (`exigirCasa(slug) → { sessao, casa, modoAdmin }`, `podeTrocarDeCasa`), Tarefa 4 (`registrarAberturaDoPainel(restauranteId)`, `emailsDosLoginsDaCasa(restauranteId)`). Do código existente: `seloDaLeitura`, `logError`, `SeletorTema`, `sairAction`, `WHATSAPP_REPPLY`.

**Interfaces produzidas:**
- `MolduraPainel({ casa, selo, faixa?: ReactNode, trocarDeCasa?: boolean, children })` (as duas props novas são opcionais; quem já usa continua igual).
- `FaixaModoLeitura({ nome: string; restauranteId: string })`: `<section aria-label="Modo leitura do admin">`.

- [ ] **Passo 1: Testes (falham)**

Crie `tests/painel/modo-leitura.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/r/casa-x/hoje" }));

import { FaixaModoLeitura } from "@/components/painel/faixa-modo-leitura";
import { MolduraPainel } from "@/components/painel/moldura-painel";
import type { Selo } from "@/lib/painel/selo";

afterEach(cleanup);

const selo: Selo = { tom: "ok", texto: "atualizado há 2 min", textoCurto: "há 2 min" };
const casa = { nome: "Casa X", slug: "casa-x" };

describe("admin vendo o painel do cliente (D-58)", () => {
  it("a faixa diz de quem é o painel, que é só leitura, e volta ao admin", () => {
    render(<FaixaModoLeitura nome="Casa X" restauranteId="c1" />);
    const faixa = screen.getByRole("region", { name: "Modo leitura do admin" });
    expect(faixa.textContent).toContain("Você está vendo o painel de Casa X · só leitura");
    expect(
      within(faixa).getByRole("link", { name: "Voltar ao admin" }).getAttribute("href")
    ).toBe("/admin/restaurantes/c1");
  });

  it("a moldura põe a faixa no topo, antes do cabeçalho do celular", () => {
    const { container } = render(
      <MolduraPainel
        casa={casa}
        selo={selo}
        faixa={<FaixaModoLeitura nome="Casa X" restauranteId="c1" />}
      >
        <p>conteúdo</p>
      </MolduraPainel>
    );
    const faixa = screen.getByRole("region", { name: "Modo leitura do admin" });
    const cabecalho = container.querySelector("header");
    if (!cabecalho) throw new Error("moldura sem cabeçalho");
    expect(
      faixa.compareDocumentPosition(cabecalho) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("sem a faixa, nada de modo leitura", () => {
    render(
      <MolduraPainel casa={casa} selo={selo}>
        <p>conteúdo</p>
      </MolduraPainel>
    );
    expect(screen.queryByRole("region", { name: "Modo leitura do admin" })).toBeNull();
  });
});

describe("trocar de casa (D-58)", () => {
  it("aparece no cabeçalho do celular e na barra lateral, levando à escolha da casa", () => {
    const { container } = render(
      <MolduraPainel casa={casa} selo={selo} trocarDeCasa>
        <p>conteúdo</p>
      </MolduraPainel>
    );
    const barra = container.querySelector("aside");
    const cabecalho = container.querySelector("header");
    if (!(barra && cabecalho)) throw new Error("moldura sem barra ou cabeçalho");
    for (const parte of [barra, cabecalho]) {
      expect(
        within(parte as HTMLElement)
          .getByRole("link", { name: "Trocar de casa" })
          .getAttribute("href")
      ).toBe("/escolher-casa");
    }
  });

  it("não aparece sem a opção", () => {
    render(
      <MolduraPainel casa={casa} selo={selo}>
        <p>conteúdo</p>
      </MolduraPainel>
    );
    expect(screen.queryAllByRole("link", { name: "Trocar de casa" })).toHaveLength(0);
  });
});
```

Crie `tests/painel/layout-da-casa.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { exigirCasa, registrarAberturaDoPainel } = vi.hoisted(() => ({
  exigirCasa: vi.fn(),
  registrarAberturaDoPainel: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/r/casa-x/hoje" }));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/admin/registro", () => ({ registrarAberturaDoPainel }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  }),
}));

import LayoutCasa from "@/app/r/[slug]/layout";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  registrarAberturaDoPainel.mockResolvedValue(undefined);
});

const CASA = {
  id: "c1",
  slug: "casa-x",
  nome: "Casa X",
  situacao: "ativo",
  fuso: "America/Fortaleza",
};

function sessao(ehAdmin: boolean, casas: unknown[]) {
  return { userId: "u1", email: "x@y.com", ehAdmin, precisaTrocarSenha: false, casas };
}

async function abrir() {
  render(
    await LayoutCasa({
      children: <p>conteúdo</p>,
      params: Promise.resolve({ slug: "casa-x" }),
    })
  );
}

describe("layout da casa", () => {
  it("o admin vê a faixa, e a abertura entra no histórico (D-59)", async () => {
    exigirCasa.mockResolvedValue({ sessao: sessao(true, []), casa: CASA, modoAdmin: true });
    await abrir();
    expect(screen.getByRole("region", { name: "Modo leitura do admin" })).toBeTruthy();
    expect(registrarAberturaDoPainel).toHaveBeenCalledWith("c1");
    expect(screen.queryAllByRole("link", { name: "Trocar de casa" })).toHaveLength(0);
  });

  it("o dono não vê a faixa e nada vai para o histórico", async () => {
    exigirCasa.mockResolvedValue({ sessao: sessao(false, [CASA]), casa: CASA, modoAdmin: false });
    await abrir();
    expect(screen.queryByRole("region", { name: "Modo leitura do admin" })).toBeNull();
    expect(registrarAberturaDoPainel).not.toHaveBeenCalled();
  });

  it("o dono com duas casas ativas vê 'Trocar de casa'", async () => {
    exigirCasa.mockResolvedValue({
      sessao: sessao(false, [CASA, { ...CASA, id: "c2", slug: "casa-y" }]),
      casa: CASA,
      modoAdmin: false,
    });
    await abrir();
    expect(screen.getAllByRole("link", { name: "Trocar de casa" })).toHaveLength(2);
  });
});
```

Crie `tests/painel/ajustes.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { exigirCasa, emailsDosLoginsDaCasa } = vi.hoisted(() => ({
  exigirCasa: vi.fn(),
  emailsDosLoginsDaCasa: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/admin/dados", () => ({ emailsDosLoginsDaCasa }));
vi.mock("@/lib/auth/actions", () => ({ sairAction: vi.fn() }));

import PaginaAjustes from "@/app/r/[slug]/ajustes/page";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const CASA = {
  id: "c1",
  slug: "casa-x",
  nome: "Casa X",
  situacao: "ativo",
  fuso: "America/Fortaleza",
};

async function abrir() {
  render(await PaginaAjustes({ params: Promise.resolve({ slug: "casa-x" }) }));
}

describe("Ajustes", () => {
  it("o dono vê o e-mail dele, trocar senha e sair", async () => {
    exigirCasa.mockResolvedValue({
      sessao: { email: "dono@exemplo.com", ehAdmin: false },
      casa: CASA,
      modoAdmin: false,
    });
    await abrir();
    expect(screen.getByText("dono@exemplo.com")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Trocar senha/ }).getAttribute("href")
    ).toBe("/trocar-senha?voltar=%2Fr%2Fcasa-x%2Fajustes");
    expect(screen.getByRole("button", { name: "Sair" })).toBeTruthy();
    expect(emailsDosLoginsDaCasa).not.toHaveBeenCalled();
  });

  it("o admin vê o login do cliente, com o caminho para o admin, e não as ações da conta (D-58)", async () => {
    exigirCasa.mockResolvedValue({
      sessao: { email: "admin@repply.local", ehAdmin: true },
      casa: CASA,
      modoAdmin: true,
    });
    emailsDosLoginsDaCasa.mockResolvedValue(["dono@exemplo.com"]);
    await abrir();
    const link = screen.getByRole("link", { name: /Login do cliente/ });
    expect(link.getAttribute("href")).toBe("/admin/restaurantes/c1");
    expect(link.textContent).toContain("dono@exemplo.com (ver no admin)");
    expect(screen.queryByText("admin@repply.local")).toBeNull();
    expect(screen.queryByRole("link", { name: /Trocar senha/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sair" })).toBeNull();
    expect(screen.getByRole("group", { name: "Tema" })).toBeTruthy();
  });

  it("casa ainda sem login: diz isso", async () => {
    exigirCasa.mockResolvedValue({
      sessao: { email: "admin@repply.local", ehAdmin: true },
      casa: CASA,
      modoAdmin: true,
    });
    emailsDosLoginsDaCasa.mockResolvedValue([]);
    await abrir();
    expect(
      screen.getByRole("link", { name: /Login do cliente/ }).textContent
    ).toContain("ainda não criado (ver no admin)");
  });
});
```

Rode `npx vitest run tests/painel` → esperado: FALHA nos três arquivos novos (a faixa não existe, a moldura não tem as props novas, o layout e o Ajustes não conhecem `modoAdmin`). `tests/painel/menu-painel.test.tsx` continua passando.

- [ ] **Passo 2: Faixa e moldura**

Crie `components/painel/faixa-modo-leitura.tsx`:

```tsx
import Link from "next/link";

/**
 * O admin vendo o painel de um cliente (D-58): faixa fixa em todas as telas da
 * casa, com o caminho de volta. Fundo laranja com texto quase-preto (nunca
 * branco sobre laranja). O link ganha área de toque de 44 px pelo
 * pseudo-elemento, sem mudar o desenho.
 */
export function FaixaModoLeitura({
  nome,
  restauranteId,
}: {
  nome: string;
  restauranteId: string;
}) {
  return (
    <section
      aria-label="Modo leitura do admin"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-primary px-4 py-2 text-sm text-primary-foreground md:px-8"
    >
      <p>
        Você está vendo o painel de <strong>{nome}</strong> · só leitura
      </p>
      <Link
        href={`/admin/restaurantes/${restauranteId}`}
        className="relative font-bold underline underline-offset-4 after:absolute after:-inset-x-2 after:-inset-y-3"
      >
        Voltar ao admin
      </Link>
    </section>
  );
}
```

Substitua `components/painel/moldura-painel.tsx` por:

```tsx
import { Logo } from "@/components/marca/logo";
import type { Selo } from "@/lib/painel/selo";
import Link from "next/link";
import type { ReactNode } from "react";
import { MenuPainel } from "./menu-painel";
import { SeloDados } from "./selo-dados";

type Props = {
  casa: { nome: string; slug: string };
  selo: Selo;
  /** Faixa fixa no topo: o admin vendo o painel do cliente (D-58). */
  faixa?: ReactNode;
  /** "Trocar de casa": login com duas ou mais casas ativas (D-58). */
  trocarDeCasa?: boolean;
  children: ReactNode;
};

/**
 * Moldura do painel do dono (D-40): no computador, barra lateral escura com a
 * marca, o menu e, no rodapé, a casa e o selo; no celular, faixa de cima com a
 * casa e o selo e menu fixo embaixo. A faixa do modo leitura fica presa no
 * topo junto com o cabeçalho do celular.
 */
export function MolduraPainel({
  casa,
  selo,
  faixa = null,
  trocarDeCasa = false,
  children,
}: Props) {
  return (
    <div className="min-h-dvh">
      <aside className="scheme-ink fixed inset-y-0 left-0 hidden w-60 flex-col gap-6 p-4 md:flex">
        <Logo variante="escuro" className="px-1 pt-2" />
        <MenuPainel slug={casa.slug} variante="lateral" />
        <div className="mt-auto flex flex-col gap-2 px-1 pb-2">
          <strong className="text-sm">{casa.nome}</strong>
          {trocarDeCasa ? (
            <Link href="/escolher-casa" className="w-fit text-sm underline underline-offset-4">
              Trocar de casa
            </Link>
          ) : null}
          <SeloDados selo={selo} />
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col md:pl-60">
        <div className="sticky top-0 z-10">
          {faixa}
          <header className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3 md:hidden">
            <span className="flex min-w-0 items-center gap-2">
              <img src="/marca/simbolo.svg" alt="repply food." width={28} height={28} />
              <span className="flex min-w-0 flex-col">
                <strong className="truncate text-base">{casa.nome}</strong>
                {trocarDeCasa ? (
                  // Alvo de 44 px sem mudar o desenho: o pseudo-elemento estica a área tocável.
                  <Link
                    href="/escolher-casa"
                    className="relative w-fit text-xs underline underline-offset-4 after:absolute after:-inset-x-2 after:-inset-y-3.5"
                  >
                    Trocar de casa
                  </Link>
                ) : null}
              </span>
            </span>
            <SeloDados selo={selo} compacto />
          </header>
        </div>

        <main className="flex-1 px-4 pt-4 pb-24 md:px-8 md:pt-8 md:pb-8">{children}</main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <MenuPainel slug={casa.slug} variante="inferior" />
      </div>
    </div>
  );
}
```

- [ ] **Passo 3: Layout da casa e Ajustes**

Substitua `app/r/[slug]/layout.tsx` por:

```tsx
import { FaixaModoLeitura } from "@/components/painel/faixa-modo-leitura";
import { MolduraPainel } from "@/components/painel/moldura-painel";
import { registrarAberturaDoPainel } from "@/lib/admin/registro";
import { podeTrocarDeCasa } from "@/lib/auth/destino";
import { exigirCasa } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { seloDaLeitura } from "@/lib/painel/selo";
import { createClient } from "@/lib/supabase/server";
import type { ReactNode } from "react";

export default async function LayoutCasa({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { sessao, casa, modoAdmin } = await exigirCasa(slug);

  // A RLS só devolve o sinal de vida de quem tem acesso à casa. Ao mesmo
  // tempo, o admin abrindo o painel entra no histórico, no máximo uma vez por
  // hora (D-59); isso nunca impede o painel de abrir.
  const supabase = await createClient();
  const [{ data: sinal, error }] = await Promise.all([
    supabase
      .from("sinal_de_vida")
      .select("estado, ultimo_envio_ok_em")
      .eq("restaurante_id", casa.id)
      .maybeSingle(),
    modoAdmin ? registrarAberturaDoPainel(casa.id) : Promise.resolve(),
  ]);

  // Falha na leitura não pode virar "aguardando o 1º envio" (falso para quem já
  // envia): o selo fica neutro, e o log leva só o código.
  if (error) logError("falha_leitura_sinal");

  const selo = seloDaLeitura({
    dados: sinal,
    erro: error,
    agora: new Date(),
    fuso: casa.fuso,
  });

  return (
    <MolduraPainel
      casa={{ nome: casa.nome, slug: casa.slug }}
      selo={selo}
      faixa={
        modoAdmin ? <FaixaModoLeitura nome={casa.nome} restauranteId={casa.id} /> : null
      }
      trocarDeCasa={podeTrocarDeCasa(sessao)}
    >
      {children}
    </MolduraPainel>
  );
}
```

Substitua `app/r/[slug]/ajustes/page.tsx` por:

```tsx
import { SeletorTema } from "@/components/painel/seletor-tema";
import { Button } from "@/components/ui/button";
import { emailsDosLoginsDaCasa } from "@/lib/admin/dados";
import { sairAction } from "@/lib/auth/actions";
import { exigirCasa } from "@/lib/auth/sessao";
import { WHATSAPP_REPPLY } from "@/lib/contato";
import Link from "next/link";

export const metadata = { title: "Ajustes · repply food." };

/**
 * Etapa 2: só a parte da conta. Meta, turnos e o resto chegam na etapa 6.
 * O admin vendo o painel do cliente (D-58) vê o login do cliente no lugar de
 * "E-mail / Trocar senha / Sair": a conta que ele mexeria ali é a dele.
 */
export default async function PaginaAjustes({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sessao, casa, modoAdmin } = await exigirCasa(slug);
  const loginsDoCliente = modoAdmin ? await emailsDosLoginsDaCasa(casa.id) : [];

  return (
    <section className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Ajustes</h1>
      <div className="brand-surface flex flex-col divide-y rounded-lg">
        {modoAdmin ? (
          <Link
            href={`/admin/restaurantes/${casa.id}`}
            className="flex min-h-14 items-center justify-between gap-4 px-4 py-2"
          >
            <span className="shrink-0">Login do cliente</span>
            <span className="min-w-0 break-all text-right text-quiet">
              {`${loginsDoCliente.length > 0 ? loginsDoCliente.join(", ") : "ainda não criado"} (ver no admin)`}
            </span>
          </Link>
        ) : (
          <>
            <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2">
              <span className="shrink-0">E-mail</span>
              <span className="min-w-0 break-all text-right text-quiet">{sessao.email}</span>
            </div>
            <Link
              href={`/trocar-senha?voltar=${encodeURIComponent(`/r/${slug}/ajustes`)}`}
              className="flex min-h-14 items-center justify-between px-4"
            >
              <span>Trocar senha</span>
              <span aria-hidden="true">›</span>
            </Link>
          </>
        )}
        <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2">
          <span>Tema</span>
          <SeletorTema />
        </div>
        <a
          href={WHATSAPP_REPPLY.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-14 items-center justify-between px-4"
        >
          <span>Falar com a Repply</span>
          <span className="text-quiet">
            WhatsApp <span aria-hidden="true">›</span>
            <span className="sr-only">, abre em nova aba</span>
          </span>
        </a>
      </div>
      {modoAdmin ? null : (
        <form action={sairAction}>
          <Button type="submit" variant="outline" size="toque" className="w-full md:w-auto">
            Sair
          </Button>
        </form>
      )}
    </section>
  );
}
```

Rode `npx vitest run tests/painel` → esperado: PASSA (os cinco arquivos).

- [ ] **Passo 4: Verificar e commitar**

```bash
npx biome check --write "app/r/[slug]/layout.tsx" "app/r/[slug]/ajustes/page.tsx" components/painel/moldura-painel.tsx components/painel/faixa-modo-leitura.tsx tests/painel/modo-leitura.test.tsx tests/painel/layout-da-casa.test.tsx tests/painel/ajustes.test.tsx
npx tsc --noEmit
```

(Erros de `tsc` só em `app/admin/` ou `components/admin/` são das Tarefas 5 e 6: anote e siga.)

```bash
git fetch && git status -sb && git status --short
git add "app/r/[slug]/layout.tsx" "app/r/[slug]/ajustes/page.tsx" components/painel/moldura-painel.tsx components/painel/faixa-modo-leitura.tsx tests/painel/modo-leitura.test.tsx tests/painel/layout-da-casa.test.tsx tests/painel/ajustes.test.tsx
git commit -m "Mostra a faixa só leitura do admin, o login do cliente em Ajustes e o trocar de casa no painel" -m "Co-Authored-By: <trailer do seu modelo>"
```

---

## Verificação do trio 5 ‖ 6 ‖ 7 (controlador)

- [ ] Com as Tarefas 5, 6 e 7 commitadas: `npx tsc --noEmit`, `npm run check`, `npx vitest run`, `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 npm run build`. Esperado: tudo limpo (agora a página de detalhe acha os quatro cartões da Tarefa 6). Erro de integração vai para um agente de conserto com a lista completa, antes da Tarefa 8.
- [ ] `grep -rnE "error\??\.message" app/admin components/admin lib/admin "app/r"` volta vazio (nenhum texto cru do Supabase na tela).

---

## Tarefa 8: Conferência no navegador, documentação e fechamento (controlador)

**Arquivos:** `docs/decisoes.md`, `docs/arquitetura/seguranca-e-isolamento.md`, `docs/arquitetura/modelo-de-dados.md`, `docs/arquitetura/recepcao-de-dados.md`, `docs/divida-tecnica.md`, `docs/operacao/cadastrar-restaurante.md`, `docs/README.md`, `README.md`, `CLAUDE.md` (§13), `scripts/acesso-local.ts` (só o comentário do topo), este plano.

- [ ] **Passo 1: Servidor de desenvolvimento e contas de teste**

`npm run local:acesso`, depois o `food-dev` do `.claude/launch.json` da pasta de trabalho (o mesmo da etapa 2), sempre em **`http://127.0.0.1:3000`**. Antes de cada commit desta tarefa: `git checkout -- AGENTS.md next-env.d.ts`.

- [ ] **Passo 2: Conferir no navegador, em 390 px e 1280 px, claro e escuro**

O tema é trocado em Ajustes de qualquer casa (no modo leitura o seletor continua) e vale para o admin no mesmo navegador. Roteiro (desenho §4):

1. **Porteiro e guarda.** Sem login, `/admin` → `/entrar?next=%2Fadmin`. Como `dono@casa-teste.local` (depois de trocar a senha), `/admin` e `/admin/restaurantes/<qualquer id>` voltam para a casa dele.
2. **Lista.** `admin@repply.local` → `/admin`: as duas casas de teste "aguardando", contadores, cartões no celular, tabela no computador com "Escolha um restaurante" à direita; menu ☰ no celular com e-mail, "Trocar minha senha" (volta ao `/admin`) e "Sair".
3. **Cadastro.** "+ Cadastrar restaurante": nome "Bar da Etapa 3", CNPJ `11.444.777/0001-61` (válido e fora dos testes: um CNPJ dos testes gravado aqui faria a suíte falhar com duplicado), fuso de Fortaleza, virada 5h; hoje aberto em "Dois horários" `00:00–12:00` e `12:00–00:00` (assim o vigia conta como aberto agora), "Copiar para os outros dias". Erros conferidos antes: nenhum dia aberto, horários que se sobrepõem, CNPJ errado. Cai no detalhe: lista à esquerda no computador; "‹ Restaurantes" no celular; cartões em coluna.
4. **Token e primeiro envio.** "Gerar token" → quadro "Copie agora" → "Copiar token" e "Copiar instruções para a SCC" (conferir o texto colado). Depois:
   ```bash
   SCC_TOKEN=<token copiado> npm run gerador -- --fuso America/Fortaleza --historico-dias 3 --parar-apos 1
   node --input-type=module -e "import pg from 'pg'; const c = new pg.Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres'); await c.connect(); await c.query('select public.atualizar_estados()'); await c.end();"
   ```
   (o segundo comando roda o vigia na hora, em vez de esperar até 5 min). Recarregar: selo "em dia" na lista e no detalhe, "Últimos envios" com contagens e versão do SCC, "usado há…" no token. Sair da página e voltar: o quadro do token sumiu.
5. **Troca de token em 24 h.** "Gerar novo token" → "Em 24 horas": o cartão mostra o anterior com "para às HH:MM (DD/MM)". "Revogar token" → confirmação → o gerador com o token antigo recebe `401`.
6. **Login do cliente.** "Criar login" com `dono-etapa3@teste.repply.local` → quadro da senha e "Copiar mensagem para o WhatsApp" (conferir o texto). Sair do admin, entrar como esse dono com a senha provisória → `/trocar-senha` → painel. Voltar ao admin: "último acesso" preenchido e sem "precisa trocar a senha".
7. **Dono com duas casas.** "Criar login" com `dono@casa-teste.local` no "Bar da Etapa 3" → "Este e-mail já tinha acesso; agora vê … casas". Entrar como esse dono: "Trocar de casa" no cabeçalho do celular e na barra lateral do computador → `/escolher-casa`.
8. **Redefinir senha desconecta.** Com o dono aberto numa aba, "Redefinir senha" no admin (o aviso de outras casas aparece) → na aba do dono, a próxima navegação vai para `/entrar`; a senha nova pede a troca.
9. **Trocar e-mail.** Para outro e-mail de teste; e-mail de outro login é recusado com frase do produto.
10. **Modo leitura.** "Ver o painel do cliente" → faixa laranja "só leitura · Voltar ao admin" em Hoje, Resultados e Ajustes; Ajustes mostra "Login do cliente: … (ver no admin)" sem Trocar senha/Sair; "Voltar ao admin" volta ao detalhe; o Histórico mostra "abriu o painel do cliente" uma vez só, mesmo abrindo de novo.
11. **Suspender e reativar.** "Suspender" → o dono vê "Acesso suspenso" com o WhatsApp; o admin ainda abre o painel (faixa); "Reativar" → o dono volta.
12. **Pedir reenvio.** Data futura e anterior a 120 dias são recusadas; uma data válida mostra "Pedido de reenvio desde DD/MM, aguardando o SCC"; o gerador (com um token válido) recebe `reenviar_desde` na resposta e, se mandar a janela desde essa data, o aviso some.
13. **Editar.** Trocar a virada para 2h → mensagem "Recalculamos o dia de operação…"; trocar o fuso → mensagem pede o reenvio. O resumo do horário no cartão Dados acompanha.
14. **Histórico.** Todas as ações acima, com data e hora da casa, o nome de quem fez e nenhum e-mail completo, senha ou token.
15. **Terminal do `next dev`:** nenhuma senha nem token impresso (só `POST /admin/...`).

Alvos de toque: conferir com o inspetor que botões, links do cabeçalho, "Trocar de casa", "Voltar ao admin" e as opções do editor de horário têm pelo menos 44 px de altura em 390 px. Sem rolagem lateral em 390 px. Capturas de tela de cada tela nova nas duas larguras e nos dois temas, para mostrar ao Lucas Ferreira. Qualquer problema: agente de conserto, e conferir de novo. As contas e casas criadas aqui ficam só no banco local.

- [ ] **Passo 3: Documentação**

`docs/decisoes.md`, no fim da tabela (mesmo formato das linhas D-52 a D-54):

```markdown
| D-55 | 14/10/2026 | **A senha provisória é gerada pelo sistema, mostrada uma vez ao admin e enviada pela Repply por WhatsApp.** "Redefinir senha" gera outra provisória, liga a troca obrigatória e desconecta os aparelhos. Convite por e-mail fica para depois. | — | O WhatsApp já é o canal da Repply com o dono (D-30), e o envio de e-mail pelo Resend só fica pronto na publicação (etapa 4). |
| D-56 | 14/10/2026 | **Até dois horários de funcionamento por dia** (ex.: almoço e jantar); o último pode passar da meia-noite. Fora deles o vigia não acusa atraso nem parada. | — | Muitas casas fecham entre o almoço e o jantar; com um horário só, o vigia acusaria "parado" no intervalo. |
| D-57 | 14/10/2026 | **O admin suspende e reativa restaurantes.** Suspenso, o dono vê "acesso suspenso" com o WhatsApp da Repply; os dados ficam guardados e o SCC continua enviando. Excluir fica fora do MVP. | — | Pausa ou inadimplência não podem apagar o histórico, e excluir não tem volta. |
| D-58 | 14/10/2026 | **Quem tem duas ou mais casas ativas troca de casa pelo painel; o admin que abre o painel de um cliente vê a faixa "só leitura" com "Voltar ao admin", e Ajustes mostra o login do cliente no lugar das ações da conta.** | — | Resolve o item 42 da dívida técnica: o dono com duas casas e o admin não tinham como trocar de casa nem voltar. |
| D-59 | 14/10/2026 | **As ações do admin ficam num histórico por restaurante** (quem, quando, o quê), sem senha nem token; "abriu o painel do cliente" entra no máximo uma vez por hora. | — | Dois admins mexem nas mesmas casas; o histórico mostra quem fez o quê sem guardar credencial. |
| D-60 | 14/10/2026 | **CNPJ opcional no cadastro; quando preenchido, é conferido e não pode repetir.** Vale o formato numérico e o alfanumérico da Receita (julho de 2026). | — | Nem todo cliente tem o CNPJ à mão no cadastro; quando tem, erro de digitação e casa cadastrada duas vezes aparecem na hora. |
```

(Se o Lucas Ferreira decidir aceitar só CNPJ numérico, tire a segunda frase da D-60.)

`docs/arquitetura/seguranca-e-isolamento.md`:
- §2, item 12: acrescentar que **função usada dentro de uma restrição `check` precisa de `execute` para quem grava** (sem isso, o admin recebe "permission denied for function"; foi o caso de `horario_funcionamento_valido` e `cnpj_valido`), e que funções só da chave de serviço entram na lista de `tests/isolamento/rpc-privilegada.test.ts`.
- §3, tabela: linha `registro_admin` (cliente: —; admin: lê e registra em nome próprio, ninguém altera nem apaga; recepção: —) e linha `restaurantes_no_admin` (visão com `security_invoker`: cliente lê a dele, sem a versão do SCC; admin lê todas). Na linha `tokens_envio`, admin "lê; troca e revoga pelas funções `trocar_token_envio` e `revogar_tokens_envio` (uma transação, com histórico)". Na linha `restaurantes`, "o banco confere horário (D-56), fuso e CNPJ (D-60)". Abaixo da tabela: privilégios explícitos (pendência 14): sem `TRUNCATE`, `REFERENCES`, `TRIGGER` e `MAINTAIN` para `anon` e `authenticated`, conferidos em `tests/isolamento/todas-as-tabelas.test.ts`.
- §5: o admin cria a conta pelo `/admin` com senha provisória gerada pelo sistema (12 caracteres sem 0/O, 1/l/I), mostrada uma vez e mandada por WhatsApp (D-55); e-mail que já tem conta só liga a casa. "Redefinir senha" grava outra provisória, liga a troca obrigatória e desconecta os aparelhos (`encerrar_sessoes_do_login` apaga `auth.sessions`; o Auth também derruba as sessões quando o admin troca a senha). **Resíduo:** o token de acesso já emitido ainda lê pela API de dados até expirar (até 1 h); o painel não abre, porque o porteiro chama `getUser`. "Trocar e-mail" muda na hora, sem confirmação, e recusa e-mail de outro login. Toda função do servidor do admin começa por `exigirAdmin()`, usa a chave de serviço só para o Auth e nunca põe senha ou token em log nem no histórico. A guarda por casa (`exigirCasa`) do admin busca só a casa do endereço e devolve `modoAdmin`.

`docs/arquitetura/modelo-de-dados.md`: no `restaurantes`, as três restrições novas e o comentário do horário (até dois por dia); seção nova `registro_admin` com o SQL da migration e as regras (RLS, uma abertura de painel por hora); a visão `restaurantes_no_admin`; na tabela de funções, `horario_funcionamento_valido`, `cnpj_valido`, `trocar_token_envio`, `revogar_tokens_envio`, `id_do_login_por_email`, `encerrar_sessoes_do_login`. Onde disser "8 tabelas", "9 tabelas".

`docs/arquitetura/recepcao-de-dados.md` §7: o horário aceita até dois intervalos por dia (D-56), conferido no banco; o formulário do admin exige um dia aberto (a lista vazia continua aceita no banco para cadastros antigos e conta como sempre aberta); "cadastro malformado" agora é barrado na gravação, e a defesa do vigia fica para linhas antigas.

`docs/README.md`: "As 8 tabelas" → "As 9 tabelas e a visão do admin".

`docs/divida-tecnica.md`:
- itens **9, 14, 27, 42 e 43** para "Resolvidos", com a data e os commits (9 e 14: Tarefa 1; 27 e 43: Tarefa 3; 42: Tarefas 3 e 7);
- na frase "Bloqueiam a primeira publicação (etapa 4)", tirar 14 e 27 e acrescentar o item 47 abaixo;
- itens novos:
  - **46** (Média, decisão de produto): mudar o fuso de uma casa não corrige as horas das contas já recebidas (`aberta_em` foi convertida com o fuso antigo); hoje a tela só pede o reenvio. Decidir se a edição pede o reenvio sozinha;
  - **47** (Média, bloqueia a etapa 4): na nuvem, conferir que o papel `postgres` lê `auth.users` e apaga `auth.sessions` (dependem disso `id_do_login_por_email` e `encerrar_sessoes_do_login`) e que o banco é o Postgres 17 (a migration `20261015120000` revoga `MAINTAIN`);
  - **48** (Baixa): o token de acesso de uma sessão encerrada ainda lê pela API de dados até expirar (até 1 h, `jwt_expiry`);
  - **49** (Baixa): os privilégios padrão do papel `supabase_admin` em `public` ainda dão `TRUNCATE` e afins a `anon` e `authenticated` em objetos criados por ele (pelo painel do Supabase): mais um motivo para criar tudo por migration;
  - **50** (Baixa): as 8 tabelas antigas mantêm `INSERT`, `UPDATE` e `DELETE` para `anon` e `authenticated` (a RLS decide); avaliar revogar o que o produto não usa.

`docs/operacao/cadastrar-restaurante.md`: mantenha o título da seção "Passo a passo" e troque o conteúdo dela (até antes de "Mensagem modelo para a SCC") por:

```markdown
1. **Admin → "+ Cadastrar restaurante".**
   - Nome; CNPJ (opcional, com ou sem pontuação; vale o CNPJ com letras); fuso (lista dos fusos do Brasil); "o dia vira às" (padrão 5h).
   - Horário de funcionamento, um bloco por dia: "Fechado", "Um horário" ou "Dois horários" (almoço e jantar). Fecha antes de abrir quer dizer que passa da meia-noite. "Copiar para os outros dias" repete o dia em toda a semana. Precisa de pelo menos um dia aberto.
   - Turnos, limite da conta esquecida e intervalo de envio ficam com o padrão.
   - O endereço do painel (`slug`) sai do nome, por exemplo `bar-do-ze`, e não muda depois.
2. **Gerar o token de envio** (cartão "Token de envio").
   - O token aparece **uma única vez**, no quadro "Copie agora". Sair da página apaga o quadro.
   - Para trocar: "Gerar novo token" e escolher se o antigo para **agora** (padrão) ou **em 24 h** (o SCC tem um dia para trocar). Máquina roubada: "Revogar token".
3. **"Copiar instruções para a SCC"** (no mesmo quadro). Monta a mensagem pronta, com:
   - o endereço;
   - o token;
   - o intervalo;
   - o pedido de fazer a carga inicial do histórico.

   Mande ao responsável da SCC pelo canal combinado. **Nunca publique o token em grupo nem em e-mail com várias pessoas.**
4. **Criar o acesso do cliente** (cartão "Acesso do cliente").
   - "Criar login" com o e-mail do dono. O sistema cria o login com senha provisória e troca obrigatória no primeiro acesso.
   - A senha aparece **uma única vez**: "Copiar mensagem para o WhatsApp" e mande ao dono (D-55).
   - Se o e-mail já tem acesso a outra casa (dono com duas casas), o login só ganha esta casa, sem mudar a senha.
5. **Acompanhar o primeiro envio.**
   - O restaurante sai de "aguardando 1º envio" e passa a "em dia" quando o vigia roda (até 5 minutos depois do envio).
   - Em "Últimos envios", acompanhe a carga inicial, que manda janelas de 7 dias até chegar a hoje.
6. **Conferir os números com o fechamento do SCC** no primeiro dia de operação completo. É o critério nº 1 do piloto: **o faturamento tem que bater centavo a centavo.** Se não bater, anote a diferença e registre em `docs/divida-tecnica.md`.
7. **Primeiro acesso do dono, junto com ele se possível.**
   - Troca de senha.
   - Guia "coloque na tela inicial" no celular dele.
   - Um passeio pelas telas "Hoje" e "Resultados".

Para conferir o que o dono vê, use "Ver o painel do cliente" (só leitura; fica no histórico). Tudo o que o admin faz aparece no cartão "Histórico".
```

e, na tabela "Quando algo dá errado", troque a última linha por `| Precisa reenviar tudo | Correção de conversão ou mudança de fuso | Cartão "Pedir reenvio": data "desde" (até 120 dias). Vai na próxima resposta para o SCC |` e acrescente `| O dono não consegue entrar | Esqueceu a senha ou perdeu a provisória | "Redefinir senha": gera outra provisória e desconecta os aparelhos daquele login |` e `| Cliente em pausa ou inadimplente | — | Cartão "Situação" → "Suspender" (os dados ficam e o SCC continua enviando, D-57) |`. A "Mensagem modelo para a SCC" fica como está (é o texto que o botão copia).

`README.md`, em "Entrar no painel local": o `npm run local:acesso` continua criando as contas de teste; acrescentar o caminho pelo admin (entrar com `admin@repply.local`, cadastrar, gerar o token, rodar `SCC_TOKEN=<token> npm run gerador -- --fuso America/Fortaleza --historico-dias 3 --parar-apos 1`) e o comando que roda o vigia na hora (o mesmo do Passo 2).

`CLAUDE.md` §13: `admin/` deixa de ser "provisório até a etapa 3" e vira "admin da Repply: lista, cadastro, detalhe e edição"; em `components/`, acrescentar `admin/` (lista, cartões, formulários); em `lib/`, acrescentar `admin/` (funções puras, leitura e funções do servidor do admin).

`scripts/acesso-local.ts`: no comentário do topo, trocar "para abrir as telas antes do admin existir (etapa 3)" por "para abrir as telas sem passar pelo admin".

Este plano: marcar os checkboxes e escrever o "Registro da execução" (commits por tarefa, consertos, desvios aceitos, decisões do controlador, conferência no navegador), no modelo da etapa 2.

- [ ] **Passo 4: Revisão final, commit e pedido de envio**

Revisão do conjunto (modelo mais capaz) sobre o intervalo da etapa, com atenção a: toda função de `lib/admin/actions.ts` começa por `exigirAdmin()`; nenhuma senha ou token em log, URL ou histórico; `count !== 1` em toda escrita que deveria mudar uma linha; nenhum `error.message` na tela; formulários com `method="post"` e botão desligado até carregar. Consertos num agente só; verificação completa de novo (`npx tsc --noEmit`, `npm run check`, `npx vitest run`, `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 npm run build`); `git checkout -- AGENTS.md next-env.d.ts`; commit da documentação listando os arquivos; mostrar a lista de commits ao Lucas Ferreira e pedir o ok para enviar ao GitHub.

---

## Critérios de aceite da etapa 3

- [ ] Só o admin abre `/admin` e as páginas abaixo; toda função do servidor do admin recusa quem não é admin sem tocar no banco (teste), e ids que vêm do navegador são conferidos.
- [ ] O banco recusa horário, fuso e CNPJ malformados (pendência 9); o mesmo CNPJ não entra duas vezes; o formulário dá a mesma resposta que o banco (teste de espelho).
- [ ] Lista na ordem de atenção, com contadores, selo do vigia (D-53), último envio no fuso da casa, versão do SCC e etiqueta "suspenso"; estado vazio; cartões no celular e tabela no computador.
- [ ] Cadastro e edição pelo mesmo formulário, com até dois horários por dia (D-56), "Copiar para os outros dias" e pelo menos um dia aberto; mudar o fuso ou a virada recalcula o dia de operação e a tela diz isso.
- [ ] Token: gerado no servidor, guardado só o hash (o mesmo cálculo da recepção, testado), mostrado uma vez, com as instruções para a SCC; troca "agora" ou "em 24 h" numa transação só; revogar; o gerador entra com o token gerado na tela.
- [ ] Login do cliente: criar (senha provisória uma vez, mensagem do WhatsApp, troca obrigatória); e-mail existente só liga a casa; redefinir desconecta os aparelhos; trocar e-mail sem confirmação; avisos de login com mais de uma casa.
- [ ] Pedir reenvio (até 120 dias, nunca no futuro), suspender e reativar (D-57), histórico das ações (D-59) sem senha, token nem e-mail completo.
- [ ] Painel: faixa "só leitura" com "Voltar ao admin", Ajustes do admin com o login do cliente, "abriu o painel" uma vez por hora, "Trocar de casa" para quem tem duas casas ativas (D-58).
- [ ] A sessão do admin não carrega mais todas as casas (pendência 43) e erro de leitura vira a tela de erro, não "acesso pendente" (pendência 27); privilégios explícitos nas tabelas (pendência 14).
- [ ] Celular (390 px) e computador (1280 px), claro e escuro, em todas as telas novas e na faixa; alvos de 44 px; cor nunca sozinha; texto quase-preto sobre laranja; o tomate só no símbolo.
- [ ] Tipos, lint, testes e build limpos; capturas mostradas ao Lucas Ferreira; nada publicado na nuvem; nenhum `git push` sem o ok dele.

---

## Registro da execução

*(Preenchido pelo controlador na Tarefa 8.)*

