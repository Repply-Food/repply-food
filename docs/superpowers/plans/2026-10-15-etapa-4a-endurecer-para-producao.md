# Etapa 4a · Endurecer o código para produção · Plano de implementação

> **Para agentes de execução:** É OBRIGATÓRIO usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para rastreamento.

**Objetivo:** Deixar o login e a configuração local prontos para a nuvem, sem tocar a nuvem: trava de tentativas de senha por e-mail no banco, cookie de sessão sempre seguro em produção por um só lugar, trava no código contra apontar o dev para a nuvem, CSP que bloqueia de verdade, link de "esqueci a senha" à prova de antivírus (POST), tipos de link restritos, registro quando a cota de e-mail estoura e e-mails com a identidade do repply food.

**Arquitetura:** A trava de tentativas é uma tabela nova (`tentativas_de_login`) com três funções `security definer` só para a chave de serviço; `entrarAction` consulta o bloqueio antes de tentar o login, registra o erro de credencial e limpa no sucesso, mantendo os 800 ms de latência mínima. Uma função única de opções de cookie serve `server.ts` e `proxy.ts`. `createServiceClient` ganha uma guarda contra URL de nuvem no desenvolvimento. O link do e-mail passa a cair numa página intermediária que só gasta o token num POST. Os e-mails ganham a marca com logo PNG hospedado. Nada publica na nuvem.

**Stack:** Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript estrito, `@supabase/ssr` 0.10 / `@supabase/supabase-js` 2.117, Postgres 17 local (pg_cron), Vitest 2 + Testing Library, Biome 1.9, Mailpit local em `54324`.

**Desenho aprovado:** [`docs/superpowers/specs/2026-10-15-etapa-4-primeira-publicacao-design.md`](../specs/2026-10-15-etapa-4-primeira-publicacao-design.md) — **a 4a é a §2 inteira (2.1 a 2.10)**. A §3 (4b, publicação na nuvem) **não entra neste plano**; é um roteiro à parte.

## Premissas conferidas no banco local (15/10/2026)

Medidas antes de escrever o plano, em transações desfeitas (nada persistiu; conferido: `tentativas_de_login` e as três funções não existem no banco local depois):

1. **A trava de tentativas funciona como desenhada.** Rascunhei a tabela `tentativas_de_login` e as três funções numa transação e medi: o contador incrementa a cada erro; o bloqueio nasce no 5º erro (`tentativas >= 5`); o recuo cresce (5º erro = 15 min, 6º = 30 min, 7º = 60 min, com `15 min × 2^(tentativas−5)`); `login_bloqueado` devolve o instante quando ele está no futuro e `null` quando já passou; `limpar_tentativas` apaga a linha; o e-mail é normalizado (`lower(btrim(...))`: `"  Dono@Casa.COM "` virou `dono@casa.com`, e `login_bloqueado('DONO@casa.com')` achou a mesma linha). As três funções **nascem fechadas**: `has_function_privilege` deu `anon=false`, `authenticated=false`, `service_role=true`, e a execução real como `authenticated` deu `42501`. Um e-mail que não existe em `auth.users` é contado igual (não vaza se o e-mail é cliente).
2. **O recuo precisa de teto no expoente.** `2^(tentativas−5)` cresceria sem limite e estouraria `int`. O plano capa o expoente em 7 (`least(tentativas−5, 7)` → no máximo `15 min × 128`, cortado por `least(interval '24 hours', …)`). O teto de 24 h já estava no desenho.
3. **A função nova nasce fechada sem esforço, mas o grant é explícito.** Desde `20261013120000_funcoes_nascem_fechadas.sql`, função criada por `postgres` em `public` nasce sem `execute` para `anon`/`authenticated`. Mesmo assim o `revoke … from public, anon, authenticated` + `grant … to service_role` vão na migration, de propósito, como as outras funções privilegiadas (padrão de `20261015120000`).
4. **A trava dev-contra-nuvem não pode disparar na URL local.** `tests/admin/acoes-contra-o-banco.test.ts` usa o `createServiceClient` **real** com `vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321")` (de `tests/helpers/chaves-locais.ts`, `URL_LOCAL`) e `NODE_ENV` de teste. A guarda só pode lançar quando a URL está **preenchida e não é local** e `NODE_ENV !== "production"` e sem `PERMITIR_NUVEM_NO_DEV=1`. URL vazia (`""`) **não** dispara (é o caso "não configurado", que falha em outro lugar). Em produção, nunca lança. Os outros testes que importam `createServiceClient` o mockam (`tests/auth/actions.test.ts`, `tests/admin/acoes-recusam.test.ts`).
5. **O cookie já sai seguro só no `proxy.ts`.** `lib/supabase/proxy.ts` força `secure: true` e `sameSite: options?.sameSite ?? "lax"` em produção, no `setAll`. `lib/supabase/server.ts` repassa as opções cruas do `@supabase/ssr`. O tipo é `CookieOptions = Partial<SerializeOptions>` (campos `secure`, `sameSite`, `httpOnly`, `path`, `maxAge`…), e `CookieMethodsServer.setAll(cookiesToSet, headers)`. A função única de opções centraliza o reforço para os dois.
6. **O GET de `/auth/confirmar` gasta o token hoje.** O `route.ts` atual valida o token num GET (`verifyOtp`/`exchangeCodeForSession`), então o antivírus de e-mail o gastaria antes do dono (dívida 40). O porteiro trata `/auth/` como **prefixo público** (`PREFIXOS_PUBLICOS = ["/auth/"]` em `lib/auth/rotas.ts`) e livre na troca de senha pendente, então o novo subcaminho `/auth/confirmar/validar` já nasce público — **não muda `rotas.ts`**.
7. **Os tipos de link e a cota de e-mail.** O `route.ts` aceita hoje seis tipos (`recovery`, `email`, `magiclink`, `invite`, `email_change`, `signup`) e tem o ramo `code`. O modelo próprio do e-mail usa `token_hash` + `type=recovery` (`supabase/templates/recuperar-senha.html` + `config.toml [auth.email.template.recovery]`), então o ramo `code` sai e a lista fica em `recovery` (e `invite`). Em `pedirNovaSenhaAction`, `over_email_send_rate_limit` vira sucesso em silêncio (sem log).
8. **O PNG do logo existe em `public/`.** `public/icon-192.png` existe (copiado de `identidade-visual/logos/app/icon-192.png`), então o e-mail pode referenciar `{{ .SiteURL }}/icon-192.png` (os clientes de e-mail não renderizam SVG). Cores da marca (CLAUDE.md §8): laranja `#FF5A1F`, quase-preto `#0A0A0A`; **texto sobre laranja é quase-preto** (branco reprova no contraste). O tomate só no símbolo (D-42); o nome escrito é "repply food." com o ponto laranja.
9. **Linha de base.** `receber-envio` responde `405` (cold-start: se não responder, `npx supabase functions serve receber-envio` em segundo plano, **sem** reiniciar o banco); Mailpit responde `200`; 10 migrations de `20261009120000` a `20261015130000` aplicadas no local; `main` com 1 commit à frente de `origin` (o desenho da etapa 4). A contagem exata de testes a Tarefa 0 captura ao vivo.

## Pontos decididos pelo controlador (15/10/2026)

- **A trava degrada com elegância (fail-open).** A trava do banco é a **segunda** camada (o limite do Supabase é a primeira, D-52). Se a RPC falhar (banco fora), `loginBloqueadoAte` devolve `null` (não bloqueia) e `registrarTentativaErrada`/`limparTentativas` engolem o erro depois de `logError` — nunca derrubam nem travam o login (travar por falha seria um auto-DoS).
- **A página intermediária não precisa de JavaScript.** Ela não tem campo sensível digitado (o `token_hash` já veio na URL do e-mail), então o formulário é um `<form method="post">` nativo com botão de enviar — robusto sem JS (é justamente o ponto: o antivírus faz GET e não gasta nada; só o POST do dono gasta). Isto **não** contraria o CLAUDE.md §10 (a regra "botão desligado até hidratar" vale para formulário com dado **sensível digitado**, para não jogá-lo na URL).
- **O ramo `code` sai.** O modelo próprio do e-mail usa `token_hash`; a lista de tipos fica em `recovery` e `invite` (desenho §2.6). Decisão de segurança já aprovada no desenho.
- **Dívida 38 (secure_password_change).** O desenho §2.9 lista para "Resolvidos" os itens 10, 23, 37, 39, 40, 45 e 46, mas a D-63 (§5 do desenho) fecha a **dívida 38** mantendo `secure_password_change = false` (já está assim no `config.toml`; nenhuma mudança de código). O controlador decide na Tarefa 6: mover **também** o 38 para "Resolvidos por decisão (D-63)". É o único ponto onde a lista do §2.9 e as decisões do §5 divergem.
- **A cota de e-mail (dívida 24) é só a parte local.** A 4a registra o código `cota_email_estourada` no log (§2.7); a configuração do Resend/cota na nuvem é 4b. O item 24 continua **aberto** com uma nota de que a parte local está feita.

## Restrições Globais

- **Idioma:** tudo em português do Brasil; domínio em português. Termos técnicos genéricos podem ficar em inglês.
- **Nuvem: proibido nesta etapa.** Nada de `supabase db push`, `--linked`, `functions deploy`, `secrets set`, `config push`, Vercel, DNS nem Resend em produção. A 4a produz software testável e commitado; a publicação é a 4b (roteiro à parte).
- **A chave de serviço só no servidor.** `createServiceClient` e o módulo da trava (`lib/auth/limitador-de-login.ts`) começam por `import "server-only"`; a chave nunca tem prefixo `NEXT_PUBLIC_`.
- **Formulário com senha ou dado sensível digitado:** `method="post"` e botão de enviar desligado até a página carregar (`useHidratado`, `components/forms/use-hidratado.ts`). Não tire `logging.serverFunctions: false` do `next.config.ts`. (A página intermediária de `/auth/confirmar` é exceção justificada: ver "Pontos decididos".)
- **Função nova no banco nasce fechada:** `revoke`/`grant` dados de propósito na migration; função só da chave de serviço entra em `tests/isolamento/rpc-privilegada.test.ts`; função aberta a `authenticated` entra em `tests/isolamento/funcoes-fechadas.test.ts`. Proibido `FORCE ROW LEVEL SECURITY`.
- **Migration só acrescenta.** A migration nova é aplicada **só na Tarefa 1**, com `npx supabase migration up --local`. Migration existente **nunca** é editada. Nunca `supabase db reset`. Nunca `supabase stop`/`start`, com uma única exceção: o controlador pode reiniciar o Supabase local uma vez na Tarefa 6 (Passo 1) se o Mailpit não refletir o modelo/config do e-mail — `stop` + `start`, nunca `reset` (ver o passo). Nunca ler nem imprimir `.env.local`/`.env.nuvem.local`.
- **Zero linhas não é sucesso** em escrita que deveria mudar uma linha.
- **Erro do Supabase nunca vai cru** para a tela nem para o log: a tela recebe frase do produto; o log recebe só o código (`logError`).
- **TypeScript:** nunca `any`. Tipos do banco só por `npm run types`.
- **Interface:** celular primeiro (390 px) e computador (1280 px), claro e escuro. Alvos de toque de pelo menos 44 px no celular. Cor nunca é o único canal. Texto sobre laranja é quase-preto. O tomate só no símbolo (D-42). Nunca rodar `npx shadcn add`.
- **Formatação:** depois de criar ou editar `.ts`/`.tsx`/`.json`/`.css`, rode `npx biome check --write <arquivos>`.
- **Heredoc do Bash come barra invertida nesta máquina:** escreva arquivos com a ferramenta de escrita/edição.
- **`next dev` do Next 16 reescreve `AGENTS.md` e `next-env.d.ts`:** rode `git checkout -- AGENTS.md next-env.d.ts` antes de qualquer `git add`.
- **Painel local:** sempre em `http://127.0.0.1:3000` (o login de `localhost` é outra sessão).
- **Git:** `git fetch` antes de começar e antes de cada commit; conferir se entrou commit do Lucas Duarte. Nunca `git add -A`, `--force`, `--no-verify`; liste os arquivos. Mensagens em PT-BR, no imperativo, terminando com o trailer `Co-Authored-By: <trailer do seu modelo>` (o que a sua ferramenta indicar). **`git push` para o `main` só com o ok do Lucas Ferreira, pedido a cada envio.**
- **Verificação antes de dizer "feito":** `npx tsc --noEmit`, `npm run check`, `npx vitest run`, `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 npm run build`.

## Ordem e paralelismo

```
Tarefa 0 (controlador) → Tarefa 1 (banco) → [Tarefa 2 ‖ Tarefa 3 ‖ Tarefa 4] → verificação do grupo → Tarefa 5 (controlador: CSP) → Tarefa 6 (controlador: Mailpit, docs, fechamento)
```

As Tarefas 2, 3 e 4 rodam **ao mesmo tempo**, na mesma pasta, porque mexem em arquivos diferentes (a lista de cada uma é fechada). Regras para quem roda em paralelo:
- mexa **só** nos arquivos da sua tarefa; ninguém mexe em `package.json`, `package-lock.json`, `next.config.ts`, `app/layout.tsx`, `lib/auth/rotas.ts` nem em migrations;
- **`lib/auth/actions.ts` é só da Tarefa 2; `next.config.ts` é só da Tarefa 5.** Por isso a trava ligada no `entrarAction` (§2.1) e a cota de e-mail no `pedirNovaSenhaAction` (§2.7) ficam na **mesma** tarefa (as duas mexem em `actions.ts` e em `lib/logger.ts`);
- rode os testes **focados** da sua tarefa e `npx biome check` **nos seus arquivos**; `npx tsc --noEmit` pode acusar arquivo de outra frente pela metade: se o erro for só lá, anote e siga;
- no commit, liste só os seus arquivos; se o git disser que o índice está travado (`index.lock`), espere uns segundos e tente de novo;
- a verificação completa (tipos, lint, suíte, build) roda no fim do grupo, pelo controlador.

## Mapa de arquivos

| Arquivo | Tarefa | Responsabilidade |
|---|---|---|
| `supabase/migrations/20261015140000_limitador_de_login.sql` | 1 | Tabela `tentativas_de_login` (RLS, fechada); `registrar_tentativa_errada`, `limpar_tentativas`, `login_bloqueado` (service_role); rotina `rf-limpa-tentativas` |
| `tests/isolamento/limitador-de-login.test.ts` (novo) | 1 | Comportamento das funções da trava |
| `tests/rotinas/limpa-tentativas.test.ts` (novo) | 1 | A rotina do pg_cron existe e o `delete` só apaga linha velha sem bloqueio |
| `tests/isolamento/rpc-privilegada.test.ts`, `tests/isolamento/todas-as-tabelas.test.ts` | 1 | As três funções entram na lista das reservadas; a tabela nova entra no mapa de privilégios |
| `types/database.types.ts` | 1 | Tipos regenerados (`npm run types`) |
| `lib/auth/limitador-de-login.ts` (novo), `lib/auth/actions.ts`, `lib/auth/erros.ts`, `lib/logger.ts` | 2 | Trava ligada no login, frase do bloqueio, cota de e-mail no log |
| `tests/auth/limitador-de-login.test.ts` (novo), `tests/auth/actions.test.ts` | 2 | Testes da trava ligada e da cota |
| `lib/supabase/cookies.ts` (novo), `lib/supabase/server.ts`, `lib/supabase/proxy.ts`, `lib/supabase/service.ts` | 3 | Opções de cookie num lugar só; trava dev-contra-nuvem |
| `tests/supabase/cookies.test.ts` (novo), `tests/supabase/trava-nuvem.test.ts` (novo) | 3 | Testes do cookie seguro e da trava |
| `app/auth/confirmar/page.tsx` (novo), `app/auth/confirmar/validar/route.ts` (novo), `app/auth/confirmar/route.ts` (apagar) | 4 | Página intermediária (GET) e validação do token no POST; tipos de link restritos |
| `supabase/templates/recuperar-senha.html`, `supabase/templates/senha-alterada.html` (novo), `supabase/config.toml` | 4 | E-mails com a marca |
| `tests/auth/confirmar-validar-route.test.ts` (novo), `tests/auth/confirmar-page.test.tsx` (novo), `tests/auth/modelo-de-email.test.ts` (novo), `tests/auth/confirmar-route.test.ts` (apagar) | 4 | Testes do POST, da página e do modelo de e-mail |
| `next.config.ts` | 5 | CSP que bloqueia (depois da conferência no navegador) |
| `docs/**`, `README.md`, `CLAUDE.md`, `.env.example`, este plano | 6 | Documentação, Mailpit, decisões, dívida, fechamento |

---

## Tarefa 0: Preparação (controlador)

**Arquivos:** nenhum (o desenho já está commitado; este plano entra no commit da Tarefa 6).

- [ ] **Passo 1: Conferir o repositório**

```bash
git fetch --all --prune && git status -sb && git log --oneline -5 origin/main
```

Esperado: sem `[behind]`. Commit novo de outra pessoa: ler antes de seguir.

- [ ] **Passo 2: Conferir o banco local, a função e a caixa de e-mail**

```bash
curl --max-time 15 -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:54321/functions/v1/receber-envio
curl --max-time 8 -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:54324
npx supabase migration list --local
```

Esperado: `405`, `200`, e as 10 migrations de `20261009120000` a `20261015130000` aplicadas no local. Se a função não responder `405`: `npx supabase functions serve receber-envio` em segundo plano (**não** reinicie o banco).

- [ ] **Passo 3: Linha de base da suíte**

`npx vitest run` → anote a contagem de arquivos e testes (será a base de comparação no fim). Esperado: tudo verde.

---

## Tarefa 1: Banco da trava de tentativas (migration, rotina, testes e tipos)

**Por quê:** o limite por endereço de internet do Supabase vê o endereço da Vercel, não o de quem tenta (dívida 23, D-52). A trava por e-mail no banco resolve o caso de uma conta atacada sem travar as outras (D-62). No banco, não em memória, que não sobrevive na Vercel.

**Arquivos (lista fechada):**
- Criar: `supabase/migrations/20261015140000_limitador_de_login.sql`, `tests/isolamento/limitador-de-login.test.ts`, `tests/rotinas/limpa-tentativas.test.ts`
- Modificar: `tests/isolamento/rpc-privilegada.test.ts`, `tests/isolamento/todas-as-tabelas.test.ts`, `types/database.types.ts` (só por `npm run types`)

**Interfaces produzidas (a Tarefa 2 usa):**
- Tabela `public.tentativas_de_login (email text primary key, tentativas int not null default 0, bloqueado_ate timestamptz, atualizado_em timestamptz not null default now())`, RLS ligada, sem acesso para `anon`/`authenticated`.
- `public.registrar_tentativa_errada(p_email text) → timestamptz` (só `service_role`): incrementa; a partir de 5 erros marca `bloqueado_ate = now() + 15 min × 2^(min(tentativas−5, 7))`, cortado por 24 h; devolve `bloqueado_ate` (ou `null` se ainda não bloqueou). E-mail normalizado por dentro.
- `public.limpar_tentativas(p_email text) → void` (só `service_role`): apaga a linha do e-mail normalizado.
- `public.login_bloqueado(p_email text) → timestamptz` (só `service_role`): devolve `bloqueado_ate` se estiver no futuro, senão `null`.
- Rotina pg_cron `rf-limpa-tentativas` (diária, `15 5 * * *`): apaga linhas sem bloqueio vigente e sem atividade há mais de 24 h.
- Tipos: `Database["public"]["Tables"]["tentativas_de_login"]`, `Database["public"]["Functions"]["registrar_tentativa_errada" | "limpar_tentativas" | "login_bloqueado"]`.

- [ ] **Passo 1: Escrever a migration**

Crie `supabase/migrations/20261015140000_limitador_de_login.sql`:

```sql
-- Etapa 4a · Trava de tentativas de senha por e-mail (D-62, dívida 23)
--
-- Segunda camada além do limite do Supabase Auth (D-52), que na Vercel vê o
-- endereço do servidor, não o de quem tenta. A trava é por e-mail e no banco
-- (não em memória, que não sobrevive na Vercel). Só a chave de serviço executa:
-- entrarAction (lib/auth/actions.ts) consulta login_bloqueado ANTES de tentar o
-- login, registra o erro de credencial e limpa no sucesso. As funções operam
-- sobre a string do e-mail, exista ele ou não, para não revelar quem é cliente.
--
-- Regras: nada de FORCE ROW LEVEL SECURITY; função nova nasce fechada e o grant
-- vai aqui, de propósito.
begin;

create table public.tentativas_de_login (
  email         text primary key,
  tentativas    int not null default 0,
  bloqueado_ate timestamptz,
  atualizado_em timestamptz not null default now()
);

comment on table public.tentativas_de_login is
  'Trava de tentativas de senha por e-mail (D-62). Só a chave de serviço lê e escreve, pelas funções registrar_tentativa_errada, limpar_tentativas e login_bloqueado. Sem RLS para cliente nem admin.';

alter table public.tentativas_de_login enable row level security;
-- Ninguém com login (nem sem) toca na tabela: só a chave de serviço, pelas
-- funções abaixo. auto_expose do Supabase concede tudo em tabela nova: revogar.
revoke all on public.tentativas_de_login from anon, authenticated;

-- Incrementa; a partir de 5 erros, bloqueia por uma janela que cresce (15 min,
-- 30, 60, …), com o expoente capado em 7 (sem estourar int) e teto de 24 h.
create function public.registrar_tentativa_errada(p_email text)
returns timestamptz
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  c_limite  constant int := 5;
  c_janela  constant interval := interval '15 minutes';
  c_teto    constant interval := interval '24 hours';
  v_email   text := lower(btrim(p_email));
  v_qtd     int;
  v_bloqueio timestamptz;
begin
  if v_email is null or v_email = '' then
    return null;
  end if;
  insert into public.tentativas_de_login (email, tentativas, atualizado_em)
    values (v_email, 1, now())
  on conflict (email) do update
    set tentativas = public.tentativas_de_login.tentativas + 1,
        atualizado_em = now()
  returning tentativas into v_qtd;

  if v_qtd >= c_limite then
    v_bloqueio := now() + least(c_teto, c_janela * (2 ^ least(v_qtd - c_limite, 7))::int);
    update public.tentativas_de_login
       set bloqueado_ate = v_bloqueio
     where email = v_email;
  end if;
  return v_bloqueio;
end;
$$;

-- Login certo: zera a contagem apagando a linha.
create function public.limpar_tentativas(p_email text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  delete from public.tentativas_de_login where email = lower(btrim(p_email));
end;
$$;

-- Até quando está bloqueado (null se não estiver).
create function public.login_bloqueado(p_email text)
returns timestamptz
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select bloqueado_ate
    from public.tentativas_de_login
   where email = lower(btrim(p_email))
     and bloqueado_ate is not null
     and bloqueado_ate > now();
$$;

revoke execute on function public.registrar_tentativa_errada(text) from public, anon, authenticated;
revoke execute on function public.limpar_tentativas(text) from public, anon, authenticated;
revoke execute on function public.login_bloqueado(text) from public, anon, authenticated;
grant execute on function public.registrar_tentativa_errada(text) to service_role;
grant execute on function public.limpar_tentativas(text) to service_role;
grant execute on function public.login_bloqueado(text) to service_role;

-- Rotina diária: apaga linha sem bloqueio vigente e sem atividade há mais de
-- 24 h (não acumula e-mails para sempre). Mesmo padrão de instala_rotinas.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'rf-limpa-tentativas') then
    perform cron.unschedule('rf-limpa-tentativas');
  end if;
  perform cron.schedule('rf-limpa-tentativas', '15 5 * * *', $limpa$
    delete from public.tentativas_de_login
     where (bloqueado_ate is null or bloqueado_ate < now())
       and atualizado_em < now() - interval '24 hours';
  $limpa$);
end;
$$;

commit;
```

- [ ] **Passo 2: Aplicar a migration no banco local**

```bash
npx supabase migration up --local
npx supabase migration list --local
```

Esperado: `20261015140000` aplicada; a lista mostra 11 migrations.

- [ ] **Passo 3: Teste de comportamento da trava (escreva e rode)**

Crie `tests/isolamento/limitador-de-login.test.ts`:

```ts
// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conectarBanco } from "../helpers/supabase-local";

/** Cada teste usa um e-mail único e apaga a própria linha no fim. */
describe("trava de tentativas por e-mail", () => {
  let banco: Client;

  beforeAll(async () => {
    banco = await conectarBanco();
  });
  afterAll(async () => {
    await banco?.end();
  });

  async function emTransacao<T>(executar: () => Promise<T>): Promise<T> {
    await banco.query("begin");
    try {
      return await executar();
    } finally {
      await banco.query("rollback");
    }
  }

  it("bloqueia só a partir do 5º erro e o recuo cresce", async () => {
    await emTransacao(async () => {
      const email = `a-${randomUUID()}@teste.local`;
      const bloqueios: (string | null)[] = [];
      for (let i = 0; i < 7; i++) {
        const r = await banco.query<{ b: string | null }>(
          "select public.registrar_tentativa_errada($1) as b",
          [email]
        );
        bloqueios.push(r.rows[0].b);
      }
      expect(bloqueios.slice(0, 4).every((b) => b === null)).toBe(true);
      expect(bloqueios[4]).not.toBeNull();
      const minutos = await banco.query<{ m: string }>(
        "select round(extract(epoch from (bloqueado_ate - now()))/60)::text as m from public.tentativas_de_login where email = $1",
        [email]
      );
      // 7º erro: 15 min × 2^(7−5) = 60 min.
      expect(minutos.rows[0].m).toBe("60");
    });
  });

  it("normaliza o e-mail (espaço e maiúsculas)", async () => {
    await emTransacao(async () => {
      const base = `b-${randomUUID()}@teste.local`;
      for (let i = 0; i < 5; i++) {
        await banco.query("select public.registrar_tentativa_errada($1)", [
          `  ${base.toUpperCase()} `,
        ]);
      }
      const r = await banco.query<{ b: string | null }>(
        "select public.login_bloqueado($1) as b",
        [base]
      );
      expect(r.rows[0].b).not.toBeNull();
    });
  });

  it("login_bloqueado devolve null quando o bloqueio já passou", async () => {
    await emTransacao(async () => {
      const email = `c-${randomUUID()}@teste.local`;
      for (let i = 0; i < 5; i++) {
        await banco.query("select public.registrar_tentativa_errada($1)", [email]);
      }
      await banco.query(
        "update public.tentativas_de_login set bloqueado_ate = now() - interval '1 minute' where email = $1",
        [email]
      );
      const r = await banco.query<{ b: string | null }>(
        "select public.login_bloqueado($1) as b",
        [email]
      );
      expect(r.rows[0].b).toBeNull();
    });
  });

  it("limpar_tentativas zera a contagem", async () => {
    await emTransacao(async () => {
      const email = `d-${randomUUID()}@teste.local`;
      for (let i = 0; i < 5; i++) {
        await banco.query("select public.registrar_tentativa_errada($1)", [email]);
      }
      await banco.query("select public.limpar_tentativas($1)", [email]);
      const r = await banco.query<{ n: string }>(
        "select count(*)::int::text as n from public.tentativas_de_login where email = $1",
        [email]
      );
      expect(r.rows[0].n).toBe("0");
    });
  });

  it("e-mail que não existe em auth.users é contado igual (não vaza)", async () => {
    await emTransacao(async () => {
      const email = `nao-existe-${randomUUID()}@nada.local`;
      const r = await banco.query<{ b: string | null }>(
        "select public.registrar_tentativa_errada($1) as b",
        [email]
      );
      expect(r.rows[0].b).toBeNull();
      const q = await banco.query<{ t: number }>(
        "select tentativas as t from public.tentativas_de_login where email = $1",
        [email]
      );
      expect(q.rows[0].t).toBe(1);
    });
  });
});
```

Rode: `npx vitest run tests/isolamento/limitador-de-login.test.ts` → Esperado: 5 passam.

- [ ] **Passo 4: Teste da rotina de limpeza (escreva e rode)**

Crie `tests/rotinas/limpa-tentativas.test.ts`:

```ts
// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conectarBanco } from "../helpers/supabase-local";

const SQL_LIMPA = `
  delete from public.tentativas_de_login
   where (bloqueado_ate is null or bloqueado_ate < now())
     and atualizado_em < now() - interval '24 hours'`;

describe("rotina rf-limpa-tentativas", () => {
  let banco: Client;
  beforeAll(async () => {
    banco = await conectarBanco();
  });
  afterAll(async () => {
    await banco?.end();
  });

  it("a rotina está registrada no pg_cron", async () => {
    const r = await banco.query<{ schedule: string }>(
      "select schedule from cron.job where jobname = 'rf-limpa-tentativas'"
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].schedule).toBe("15 5 * * *");
  });

  it("apaga só a linha velha sem bloqueio vigente", async () => {
    await banco.query("begin");
    try {
      const velho = `v-${randomUUID()}@t.local`;
      const recente = `r-${randomUUID()}@t.local`;
      const bloqueado = `b-${randomUUID()}@t.local`;
      await banco.query(
        `insert into public.tentativas_de_login (email, tentativas, bloqueado_ate, atualizado_em) values
           ($1, 3, null, now() - interval '48 hours'),
           ($2, 1, null, now()),
           ($3, 9, now() + interval '1 hour', now() - interval '48 hours')`,
        [velho, recente, bloqueado]
      );
      await banco.query(SQL_LIMPA);
      const r = await banco.query<{ email: string }>(
        "select email from public.tentativas_de_login where email = any($1::text[]) order by 1",
        [[velho, recente, bloqueado]]
      );
      expect(r.rows.map((x) => x.email).sort()).toEqual([bloqueado, recente].sort());
    } finally {
      await banco.query("rollback");
    }
  });
});
```

Rode: `npx vitest run tests/rotinas/limpa-tentativas.test.ts` → Esperado: 2 passam.

- [ ] **Passo 5: Pôr as três funções na lista das reservadas**

Em `tests/isolamento/rpc-privilegada.test.ts`, acrescente ao array `funcoesReservadas`:

```ts
  "public.registrar_tentativa_errada(text)",
  "public.limpar_tentativas(text)",
  "public.login_bloqueado(text)",
```

e ao array `chamadas` do teste "recusa execução real":

```ts
  "select public.registrar_tentativa_errada(null::text)",
  "select public.limpar_tentativas(null::text)",
  "select public.login_bloqueado(null::text)",
```

Rode: `npx vitest run tests/isolamento/rpc-privilegada.test.ts` → Esperado: verde (anon/authenticated recebem `42501`; `service_role` executa).

- [ ] **Passo 6: Pôr a tabela nova no mapa de privilégios**

Em `tests/isolamento/todas-as-tabelas.test.ts`, no objeto `PRIVILEGIOS`, acrescente a linha (em ordem alfabética, perto de `sinal_de_vida`):

```ts
    tentativas_de_login: { anon: [], authenticated: [] },
```

Rode: `npx vitest run tests/isolamento/todas-as-tabelas.test.ts` → Esperado: verde (a tabela nova não tem privilégio nenhum para `anon` nem `authenticated`).

- [ ] **Passo 7: Regenerar os tipos**

```bash
npm run types
git diff --stat types/database.types.ts
```

Esperado: `types/database.types.ts` ganha a tabela `tentativas_de_login` e as três funções. Rode `npx tsc --noEmit` → 0 erros.

- [ ] **Passo 8: Commit**

```bash
git fetch && git status --short
git checkout -- AGENTS.md next-env.d.ts 2>/dev/null || true
git add supabase/migrations/20261015140000_limitador_de_login.sql tests/isolamento/limitador-de-login.test.ts tests/rotinas/limpa-tentativas.test.ts tests/isolamento/rpc-privilegada.test.ts tests/isolamento/todas-as-tabelas.test.ts types/database.types.ts
git commit -m "Cria a trava de tentativas de login por e-mail no banco (D-62)"
```

---

## Tarefa 2: Trava ligada no login e cota de e-mail no log *(paralela às Tarefas 3 e 4)*

**Por quê:** `entrarAction` passa a consultar a trava antes de falar com o Supabase, registrar o erro de credencial e limpar no sucesso (§2.1, D-62); `pedirNovaSenhaAction` passa a registrar quando a cota de e-mail estoura em silêncio (§2.7, dívida 24, parte local). As duas vivem em `lib/auth/actions.ts`, por isso na mesma tarefa.

**Arquivos (lista fechada):**
- Criar: `lib/auth/limitador-de-login.ts`, `tests/auth/limitador-de-login.test.ts`
- Modificar: `lib/auth/actions.ts`, `lib/auth/erros.ts`, `lib/logger.ts`, `tests/auth/actions.test.ts`

**Interfaces consumidas:** Tarefa 1 (as três funções e os tipos do banco). Do código existente: `createServiceClient` (`@/lib/supabase/service`), `logError` (`@/lib/logger`), `MENSAGEM_LOGIN_RECUSADO`/`credencialRecusada`/`mensagemDoErroDeAuth` (`@/lib/auth/erros`).

**Interfaces produzidas:**
- `@/lib/auth/limitador-de-login` (só servidor): `loginBloqueadoAte(email: string): Promise<Date | null>`; `registrarTentativaErrada(email: string): Promise<void>`; `limparTentativas(email: string): Promise<void>`. Falha de RPC nunca lança (fail-open): `loginBloqueadoAte` devolve `null`; as outras duas registram `logError("falha_limitador_login")` e seguem.
- `@/lib/auth/erros`: `MENSAGEM_LOGIN_BLOQUEADO = "Muitas tentativas. Tente de novo em alguns minutos."`.
- `@/lib/logger`: novos códigos `cota_email_estourada` e `falha_limitador_login`.

- [ ] **Passo 1: Teste da trava ligada e da cota (escreva; vai falhar)**

Em `tests/auth/actions.test.ts`, acrescente ao bloco `vi.hoisted` os dublês da trava e o mock do módulo:

```ts
// dentro do objeto de vi.hoisted:
  loginBloqueadoAte: vi.fn(),
  registrarTentativaErrada: vi.fn(),
  limparTentativas: vi.fn(),
```

```ts
vi.mock("@/lib/auth/limitador-de-login", () => ({
  loginBloqueadoAte,
  registrarTentativaErrada,
  limparTentativas,
}));
```

No `beforeEach`, os padrões "não bloqueado":

```ts
  loginBloqueadoAte.mockResolvedValue(null);
  registrarTentativaErrada.mockResolvedValue(undefined);
  limparTentativas.mockResolvedValue(undefined);
```

E acrescente os casos (importe `MENSAGEM_LOGIN_BLOQUEADO` de `@/lib/auth/erros`):

```ts
describe("a trava de tentativas protege o login (D-62)", () => {
  const dados = { email: "dono@casa.com", senha: "qualquer-123" };
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("bloqueado: devolve a frase do produto e NÃO fala com o Supabase", async () => {
    loginBloqueadoAte.mockResolvedValue(new Date(Date.now() + 60_000));
    const resultado = await semEspera(entrarAction(dados));
    expect(resultado).toEqual({ ok: false, error: MENSAGEM_LOGIN_BLOQUEADO });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(registrarTentativaErrada).not.toHaveBeenCalled();
  });

  it("credencial errada registra a tentativa e mostra 'incorretos'", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials" },
    });
    const resultado = await semEspera(entrarAction(dados));
    expect(resultado).toEqual({ ok: false, error: MENSAGEM_LOGIN_RECUSADO });
    expect(registrarTentativaErrada).toHaveBeenCalledWith(dados.email);
  });

  it("falha de infraestrutura NÃO conta como tentativa errada", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "unexpected_failure" },
    });
    await semEspera(entrarAction(dados));
    expect(registrarTentativaErrada).not.toHaveBeenCalled();
  });

  it("login certo limpa a contagem", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: donoSemTroca },
      error: null,
    });
    const resultado = await semEspera(entrarAction(dados));
    expect(resultado.ok).toBe(true);
    expect(limparTentativas).toHaveBeenCalledWith(dados.email);
  });
});

describe("cota de e-mail estourada é registrada (dívida 24, parte local)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPasswordForEmail.mockResolvedValue({
      error: { code: "over_email_send_rate_limit" },
    });
  });

  it("registra o código e mantém a resposta de sucesso", async () => {
    const resultado = await semEspera(
      pedirNovaSenhaAction({ email: "dono@casa.com" })
    );
    expect(resultado).toEqual({ ok: true });
    expect(logError).toHaveBeenCalledWith("cota_email_estourada");
  });
});
```

Rode: `npx vitest run tests/auth/actions.test.ts` → Esperado: FALHA (`@/lib/auth/limitador-de-login` não existe; `MENSAGEM_LOGIN_BLOQUEADO` não existe; `cota_email_estourada` não é registrada).

- [ ] **Passo 2: Criar o módulo da trava**

Crie `lib/auth/limitador-de-login.ts`:

```ts
import "server-only";
import { logError } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Trava de tentativas de senha por e-mail (D-62), segunda camada além do limite
 * do Supabase (D-52). Usa a chave de serviço. Fail-open de propósito: se o banco
 * falhar, o login não trava (travar por falha seria um auto-DoS); o limite do
 * Supabase continua valendo.
 */
export async function loginBloqueadoAte(email: string): Promise<Date | null> {
  const { data, error } = await createServiceClient().rpc("login_bloqueado", {
    p_email: email,
  });
  if (error) {
    logError("falha_limitador_login");
    return null;
  }
  return data ? new Date(data) : null;
}

export async function registrarTentativaErrada(email: string): Promise<void> {
  const { error } = await createServiceClient().rpc(
    "registrar_tentativa_errada",
    { p_email: email }
  );
  if (error) logError("falha_limitador_login");
}

export async function limparTentativas(email: string): Promise<void> {
  const { error } = await createServiceClient().rpc("limpar_tentativas", {
    p_email: email,
  });
  if (error) logError("falha_limitador_login");
}
```

- [ ] **Passo 3: Frase do bloqueio e códigos de log**

Em `lib/auth/erros.ts`, acrescente ao lado de `MENSAGEM_LOGIN_RECUSADO`:

```ts
export const MENSAGEM_LOGIN_BLOQUEADO =
  "Muitas tentativas. Tente de novo em alguns minutos.";
```

Em `lib/logger.ts`, acrescente ao array `codigosErro`:

```ts
  "cota_email_estourada",
  "falha_limitador_login",
```

- [ ] **Passo 4: Ligar a trava no `entrarAction` e a cota no `pedirNovaSenhaAction`**

Em `lib/auth/actions.ts`, importe:

```ts
import {
  limparTentativas,
  loginBloqueadoAte,
  registrarTentativaErrada,
} from "./limitador-de-login";
```

e adicione `MENSAGEM_LOGIN_BLOQUEADO` ao import de `./erros`.

Troque o corpo de `entrarAction` (depois do `safeParse`) por este fluxo (a trava **antes** do Supabase; registra na credencial recusada; limpa no sucesso; os 800 ms continuam):

```ts
  const supabase = await createClient();
  // Trava por e-mail ANTES de falar com o Supabase: não denuncia se o e-mail
  // existe, e a resposta não depende do login.
  if (await loginBloqueadoAte(dados.data.email)) {
    await segurarLatencia(inicio);
    return { ok: false, error: MENSAGEM_LOGIN_BLOQUEADO };
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
  });
  if (error || !data.user) {
    // Só credencial recusada conta como tentativa: limite e queda não.
    if (credencialRecusada(error)) {
      await registrarTentativaErrada(dados.data.email);
    }
    await segurarLatencia(inicio);
    return {
      ok: false,
      error: credencialRecusada(error)
        ? MENSAGEM_LOGIN_RECUSADO
        : mensagemDoErroDeAuth(error),
    };
  }
  await limparTentativas(dados.data.email);
  const destino = await destinoDe(
    supabase,
    data.user.id,
    precisaTrocarSenha(data.user)
  );
  await segurarLatencia(inicio);
  return { ok: true, data: { destino } };
```

Em `pedirNovaSenhaAction`, troque a linha do `over_email_send_rate_limit` por:

```ts
  if (error?.code === "over_email_send_rate_limit") {
    logError("cota_email_estourada");
    return { ok: true };
  }
```

(importe `logError` de `@/lib/logger` no topo, se ainda não estiver importado).

- [ ] **Passo 5: Rodar os testes focados**

```bash
npx vitest run tests/auth/actions.test.ts
npx biome check --write lib/auth/limitador-de-login.ts lib/auth/actions.ts lib/auth/erros.ts lib/logger.ts tests/auth/actions.test.ts
```

Esperado: `actions.test.ts` verde (os casos antigos de limite por endereço, `over_request_rate_limit`, continuam passando: eles não passam por `credencialRecusada`).

- [ ] **Passo 6: Teste do módulo da trava (fail-open)**

Crie `tests/auth/limitador-de-login.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, logError } = vi.hoisted(() => ({
  rpc: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logError }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc }),
}));

import {
  limparTentativas,
  loginBloqueadoAte,
  registrarTentativaErrada,
} from "@/lib/auth/limitador-de-login";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a trava usa a chave de serviço e degrada com elegância", () => {
  it("loginBloqueadoAte devolve Date quando bloqueado", async () => {
    const quando = "2026-10-15T20:00:00.000Z";
    rpc.mockResolvedValue({ data: quando, error: null });
    expect(await loginBloqueadoAte("x@y.com")).toEqual(new Date(quando));
    expect(rpc).toHaveBeenCalledWith("login_bloqueado", { p_email: "x@y.com" });
  });

  it("loginBloqueadoAte devolve null quando não bloqueado", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await loginBloqueadoAte("x@y.com")).toBeNull();
  });

  it("falha de RPC não bloqueia o login (fail-open) e registra o código", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "08006" } });
    expect(await loginBloqueadoAte("x@y.com")).toBeNull();
    expect(logError).toHaveBeenCalledWith("falha_limitador_login");
  });

  it("registrar e limpar engolem o erro depois de registrar", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "08006" } });
    await expect(registrarTentativaErrada("x@y.com")).resolves.toBeUndefined();
    await expect(limparTentativas("x@y.com")).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith("falha_limitador_login");
    expect(logError).toHaveBeenCalledTimes(2);
  });
});
```

Rode: `npx vitest run tests/auth/limitador-de-login.test.ts` → Esperado: 4 passam.

- [ ] **Passo 7: Commit**

```bash
git fetch && git status --short
git checkout -- AGENTS.md next-env.d.ts 2>/dev/null || true
git add lib/auth/limitador-de-login.ts lib/auth/actions.ts lib/auth/erros.ts lib/logger.ts tests/auth/limitador-de-login.test.ts tests/auth/actions.test.ts
git commit -m "Liga a trava de tentativas no login e registra a cota de e-mail estourada"
```

---

## Tarefa 3: Cookie seguro num lugar só e trava dev-contra-nuvem *(paralela às Tarefas 2 e 4)*

**Por quê:** hoje o cookie nasce com `Secure` no `proxy.ts`, mas sem `Secure` no `server.ts` (login e `/auth/confirmar`): o mesmo cookie sai com regras diferentes conforme o caminho (dívida 37). E o dev não tem trava no código contra apontar para a nuvem com a chave de serviço (dívida 10).

**Arquivos (lista fechada):**
- Criar: `lib/supabase/cookies.ts`, `tests/supabase/cookies.test.ts`, `tests/supabase/trava-nuvem.test.ts`
- Modificar: `lib/supabase/server.ts`, `lib/supabase/proxy.ts`, `lib/supabase/service.ts`

**Interfaces consumidas:** nenhuma das outras tarefas. Do pacote `@supabase/ssr`: `CookieOptions` (`Partial<SerializeOptions>`), `CookieMethodsServer.setAll`.

**Interfaces produzidas (uso interno de `lib/supabase`):**
- `@/lib/supabase/cookies`: `EM_PRODUCAO: boolean`; `opcoesDeCookieSeguro(options: CookieOptions | undefined, emProducao?: boolean): CookieOptions` — em produção força `secure: true` e `sameSite` padrão `"lax"`; fora de produção devolve as opções como vieram (o login local é `http`).
- `@/lib/supabase/service`: `urlLocalDoSupabase(url: string): boolean` — `true` para `127.0.0.1`, `localhost`, `[::1]` e nomes `.localhost`/`.test`.

- [ ] **Passo 1: Teste do cookie seguro (escreva; vai falhar)**

Crie `tests/supabase/cookies.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { opcoesDeCookieSeguro } from "@/lib/supabase/cookies";

describe("opções de cookie num lugar só (dívida 37)", () => {
  it("em produção força secure e sameSite lax quando não vier", () => {
    expect(opcoesDeCookieSeguro({ path: "/" }, true)).toEqual({
      path: "/",
      secure: true,
      sameSite: "lax",
    });
  });

  it("em produção respeita um sameSite já escolhido", () => {
    expect(opcoesDeCookieSeguro({ sameSite: "strict" }, true)).toEqual({
      secure: true,
      sameSite: "strict",
    });
  });

  it("fora de produção não força secure (o login local é http)", () => {
    expect(opcoesDeCookieSeguro({ path: "/" }, false)).toEqual({ path: "/" });
  });

  it("opções indefinidas não quebram", () => {
    expect(opcoesDeCookieSeguro(undefined, true)).toEqual({
      secure: true,
      sameSite: "lax",
    });
  });
});
```

Rode: `npx vitest run tests/supabase/cookies.test.ts` → Esperado: FALHA (módulo não existe).

- [ ] **Passo 2: Criar a função única de opções**

Crie `lib/supabase/cookies.ts`:

```ts
import type { CookieOptions } from "@supabase/ssr";

export const EM_PRODUCAO = process.env.NODE_ENV === "production";

/**
 * Opções de cookie de sessão num lugar só (dívida 37). Em produção todo cookie
 * sai com `Secure` e `SameSite=Lax` (a menos que o chamador já tenha escolhido
 * outro `sameSite`). Fora de produção, as opções vão como vieram: o login local
 * roda em http e um cookie `Secure` nunca chegaria.
 */
export function opcoesDeCookieSeguro(
  options: CookieOptions | undefined,
  emProducao: boolean = EM_PRODUCAO
): CookieOptions {
  if (!emProducao) return options ?? {};
  return { ...options, secure: true, sameSite: options?.sameSite ?? "lax" };
}
```

- [ ] **Passo 3: Usar a função no `server.ts` e no `proxy.ts`**

Em `lib/supabase/server.ts`, troque o `setAll` para reforçar as opções:

```ts
import { opcoesDeCookieSeguro } from "./cookies";
// ...
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, opcoesDeCookieSeguro(options));
            }
          } catch {
            // Chamado num Server Component (que não grava cookie): o proxy renova a sessão.
          }
        },
```

Em `lib/supabase/proxy.ts`, troque o bloco que montava as opções à mão por `opcoesDeCookieSeguro(options)` e apague o `const EM_PRODUCAO` local (o `opcoesDeCookieSeguro` já resolve produção por dentro; **não** importe `EM_PRODUCAO`, senão fica um import não usado que o Biome e o tsc reprovam). Importe só `opcoesDeCookieSeguro` de `./cookies`:

```ts
import { opcoesDeCookieSeguro } from "./cookies";
// ...
          for (const { name, value, options } of cookiesToSet) {
            resposta.cookies.set(name, value, opcoesDeCookieSeguro(options));
          }
```

(mantenha o `for` que repassa os `cabecalhos` de cache logo abaixo).

Rode: `npx vitest run tests/supabase/cookies.test.ts tests/auth/proxy.test.ts` → Esperado: verde.

- [ ] **Passo 4: Teste da trava dev-contra-nuvem (escreva; vai falhar)**

Crie `tests/supabase/trava-nuvem.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createServiceClient,
  urlLocalDoSupabase,
} from "@/lib/supabase/service";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("urlLocalDoSupabase", () => {
  it.each([
    ["http://127.0.0.1:54321", true],
    ["http://localhost:54321", true],
    ["http://[::1]:54321", true],
    ["https://abc.supabase.co", false],
    ["https://food.repplyhub.com.br", false],
  ])("%s é local? %s", (url, esperado) => {
    expect(urlLocalDoSupabase(url)).toBe(esperado);
  });
});

describe("trava dev-contra-nuvem (dívida 10)", () => {
  it("em dev, URL de nuvem sem a liberação lança", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    vi.stubEnv("PERMITIR_NUVEM_NO_DEV", "");
    expect(() => createServiceClient()).toThrow(/nuvem/i);
  });

  it("em dev, URL de nuvem COM a liberação passa", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    vi.stubEnv("PERMITIR_NUVEM_NO_DEV", "1");
    expect(() => createServiceClient()).not.toThrow();
  });

  it("em dev, URL local passa (os testes de integração usam 127.0.0.1)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    expect(() => createServiceClient()).not.toThrow();
  });

  it("em produção nunca lança, seja qual for a URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    vi.stubEnv("PERMITIR_NUVEM_NO_DEV", "");
    expect(() => createServiceClient()).not.toThrow();
  });
});
```

Rode: `npx vitest run tests/supabase/trava-nuvem.test.ts` → Esperado: FALHA (`urlLocalDoSupabase` não existe; não lança).

- [ ] **Passo 5: Escrever a trava no `service.ts`**

Reescreva `lib/supabase/service.ts`:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.types";

/** `true` para 127.0.0.1, localhost, [::1] e nomes .localhost/.test. */
export function urlLocalDoSupabase(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return (
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "::1" ||
      host.endsWith(".localhost") ||
      host.endsWith(".test")
    );
  } catch {
    return false;
  }
}

/**
 * Cliente com service role. Usar APENAS no servidor ou em Edge Functions.
 * Nunca expor ao client (nunca importar em componentes cliente).
 *
 * Trava dev-contra-nuvem (dívida 10): fora de produção, apontar a chave de
 * serviço para uma URL que não é local é quase sempre engano (dado real, banco
 * da nuvem, rodando em dev). Lança, a menos que PERMITIR_NUVEM_NO_DEV=1 diga que
 * é de propósito. URL vazia não dispara (é o caso "não configurado"). Em
 * produção nunca lança.
 */
export function createServiceClient() {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (
    process.env.NODE_ENV !== "production" &&
    url !== "" &&
    !urlLocalDoSupabase(url) &&
    process.env.PERMITIR_NUVEM_NO_DEV !== "1"
  ) {
    throw new Error(
      "A chave de serviço está apontando para uma URL de nuvem fora de produção. " +
        "Use o banco local, ou defina PERMITIR_NUVEM_NO_DEV=1 se for de propósito."
    );
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
```

- [ ] **Passo 6: Rodar os testes focados e os que usam o service real**

```bash
npx vitest run tests/supabase/trava-nuvem.test.ts tests/admin/acoes-contra-o-banco.test.ts
npx biome check --write lib/supabase/cookies.ts lib/supabase/server.ts lib/supabase/proxy.ts lib/supabase/service.ts tests/supabase/cookies.test.ts tests/supabase/trava-nuvem.test.ts
```

Esperado: verde. `acoes-contra-o-banco` usa o `createServiceClient` real com `URL_LOCAL` (`http://127.0.0.1:54321`): a trava não dispara.

- [ ] **Passo 7: Commit**

```bash
git fetch && git status --short
git checkout -- AGENTS.md next-env.d.ts 2>/dev/null || true
git add lib/supabase/cookies.ts lib/supabase/server.ts lib/supabase/proxy.ts lib/supabase/service.ts tests/supabase/cookies.test.ts tests/supabase/trava-nuvem.test.ts
git commit -m "Centraliza as opções de cookie seguro e trava o dev contra a nuvem"
```

---

## Tarefa 4: Link à prova de antivírus, tipos de link e e-mails com a marca *(paralela às Tarefas 2 e 3)*

**Por quê:** o antivírus de e-mail corporativo abre o link e gastaria o token no GET (dívida 40); `/auth/confirmar` aceita seis tipos de link (dívida 39); e os e-mails não têm a cara do repply food. (§2.8). O link passa a cair numa página com um botão que faz POST — só o POST gasta o token — e os e-mails ganham a marca.

**Arquivos (lista fechada):**
- Criar: `app/auth/confirmar/page.tsx`, `app/auth/confirmar/validar/route.ts`, `supabase/templates/senha-alterada.html`, `tests/auth/confirmar-validar-route.test.ts`, `tests/auth/confirmar-page.test.tsx`, `tests/auth/modelo-de-email.test.ts`
- Modificar: `supabase/templates/recuperar-senha.html`, `supabase/config.toml`
- Apagar: `app/auth/confirmar/route.ts`, `tests/auth/confirmar-route.test.ts`

**Interfaces consumidas:** do código existente: `safeNextOr` (`@/lib/auth/safe-next`), `CAMINHO_COOKIE_RECUPERACAO`/`COOKIE_RECUPERACAO`/`criarCookieRecuperacao` (`@/lib/auth/cookie-recuperacao`), `createClient` (`@/lib/supabase/server`). O POST monta o redirecionamento 303 por conta própria (`redirecionar303`, local nesta rota), para a resposta do POST virar GET no destino; não reaproveita `redirecionarRelativo` (307, de outras rotas). O porteiro já trata `/auth/` como prefixo público (não muda `lib/auth/rotas.ts`).

**Interfaces produzidas:**
- Rota `GET /auth/confirmar` (página): mostra "Criar minha senha nova" num `<form method="post" action="/auth/confirmar/validar">` com `token_hash`, `type` e `next` em campos ocultos; se faltar `token_hash` ou o `type` não estiver na lista (`recovery`, `invite`), mostra "link inválido" com link para `/entrar`. **Não gasta o token.**
- Rota `POST /auth/confirmar/validar`: lê `token_hash`/`type`/`next` do corpo; recusa `type` fora da lista; se já houver sessão, vai para `/entrar?erro=sessao_aberta`; valida o token (`verifyOtp`); no erro vai para `/entrar?erro=link_invalido`; no sucesso entrega o cookie de recuperação (se `next` começar por `/nova-senha`) e redireciona (303) para `safeNextOr(next, "/")`. **Só o POST gasta o token.** Sem o ramo `code` (dívida 39).

- [ ] **Passo 1: Teste do POST de validação (escreva; vai falhar)**

Crie `tests/auth/confirmar-validar-route.test.ts` (adaptado de `confirmar-route.test.ts`, agora POST com `FormData`):

```ts
// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, verifyOtp, createClient } = vi.hoisted(() => {
  const getUser = vi.fn();
  const verifyOtp = vi.fn();
  return {
    getUser,
    verifyOtp,
    createClient: vi.fn(async () => ({ auth: { getUser, verifyOtp } })),
  };
});
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { POST } from "@/app/auth/confirmar/validar/route";

const ORIGEM = "http://127.0.0.1:3000";

function postar(campos: Record<string, string>) {
  const corpo = new URLSearchParams(campos);
  return POST(
    new NextRequest(`${ORIGEM}/auth/confirmar/validar`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: corpo.toString(),
    })
  );
}

beforeEach(() => {
  createClient.mockClear();
  getUser.mockReset();
  verifyOtp.mockReset();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "segredo-de-teste");
  verifyOtp.mockResolvedValue({ error: null });
  getUser
    .mockResolvedValueOnce({ data: { user: null } })
    .mockResolvedValue({ data: { user: { id: "u1" } } });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /auth/confirmar/validar", () => {
  it("recovery válido gasta o token, entrega o cookie e vai para /nova-senha", async () => {
    const r = await postar({
      token_hash: "abc",
      type: "recovery",
      next: "/nova-senha",
    });
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc" });
    // 303 (não 307): o navegador faz GET na página /nova-senha. Um 307
    // reenviaria o POST e daria 405 numa página sem route handler.
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/nova-senha");
    const cookie = r.cookies.get("recuperacao_senha");
    expect(cookie?.value.startsWith("u1.")).toBe(true);
    const bruto = r.headers.getSetCookie().find((c) => c.startsWith("recuperacao_senha="));
    expect(bruto).toMatch(/HttpOnly/i);
    expect(bruto).toMatch(/Path=\/nova-senha/);
  });

  it("tipo fora da lista é recusado e não gasta o token", async () => {
    const r = await postar({ token_hash: "abc", type: "signup", next: "/nova-senha" });
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/entrar?erro=link_invalido");
  });

  it("sem token_hash é link inválido", async () => {
    const r = await postar({ type: "recovery", next: "/nova-senha" });
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(r.headers.get("location")).toBe("/entrar?erro=link_invalido");
  });

  it("token recusado pelo login não entrega cookie", async () => {
    verifyOtp.mockResolvedValue({ error: { code: "otp_expired" } });
    const r = await postar({ token_hash: "abc", type: "recovery", next: "/nova-senha" });
    expect(r.headers.get("location")).toBe("/entrar?erro=link_invalido");
    expect(r.cookies.get("recuperacao_senha")).toBeUndefined();
  });

  it("com sessão já aberta não troca a sessão (fixação de sessão)", async () => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "outra-pessoa" } } });
    const r = await postar({ token_hash: "abc", type: "recovery", next: "/nova-senha" });
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/entrar?erro=sessao_aberta");
  });

  it.each(["https://site-malicioso.com", "//site-malicioso.com", "/\\x"])(
    "destino malicioso (%s) cai na raiz",
    async (next) => {
      const r = await postar({ token_hash: "abc", type: "recovery", next });
      expect(r.headers.get("location")).toBe("/");
    }
  );
});
```

Rode: `npx vitest run tests/auth/confirmar-validar-route.test.ts` → Esperado: FALHA (a rota não existe).

- [ ] **Passo 2: Escrever o POST de validação**

Crie `app/auth/confirmar/validar/route.ts`:

```ts
import {
  CAMINHO_COOKIE_RECUPERACAO,
  COOKIE_RECUPERACAO,
  criarCookieRecuperacao,
} from "@/lib/auth/cookie-recuperacao";
import { safeNextOr } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

// Só os tipos que o produto usa (dívida 39): recuperação e convite. O ramo
// `code` saiu: o modelo próprio do e-mail usa token_hash.
const TIPOS = ["recovery", "invite"] as const satisfies readonly EmailOtpType[];

function tipoDoLink(bruto: string | null): EmailOtpType | null {
  return TIPOS.find((tipo) => tipo === bruto) ?? null;
}

/**
 * Redireciona com 303 (See Other) e endereço RELATIVO. 303 obriga o navegador a
 * fazer GET no destino (padrão Post/Redirect/Get); um 307 reenviaria o POST para
 * `/nova-senha`/`/entrar`, que são páginas GET, e daria 405. Relativo porque o
 * Next troca 127.0.0.1 por localhost em `request.url` (o cookie é de um endereço
 * só). Não reaproveita `redirecionarRelativo`, que é 307 e serve a outras rotas.
 * Só caminho do próprio site (começa com uma barra, não `//`/`/\`, sem controle).
 */
function redirecionar303(para: string): NextResponse {
  const temControle = [...para].some((l) => {
    const c = l.charCodeAt(0);
    return c < 0x20 || c === 0x7f;
  });
  const estranho =
    !para.startsWith("/") ||
    para.startsWith("//") ||
    para.startsWith("/\\") ||
    temControle;
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: estranho ? "/" : para,
      "Cache-Control": "private, no-store",
    },
  });
}

/** O POST gasta o token. O GET (page.tsx) só mostra o botão: antivírus não gasta. */
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const formulario = await request.formData();
  const destino = safeNextOr(
    String(formulario.get("next") ?? ""),
    "/",
    url.origin
  );
  const falhou = redirecionar303("/entrar?erro=link_invalido");

  const tipo = tipoDoLink(String(formulario.get("type") ?? ""));
  const tokenHash = String(formulario.get("token_hash") ?? "");
  if (!tipo || !tokenHash) return falhou;

  const supabase = await createClient();
  const {
    data: { user: jaLogado },
  } = await supabase.auth.getUser();
  // Não troca uma sessão aberta pela do link (fixação de sessão).
  if (jaLogado) return redirecionar303("/entrar?erro=sessao_aberta");

  const { error } = await supabase.auth.verifyOtp({
    type: tipo,
    token_hash: tokenHash,
  });
  if (error) return falhou;

  const resposta = redirecionar303(destino);
  if (destino.startsWith(CAMINHO_COOKIE_RECUPERACAO)) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      resposta.cookies.set(COOKIE_RECUPERACAO, criarCookieRecuperacao(user.id), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 10,
        path: CAMINHO_COOKIE_RECUPERACAO,
      });
    }
  }
  return resposta;
}
```

- [ ] **Passo 3: Apagar o GET antigo e seu teste; escrever a página**

```bash
git rm app/auth/confirmar/route.ts tests/auth/confirmar-route.test.ts
```

Crie `app/auth/confirmar/page.tsx` (página intermediária, server component; sem JS — robusta para o antivírus):

```tsx
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = { title: "Criar senha nova · repply food." };

const TIPOS_ACEITOS = new Set(["recovery", "invite"]);

/**
 * O link do e-mail cai aqui (GET) e só mostra um botão. Quem clica faz o POST
 * para /auth/confirmar/validar, que gasta o token. O antivírus de e-mail faz só
 * o GET e não gasta nada (dívida 40). Sem campo sensível digitado: um form POST
 * nativo basta e funciona sem JavaScript.
 */
export default async function PaginaConfirmar({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;
  const valido = Boolean(token_hash) && TIPOS_ACEITOS.has(type ?? "");

  // `/auth/confirmar` não está no grupo `(entrada)`, então não herda o cartão
  // centralizado daquele layout. O `<main>` abaixo centraliza por conta própria,
  // como `app/error.tsx` e `app/not-found.tsx`.
  const molduraCentral =
    "mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6";

  if (!valido) {
    return (
      <main className={molduraCentral}>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">Link inválido</h1>
          <p className="text-sm text-muted-foreground">
            Este link não vale mais. Peça outro em “Esqueci a senha”.
          </p>
        </div>
        <Link
          href="/entrar"
          className="flex min-h-11 items-center justify-center text-center text-sm underline underline-offset-4"
        >
          Voltar para entrar
        </Link>
      </main>
    );
  }

  return (
    <main className={molduraCentral}>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Crie sua senha nova</h1>
        <p className="text-sm text-muted-foreground">
          Clique no botão para confirmar o pedido e criar a senha nova.
        </p>
      </div>
      <form method="post" action="/auth/confirmar/validar" className="flex flex-col gap-4">
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next ?? "/nova-senha"} />
        <Button type="submit" size="toque" className="w-full">
          Criar minha senha nova
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Passo 4: Teste da página (escreva e rode)**

Crie `tests/auth/confirmar-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PaginaConfirmar from "@/app/auth/confirmar/page";

async function montar(params: Record<string, string>) {
  const ui = await PaginaConfirmar({ searchParams: Promise.resolve(params) });
  render(ui);
}

describe("página intermediária de /auth/confirmar", () => {
  it("com recovery válido mostra o botão num form POST que não gasta o token", async () => {
    await montar({ token_hash: "abc", type: "recovery", next: "/nova-senha" });
    const botao = screen.getByRole("button", { name: /criar minha senha nova/i });
    const form = botao.closest("form");
    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.getAttribute("action")).toBe("/auth/confirmar/validar");
  });

  it("sem token_hash mostra link inválido e nenhum botão", async () => {
    await montar({ type: "recovery", next: "/nova-senha" });
    expect(screen.getByText(/link inválido/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("tipo fora da lista mostra link inválido", async () => {
    await montar({ token_hash: "abc", type: "signup", next: "/nova-senha" });
    expect(screen.getByText(/link inválido/i)).toBeInTheDocument();
  });
});
```

Rode: `npx vitest run tests/auth/confirmar-page.test.tsx tests/auth/confirmar-validar-route.test.ts` → Esperado: verde.

- [ ] **Passo 5: E-mail de recuperação com a marca**

Reescreva `supabase/templates/recuperar-senha.html` (HTML para e-mail: tabelas, CSS **em linha**, ~600 px, fundo claro, pilha de fontes do sistema, sem fonte externa; botão laranja `#FF5A1F` com texto quase-preto `#0A0A0A`; nome "repply food." com o ponto laranja; logo PNG hospedado; o link aponta para a página intermediária):

```html
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f5f5f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a;">
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <img src="{{ .SiteURL }}/icon-192.png" width="48" height="48" alt="repply food." style="display:block;border:0;border-radius:11px;" />
                <p style="margin:16px 0 0 0;font-size:18px;font-weight:600;">repply food<span style="color:#FF5A1F;">.</span></p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                <h1 style="margin:16px 0 8px 0;font-size:22px;line-height:1.3;color:#0a0a0a;">Crie sua senha nova</h1>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#404040;">Recebemos um pedido para criar uma senha nova no repply food.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background:#FF5A1F;">
                      <a href="{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=recovery&next=/nova-senha"
                         style="display:inline-block;padding:14px 24px;font-size:15px;font-weight:600;color:#0a0a0a;text-decoration:none;border-radius:8px;">
                        Criar minha senha nova
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px 32px;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#737373;">O link vale por 1 hora. Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

- [ ] **Passo 6: E-mail "sua senha foi alterada" com a marca (opcional — confira com o controlador)**

Crie `supabase/templates/senha-alterada.html` (mesma moldura, sem botão):

```html
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f5f5f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a;">
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <img src="{{ .SiteURL }}/icon-192.png" width="48" height="48" alt="repply food." style="display:block;border:0;border-radius:11px;" />
                <p style="margin:16px 0 0 0;font-size:18px;font-weight:600;">repply food<span style="color:#FF5A1F;">.</span></p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 28px 32px;">
                <h1 style="margin:16px 0 8px 0;font-size:22px;line-height:1.3;">Sua senha foi alterada</h1>
                <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#404040;">A senha do seu acesso ao repply food. foi alterada agora.</p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#737373;">Se não foi você, fale com a Repply pelo WhatsApp o quanto antes.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

Em `supabase/config.toml`, descomente e preencha o bloco da notificação (logo abaixo do bloco `[auth.email.template.recovery]`):

```toml
[auth.email.notification.password_changed]
enabled = true
subject = "Sua senha foi alterada · repply food."
content_path = "./supabase/templates/senha-alterada.html"
```

Se o controlador decidir não incluir o aviso, pule este passo e não crie `senha-alterada.html` nem o bloco (sem placeholder: ou entra inteiro, ou não entra).

- [ ] **Passo 7: Teste do modelo de e-mail (escreva e rode)**

Crie `tests/auth/modelo-de-email.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(
  resolve(__dirname, "../../supabase/templates/recuperar-senha.html"),
  "utf8"
);

describe("modelo de e-mail de recuperação com a marca", () => {
  it("aponta para a página intermediária com token_hash e type=recovery", () => {
    expect(html).toContain(
      "{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=recovery&next=/nova-senha"
    );
  });

  it("usa o logo PNG hospedado (clientes de e-mail não renderizam SVG)", () => {
    expect(html).toContain("{{ .SiteURL }}/icon-192.png");
    expect(html).not.toMatch(/\.svg/);
  });

  it("usa o laranja da marca e texto quase-preto no botão, sem fonte externa", () => {
    expect(html).toContain("#FF5A1F");
    expect(html).toContain("#0a0a0a");
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic|@font-face/);
  });
});
```

Rode: `npx vitest run tests/auth/modelo-de-email.test.ts` → Esperado: 3 passam.

- [ ] **Passo 8: Lint e commit**

```bash
npx biome check --write app/auth/confirmar/page.tsx app/auth/confirmar/validar/route.ts tests/auth/confirmar-validar-route.test.ts tests/auth/confirmar-page.test.tsx tests/auth/modelo-de-email.test.ts
git fetch && git status --short
git checkout -- AGENTS.md next-env.d.ts 2>/dev/null || true
git add app/auth/confirmar/page.tsx app/auth/confirmar/validar/route.ts tests/auth/confirmar-validar-route.test.ts tests/auth/confirmar-page.test.tsx tests/auth/modelo-de-email.test.ts supabase/templates/recuperar-senha.html supabase/templates/senha-alterada.html supabase/config.toml
git rm app/auth/confirmar/route.ts tests/auth/confirmar-route.test.ts
git commit -m "Faz o link de senha cair numa página com POST e põe a marca nos e-mails"
```

(Se não incluir o aviso de senha alterada, tire `supabase/templates/senha-alterada.html` do `git add`.)

---

## Verificação do grupo 2 ‖ 3 ‖ 4 (controlador)

- [ ] Com as Tarefas 2, 3 e 4 commitadas: `npx tsc --noEmit`, `npm run check`, `npx vitest run`, `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 npm run build`. Esperado: tudo limpo. Erro de integração vai para um agente de conserto com a lista completa, antes da Tarefa 5.
- [ ] `grep -rnE "error\??\.message" app/auth lib/auth lib/supabase` volta vazio (nenhum texto cru do Supabase na tela nem no log).

---

## Tarefa 5: CSP que bloqueia de verdade (controlador)

**Por quê:** o `next.config.ts` manda `Content-Security-Policy-Report-Only`, que não bloqueia nada (dívida 45). Com telas de senha no ar, passa a bloquear — **depois** de conferir no navegador que as telas, as fontes locais, o JavaScript do Next e o tema carregam.

**Arquivos:** `next.config.ts` (arquivo único — por isso fora do grupo paralelo).

- [ ] **Passo 1: Subir o painel e conferir a CSP atual no navegador**

`npm run local:acesso`, depois o `food-dev` do `.claude/launch.json` da pasta de trabalho, sempre em **`http://127.0.0.1:3000`**. A etapa 2 já registrou avisos de CSP do tipo "Applying inline style violates ... default-src" (o Next injeta estilo em linha). Em 390 px e 1280 px, claro e escuro, abra `/entrar`, `/esqueci-a-senha`, `/auth/confirmar?token_hash=x&type=recovery&next=/nova-senha`, `/nova-senha`, `/trocar-senha`, o painel de uma casa e o `/admin`, e anote no console toda violação com a cabeçalho `Content-Security-Policy-Report-Only`.

- [ ] **Passo 2: Escrever a CSP que bloqueia, cobrindo o que o Next precisa**

Em `next.config.ts`, troque o cabeçalho `Content-Security-Policy-Report-Only` por `Content-Security-Policy`, mantendo as diretivas fechadas e acrescentando só o que a conferência mostrou necessário (o Next usa estilo em linha; mantenha `default-src 'self'`, `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self'`, `object-src 'none'`):

```ts
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
              "form-action 'self'",
              "object-src 'none'",
              "img-src 'self' data:",
              "font-src 'self'",
              "style-src 'self' 'unsafe-inline'",
            ].join("; "),
          },
```

Observações:
- `style-src 'self' 'unsafe-inline'`: o Next injeta estilo em linha; sem isto as telas quebram. Não afrouxa `script-src` (continua coberto por `default-src 'self'`).
- `img-src 'self' data:`: ícones e imagens em `data:`.
- **Não** acrescente `'unsafe-inline'`/`'unsafe-eval'` a `script-src`. Se a conferência mostrar erro de script em linha do Next, pare e leve ao controlador (pode exigir nonce, que é outra decisão).

- [ ] **Passo 3: Ligar o bloqueio só depois de reconferir no navegador**

Reinicie o `food-dev`, repita o roteiro do Passo 1 e confirme: nenhuma violação de `Content-Security-Policy` (agora sem o `-Report-Only`), as telas carregam, as fontes locais aparecem, o tema claro e o escuro funcionam, o JavaScript do Next roda (os formulários hidratam: o botão de enviar liga). **O passo só fecha com essa conferência limpa.** Capturas das telas nas duas larguras e nos dois temas, para o Lucas Ferreira.

- [ ] **Passo 4: Verificar e commitar**

```bash
npx tsc --noEmit && npx biome check --write next.config.ts && NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 npm run build
git fetch && git status --short
git checkout -- AGENTS.md next-env.d.ts 2>/dev/null || true
git add next.config.ts
git commit -m "Liga a CSP que bloqueia, depois de conferir as telas no navegador"
```

---

## Tarefa 6: Mailpit, documentação e fechamento (controlador)

**Arquivos:** `supabase/config.toml` (já commitado na Tarefa 4; só conferência aqui), `docs/decisoes.md`, `docs/divida-tecnica.md`, `docs/arquitetura/seguranca-e-isolamento.md`, `docs/operacao/publicar.md`, `docs/README.md`, `README.md`, `CLAUDE.md`, `.env.example`, este plano.

- [ ] **Passo 1: Conferir o e-mail com a marca no Mailpit**

Com o painel no ar (`http://127.0.0.1:3000`) e o Supabase local servindo o e-mail, peça uma senha nova em `/esqueci-a-senha` para um e-mail de teste criado pelo `npm run local:acesso`. Abra `http://127.0.0.1:54324` (Mailpit) e confira: o e-mail chega com a marca (logo PNG, "repply food." com o ponto laranja, botão laranja com texto quase-preto); o botão leva à página intermediária `/auth/confirmar` (um botão, **não** gasta o token ao abrir); clicar em "Criar minha senha nova" faz o POST, abre a sessão e leva a `/nova-senha`; a senha nova salva e entra no painel. Se o aviso de senha alterada foi incluído (Tarefa 4, Passo 6), confira que o segundo e-mail também chega com a marca. Capturas para o Lucas Ferreira.

> **Exceção de reinício do Supabase local (só o controlador, só aqui).** O bloco de config novo `[auth.email.notification.password_changed]` (Tarefa 4) e, às vezes, o conteúdo trocado do modelo de recuperação só são relidos pelo GoTrue ao subir a config. Se o Mailpit não mostrar o modelo com a marca ou o segundo e-mail não chegar, o controlador pode parar e subir o Supabase local uma vez — `npx supabase stop` seguido do `npx supabase start` com a mesma lista de serviços de sempre (`-x studio,logflare,vector,storage-api,imgproxy,realtime,postgres-meta`, **sem** excluir o `mailpit`) — e reservir a função (`npx supabase functions serve receber-envio`). **Nunca `db reset`** (apaga o banco local): o reinício preserva os dados. Esta exceção vale só para a conferência do Mailpit na Tarefa 6; as tarefas em paralelo (2, 3, 4) nunca mexem no estado do Supabase.

- [ ] **Passo 2: `docs/decisoes.md` — D-61 a D-64**

No fim da tabela (mesmo formato das linhas D-55 a D-60):

```markdown
| D-61 | 15/10/2026 | **A etapa 4 vai em duas partes:** 4a (endurecer o código, enviado ao GitHub como as etapas 1 a 3) e 4b (a publicação na nuvem, guiada passo a passo com a autorização do Lucas Ferreira na hora). A 4a produz software testável e commitado; a 4b é um roteiro operacional. | — | Naturezas diferentes: código revisável × operação na nuvem com logins e segredos que o Lucas digita. |
| D-62 | 15/10/2026 | **O limite de tentativas de senha é por e-mail, no banco** (não em memória, que não sobrevive na Vercel), como segunda camada além do limite do Supabase (D-52). Bloqueia a partir de 5 erros, com recuo que cresce; o login certo zera; uma rotina diária limpa linhas antigas. Fecha a dívida 23. | — | O limite do Supabase vê o endereço da Vercel, não o de quem tenta; uma conta atacada travava todas. |
| D-63 | 15/10/2026 | **A opção "Secure password change" do Supabase fica desligada**; a troca de senha por Ajustes já confere a senha atual (`senhaConfere`). Fecha a dívida 38. | — | Ligada, o Supabase pode exigir reautenticação que `trocarSenhaAction` não trata; a senha atual já é conferida. |
| D-64 | 15/10/2026 | **Mudar o fuso de uma casa continua só avisando para pedir reenvio; não dispara o reenvio sozinho.** Fecha a dívida 46. | — | Disparar o reenvio sozinho seria decisão de produto com efeito no SCC; o aviso basta no piloto. |
```

- [ ] **Passo 3: `docs/divida-tecnica.md` — resolvidos e abertos**

- Mova para "Resolvidos" (com a data 15/10/2026 e os commits desta etapa): **10** (trava dev-contra-nuvem, Tarefa 3), **23** (trava de tentativas, D-62, Tarefa 1 e 2), **37** (cookie seguro num lugar só, Tarefa 3), **39** (tipos de link, Tarefa 4), **40** (link à prova de antivírus, Tarefa 4), **45** (CSP que bloqueia, Tarefa 5) e **46** (resolvido por decisão: mantém só o aviso, D-64).
- **38** (secure_password_change): o controlador decide (ver "Pontos decididos"). Recomendado: mover para "Resolvidos por decisão (D-63); `secure_password_change = false` no `config.toml`".
- **24** (login na nuvem): continua **aberto** (é da 4b), com a nota: "a parte local está feita — `over_email_send_rate_limit` registra `cota_email_estourada` no log (§2.7); falta a configuração do Resend e da cota na nuvem."
- Item **41** (requisitos de senha além do tamanho): **não entra** (a senha mínima continua 8, sem exigências extras; é mais simples para o dono do bar).
- Na frase "Bloqueiam a primeira publicação (etapa 4): itens 23, 24, 25, 37, 38, 39, 40, 45 e 47", deixe **"itens 24, 25 e 47"** (23, 37, 39, 40, 45 resolvidos nesta etapa; 38 por D-63; 46 por D-64).

- [ ] **Passo 4: `docs/arquitetura/seguranca-e-isolamento.md`**

- §2: acrescente `registrar_tentativa_errada`, `limpar_tentativas` e `login_bloqueado` à lista das funções só da chave de serviço (entram em `tests/isolamento/rpc-privilegada.test.ts`).
- §5 (login): acrescente a trava por e-mail no banco (D-62), segunda camada além do limite do Supabase (D-52), com fail-open (banco fora não trava o login); o cookie de sessão sai seguro em produção por uma função única (`lib/supabase/cookies.ts`); a trava no código contra apontar o dev para a nuvem (`PERMITIR_NUVEM_NO_DEV`); o link de senha cai numa página intermediária e só o POST gasta o token (dívida 40); a volta do link aceita só `recovery` e `invite` (dívida 39); a CSP passa a bloquear (dívida 45). Onde a §5 descrevia a CSP "começando em modo só relatar" (§ do fim), troque para "a CSP bloqueia desde a etapa 4a".

- [ ] **Passo 5: `docs/operacao/publicar.md` e `.env.example`**

- `publicar.md`: tire `enviar-alerta`, `ALERTA_EMAIL_*` e o Vault da seção 1 (são da etapa 9); deixe `receber-envio` e as três rotinas (`rf-vigia`, `rf-retencao`, `rf-limpa-tentativas`). Acrescente um checklist consolidado "o que muda do `config.toml` local para a nuvem" (site_url no domínio; `additional_redirect_urls` com `https://food.repplyhub.com.br/**`; cadastro público fechado; login por e-mail ligado; senha mínima 8; `secure_password_change` desligada (D-63); modelo `recuperar-senha.html` com a marca; SMTP do Resend). Deixe explícito que publicar é a 4b.
- `.env.example`: um vocabulário só para e-mail — **URL do site** = `NEXT_PUBLIC_APP_URL` (tire o `SITE_URL` duplicado); **remetente** e **destinatário** do alarme (`ALERTA_EMAIL_DE`, `ALERTA_EMAIL_PARA`) marcados como "etapa 9 (alarme do vigia)", separados das variáveis da etapa 4 (`RESEND_API_KEY`). Alinhe os mesmos nomes no `.env.nuvem.local` (sem lê-lo nem imprimi-lo: só garanta, pelo `publicar.md`, que o vocabulário é o mesmo).

- [ ] **Passo 6: `docs/README.md`, `README.md`, `CLAUDE.md`**

- `docs/README.md`: onde disser "As 9 tabelas", "As 10 tabelas" (entra `tentativas_de_login`); cite a rotina `rf-limpa-tentativas`.
- `README.md`: acrescente que, para desenvolver, a trava de tentativas vive no banco local (a rotina `rf-limpa-tentativas` limpa à noite) e que `PERMITIR_NUVEM_NO_DEV=1` é a única porta para a chave de serviço falar com a nuvem fora de produção (não usar sem necessidade).
- `CLAUDE.md`: §13, em `supabase/templates/`, cite os dois modelos (recuperação e, se incluído, senha alterada); §10, nada muda (a página intermediária é exceção justificada, documentada neste plano).
- Este plano: marque os checkboxes e escreva o "Registro da execução".

- [ ] **Passo 7: Revisão final, verificação, commit e pedido de envio**

Revisão do conjunto (modelo mais capaz) sobre o intervalo da etapa, com atenção a: a chave de serviço só no servidor e nunca `NEXT_PUBLIC_`; a trava fail-open (nunca trava o login por falha de banco); nenhuma senha nem token em log, URL ou `console`; `entrarAction` consulta a trava antes do Supabase e só conta credencial recusada; nenhum `error.message` cru na tela; a CSP não afrouxa `script-src`; a página intermediária não gasta o token no GET. Consertos num agente só; verificação completa de novo (`npx tsc --noEmit`, `npm run check`, `npx vitest run`, `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 npm run build`); `git checkout -- AGENTS.md next-env.d.ts`; commit da documentação listando os arquivos:

```bash
git add docs/decisoes.md docs/divida-tecnica.md docs/arquitetura/seguranca-e-isolamento.md docs/operacao/publicar.md docs/README.md README.md CLAUDE.md .env.example docs/superpowers/plans/2026-10-15-etapa-4a-endurecer-para-producao.md
git commit -m "Fecha a etapa 4a: decisões, dívida, documentação e registro da execução"
```

Mostre a lista de commits ao Lucas Ferreira e **peça o ok para enviar ao GitHub** (um `git push` por vez). Nada publica na nuvem (isso é a 4b).

---

## Critérios de aceite da etapa 4a

- [ ] A trava de tentativas vive no banco, por e-mail, fechada (só a chave de serviço): bloqueia a partir de 5 erros com recuo que cresce, o login certo zera, o bloqueio expira, o e-mail é normalizado e um e-mail inexistente é contado igual (teste); uma rotina diária limpa linhas antigas.
- [ ] `entrarAction` consulta a trava **antes** do Supabase (não chama o login se bloqueado), registra só a credencial recusada e limpa no sucesso; os 800 ms de latência mínima continuam; a trava degrada com elegância (banco fora não trava o login).
- [ ] `pedirNovaSenhaAction` registra `cota_email_estourada` quando a cota de e-mail estoura, mantendo a resposta de sucesso (não revela quem é cliente).
- [ ] O cookie de sessão sai seguro em produção por uma função única, usada por `server.ts` e `proxy.ts`; fora de produção o login local em `http` continua funcionando (teste).
- [ ] `createServiceClient` lança, fora de produção, quando a URL não é local e sem `PERMITIR_NUVEM_NO_DEV=1`; a URL local e a produção nunca disparam; os testes de integração contra o banco local seguem passando (teste).
- [ ] O link de "esqueci a senha" cai numa página intermediária; só o POST gasta o token; a volta aceita só `recovery` e `invite`, sem o ramo `code` (teste).
- [ ] Os e-mails saem com a marca (logo PNG hospedado, laranja `#FF5A1F`, texto quase-preto, o ponto laranja, sem fonte externa, sem SVG); o botão leva à página intermediária; conferido no Mailpit.
- [ ] A CSP bloqueia de verdade (`Content-Security-Policy`, sem `-Report-Only`), sem afrouxar `script-src`, depois de conferir as telas no navegador em 390 px e 1280 px, claro e escuro, inclusive o admin.
- [ ] Documentação alinhada: D-61 a D-64; dívidas 10, 23, 37, 39, 40, 45 e 46 (e 38 por decisão) em "Resolvidos"; 24 com a nota da parte local; `publicar.md`, `.env.example` e `README` alinhados.
- [ ] Tipos, lint, testes e build limpos; capturas mostradas ao Lucas Ferreira; nada publicado na nuvem; nenhum `git push` sem o ok dele.

---

## Registro da execução

Execução por subagent-driven-development, a partir de `f41c631` (estado do 4b). Ledger em `.superpowers/sdd/2026-10-15-etapa-4a-endurecer-para-producao/progress.md`.

**Commits por tarefa (todos revisados e aprovados):**
- Tarefa 1 (banco da trava de tentativas): `bf054d7` (16/10).
- Tarefa 2 (trava ligada no login + cota de e-mail): `aeb16fb` (19/10).
- Tarefa 3 (cookie seguro numa função única + trava dev-contra-nuvem): `36ba579` (19/10).
- Tarefa 4 (link à prova de antivírus, tipos de link, e-mails com a marca): `2f0bc83` (19/10).
- Tarefa 5 (CSP que bloqueia com nonce): `041ce4d` (19/10).
- Tarefa 6 (documentação): commit da documentação (este registro).

**Decisão de produto na Tarefa 5 (o desvio aceito).** O Passo 2 previa uma CSP estática no `next.config.ts`. A conferência no navegador (Passo 1) mostrou que ela **bloqueia os `<script>` em linha do próprio Next** (App Router) — no dev e, confirmado no HTML da build, em produção também — e a página não inicia. O plano já previa parar nesse ponto ("pode exigir nonce, que é outra decisão"). O **Lucas Ferreira escolheu fazer a trava completa agora** (CSP com `nonce` no porteiro), em vez de adiar. Resultado: a CSP saiu do `next.config` para o `proxy.ts` com um `nonce` por carregamento (`lib/seguranca/csp.ts`); o `next-themes` recebe o `nonce` (`app/layout.tsx`, que vira dinâmico); `atualizarSessao` encaminha os cabeçalhos sem perder a sessão. Registrado em **D-67**.

**Decisões do controlador (ajustes mecânicos, sem mudar produto):**
- **Renumeração das decisões.** O plano (Passo 2) propunha D-61 a D-64, mas o 4b já usou D-61, D-62 e D-63. As decisões da 4a entraram como **D-64** (trava de tentativas), **D-65** (`secure_password_change` desligada), **D-66** (fuso só avisa) e **D-67** (CSP com nonce).
- **Referências "D-62" imutáveis.** O commit `bf054d7` e a migration `20261015140000` comentam "D-62" pela numeração do plano; a decisão virou **D-64**. Migration e commit não se editam: a ressalva fica no `decisoes.md`, no `divida-tecnica.md` e no `modelo-de-dados.md`.
- **Conferência em paralelo não feita.** Pela lentidão do HD, as Tarefas 2, 3 e 4 rodaram em sequência, não em paralelo.

**Verificação (Passo 7 e critérios de aceite):**
- Verificação do grupo limpa: `tsc` 0 erros; Biome 210 arquivos; **1022 testes** (75 arquivos), saída limpa; build ok.
- **CSP conferida no navegador**, em dev (`127.0.0.1:3001`) e na **build de produção** (`next start`): `/entrar`, `/esqueci-a-senha`, `/auth/confirmar`, `/nova-senha` com cabeçalho **bloqueante** e **zero** script em linha sem nonce; `/entrar` hidrata (o botão habilita), o tema aplica; em produção **sem `'unsafe-eval'`**. Capturas (celular e produção) mostradas ao Lucas. As telas autenticadas (`/admin`, painel) usam o mesmo porteiro e layout (mecanismo uniforme, provado em `/entrar` e nos testes das duas saídas do porteiro); a conferência visual delas depende de login, que o Lucas digita.
- **Mailpit (local):** o e-mail de recuperação chega com a marca (logo PNG, `#FF5A1F`, texto `#0A0A0A`, "repply food.", sem SVG) e o botão leva à página intermediária `/auth/confirmar?token_hash=…&type=recovery&next=/nova-senha`. Captura mostrada ao Lucas. (O 4b já confirmara o e-mail ao vivo pelo Resend.)

**Falta (fora da 4a):** enviar os commits ao GitHub (com o ok do Lucas, um a um) e **republicar** na nuvem (a 4b). Na republicação: reconciliar a trava de tentativas que o Lucas Duarte já aplicou à nuvem (migration `20261015140000`) com este código antes do `db push`, e subir os **dois** modelos de e-mail com o SMTP, senão o link usa `code` e quebra.
