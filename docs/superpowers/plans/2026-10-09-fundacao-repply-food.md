# Fundação do repply food. - Plano de Implementação

> **Para agentes de execução:** É OBRIGATÓRIO usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para rastreamento.

**Objetivo:** Criar a fundação completa do repply food.: projeto Next.js + Supabase com as peças do Repply Imob, as 8 tabelas com RLS e testes de isolamento, a função `receber-envio` + `processar_envio` com os testes de recepção, e o gerador de dados fictícios enviando pelo mesmo caminho. Tudo funcionando localmente com tipos, lint, testes e build verdes.

**Arquitetura:** Seguir o desenho do MVP ([`docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md`](../../superpowers/specs/2026-10-08-repply-food-mvp-design.md)) e o modelo de recepção ([`docs/arquitetura/recepcao-de-dados.md`](../../arquitetura/recepcao-de-dados.md)). Base no Repply Imob (Next.js App Router + TypeScript estrito, Tailwind 4, shadcn sobre Base UI, Biome, Vitest). Banco central multi-tenant com RLS por `restaurante_id`, `processar_envio()` no Postgres (transação única) e `receber-envio` como Edge Function (Deno). Gerador de dados fictícios envia pelo mesmo caminho HTTP (formato exato do contrato). Sem n8n.

**Stack:** Next.js 16 (App Router), React, TypeScript estrito, Tailwind CSS 4, shadcn/ui (Base UI), lucide-react, Recharts, react-hook-form + Zod, Supabase (Auth, Postgres+RLS, Edge Functions, pg_cron/pg_net), Resend, Vitest, Biome, @supabase/supabase-js, supabase CLI (via npx).

**Especificações de referência:** [`SPEC.md`](../../../SPEC.md), [`CLAUDE.md`](../../../CLAUDE.md), [`docs/decisoes.md`](../../decisoes.md), [`docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md`](../../superpowers/specs/2026-10-08-repply-food-mvp-design.md), [`docs/arquitetura/modelo-de-dados.md`](../../arquitetura/modelo-de-dados.md), [`docs/arquitetura/seguranca-e-isolamento.md`](../../arquitetura/seguranca-e-isolamento.md), [`docs/arquitetura/recepcao-de-dados.md`](../../arquitetura/recepcao-de-dados.md), [`docs/integracao-scc/contrato-de-dados.md`](../../integracao-scc/contrato-de-dados.md), [`docs/metricas.md`](../../metricas.md).

## Restrições Globais

- **Linguagem/Comunicação:** Sempre em português do Brasil (interface em PT-BR do setor; domínio em português: tabelas/colunas/funções). Nunca jargão técnico no que o cliente lê.
- **TypeScript estrito:** Nunca `any`. Tipos do banco gerados por `npm run types`.
- **Banco e segurança:** Toda tabela nasce por **migration**, com **RLS no mesmo arquivo**. Proibido `FORCE ROW LEVEL SECURITY`. Funções auxiliares com `security definer` + `set row_security = off` quando necessário. `restaurante_id` vem do servidor (token/sessão), nunca do corpo/URL sem conferir. Zero linhas afetadas numa escrita **não é sucesso**. Migrations **só se acrescentam**.
- **Dados pessoais:** RG, telefone, sexo e nome de cliente do restaurante **são descartados na recepção** (antes de gravar e antes de guardar payload). Nunca logar dado pessoal. Erros com mensagem curta, sem dado pessoal.
- **Domínio monetário:** `numeric(12,2)` no banco. Nunca `number` para somar centavos.
- **Datas/horas:** `timestamptz`. Exibição e "dia de operação" usam fuso do restaurante.
- **Isolamento multi-tenant:** Toda política RLS usa `tem_acesso(restaurante_id)`. Testes de isolamento obrigatórios.
- **Recepção:** Webhook fecha por padrão, idempotência pela chave. Transação única em `processar_envio()`, trava por restaurante (`pg_advisory_xact_lock`).
- **Identidade visual:** Seguir D-41/D-42 (tomate só no símbolo).
- **Interface:** Celular primeiro, computador sempre funcionando (D-39). Guia "tela inicial" só no celular, uma vez por aparelho, nunca no app instalado (D-36).
- **Anti-padrões:** Sem `setInterval`/estado em memória (Vercel). Sem `git add -A`, `--force`, `--no-verify`. Nunca mostrar `error.message` do banco ao usuário.
- **Verificação:** `tsc --noEmit`, `npm run check` (Biome), `npm run test` (Vitest), `npm run build`.

---

## Estrutura de Arquivos Planejada

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `package.json` | Criar | Dependências e scripts (verificação, types, supabase) |
| `tsconfig.json` | Criar | TS estrito, paths `@/*` |
| `.gitignore` | Ajustar | `.env*`, `.next/`, `out/`, `dist/`, `coverage/`, `.supabase/`, `.vercel/`, `.superpowers/` |
| `.env.example` | Criar | Variáveis do Supabase, Resend, alerta, site |
| `biome.json` | Criar | Lint/formato (base Imob) |
| `vitest.config.ts` | Criar | Config Vitest |
| `next.config.ts` | Criar | Next 16 + cabeçalhos de segurança |
| `postcss.config.mjs` | Criar | Tailwind 4 |
| `components.json` | Criar | shadcn/ui |
| `app/globals.css` · `app/styles/tokens.css` · `app/styles/brand.css` | Criar | Tokens de marca em camadas, schemes |
| `app/layout.tsx` · `app/manifest.webmanifest` | Criar | Layout raiz, fontes locais, PWA |
| `lib/logger.ts` | Criar | `logError`/`logInfo` sem dado pessoal |
| `lib/format/dinheiro.ts` · `lib/format/data.ts` | Criar | Dinheiro (string/Decimal) e datas por fuso |
| `lib/supabase/{client,server,service}.ts` | Criar | Os 3 clientes Supabase |
| `lib/auth/guards.ts` | Criar | Guardas de acesso |
| `lib/validators/recepcao.ts` | Criar | Schemas Zod do envelope |
| `supabase/config.toml` | Criar | `verify_jwt = false` comentado em `receber-envio` |
| `supabase/migrations/20261009120000_fundacao_esquema.sql` | Criar | 8 tabelas, RLS, triggers, helpers, `processar_envio`, `atualizar_estados`, `recalcular_dia_operacao`, `atualizar_turnos` |
| `supabase/functions/receber-envio/index.ts` | Criar | Edge Function de recepção |
| `scripts/gerador-dados-ficticios.ts` | Criar | Simulador do SCC pelo mesmo caminho HTTP |
| `tests/design-tokens.test.ts` | Criar | Contraste dos tokens |
| `tests/recepcao/envio.test.ts` | Criar | Casos §4 da recepção |
| `tests/isolamento/rls.test.ts` | Criar | Isolamento multi-tenant |
| `tests/metricas/exemplo-conta.test.ts` | Criar | Base de métricas (virada 5h, taxa separada) |
| `types/database.types.ts` | Gerar | Tipos do banco |

---

## Tarefa 1: Inicializar projeto Next.js + TypeScript + Tailwind 4 + Biome + Vitest

**Arquivos:** `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `biome.json`, `vitest.config.ts`, `postcss.config.mjs`, `next.config.ts`, `components.json`, `README.md`

**Interfaces:** Consome: nada. Produz: base de build/lint/test.

- [ ] **Passo 1: Criar `package.json`** com dependências e scripts
- [ ] **Passo 2: Criar `tsconfig.json`** (TS estrito com paths `@/*`)
- [ ] **Passo 3: Ajustar `.gitignore`**
- [ ] **Passo 4: Criar `.env.example`**
- [ ] **Passo 5: Criar `biome.json`**
- [ ] **Passo 6: Criar `vitest.config.ts`**
- [ ] **Passo 7: Criar `postcss.config.mjs`**
- [ ] **Passo 8: Criar `next.config.ts`** (cabeçalhos de segurança)
- [ ] **Passo 9: Criar `components.json`**
- [ ] **Passo 10: Criar a pasta `app/` (mínima para o build)**
- [ ] **Passo 11: `npm i`**
- [ ] **Passo 12: Ajustar `README.md` (seção "Rodar localmente")**
- [ ] **Passo 13: Verificação** `npx tsc --noEmit`, `npm run check`, `npm run build`
- [ ] **Passo 14: Commit** em PT-BR imperativo, sem `git add -A`

---

## Tarefa 2: Tokens de marca, estilos globais, layout base, logger, formatos e clientes Supabase

**Arquivos:** `app/styles/tokens.css`, `app/styles/brand.css`, `app/globals.css`, `app/layout.tsx`, `app/manifest.webmanifest`, `lib/logger.ts`, `lib/format/dinheiro.ts`, `lib/format/data.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/service.ts`, `lib/auth/guards.ts`, `tests/design-tokens.test.ts`

**Interfaces:** Consome: T1. Produz: tokens/brand, 3 clientes Supabase, logger sem PII, utilitários dinheiro/data, guards base.

- [ ] **Passo 1: Criar `app/styles/tokens.css`**
- [ ] **Passo 2: Criar `app/styles/brand.css`**
- [ ] **Passo 3: Criar `app/globals.css`** (importa tokens + brand + Tailwind 4)
- [ ] **Passo 4: Criar `app/layout.tsx`** (fontes locais via `next/font/local`)
- [ ] **Passo 5: Criar `app/manifest.webmanifest`**
- [ ] **Passo 6: Criar `lib/logger.ts`** (sem PII)
- [ ] **Passo 7: Criar `lib/format/dinheiro.ts`** (Decimal, string BRL)
- [ ] **Passo 8: Criar `lib/format/data.ts`** (fuso do restaurante)
- [ ] **Passo 9: Criar `lib/supabase/client.ts`** (browser)
- [ ] **Passo 10: Criar `lib/supabase/server.ts`** (SSR)
- [ ] **Passo 11: Criar `lib/supabase/service.ts`** (service role, só servidor)
- [ ] **Passo 12: Criar `lib/auth/guards.ts`**
- [ ] **Passo 13: Criar `tests/design-tokens.test.ts`**
- [ ] **Passo 14: Verificação** `tsc --noEmit`, `check`, `test`, `build`
- [ ] **Passo 15: Commit** em PT-BR imperativo

---

## Tarefa 3: Supabase local, config.toml e migration da fundação (8 tabelas + RLS + processar_envio)

**Arquivos:** `supabase/config.toml`, `supabase/.gitignore`, `supabase/migrations/20261009120000_fundacao_esquema.sql`, `types/database.types.ts` (gerado)

**Interfaces:** Consome: T1–T2. Produz: esquema completo, RLS, helpers `tem_acesso`/`eh_admin_repply`, `processar_envio`, `atualizar_estados`, `recalcular_dia_operacao`, `atualizar_turnos`, triggers.

- [ ] **Passo 1: Criar `supabase/.gitignore`**
- [ ] **Passo 2: Criar `supabase/config.toml`** com `verify_jwt = false` comentado em `receber-envio`
- [ ] **Passo 3: Escrever a migration** com as 8 tabelas (`restaurantes`, `acessos`, `admins_repply`, `tokens_envio`, `envios`, `sinal_de_vida`, `entradas`, `metas`), índices, triggers (`set_updated_at`, imutabilidade de `restaurante_id`), helpers e `processar_envio` (advisory lock, normalização, upsert por `hash_origem`, reconciliação por `removida_em`, contagens, resposta jsonb), RLS + políticas em todas as tabelas
- [ ] **Passo 4: Iniciar Supabase local** `npx supabase start`
- [ ] **Passo 5: Aplicar migrations** `npx supabase db reset`
- [ ] **Passo 6: Gerar tipos** `npm run types`
- [ ] **Passo 7: Verificação** `tsc --noEmit`, `check`
- [ ] **Passo 8: Commit** em PT-BR imperativo

---

## Tarefa 4: Edge Function `receber-envio` (Deno)

**Arquivos:** `supabase/functions/receber-envio/index.ts`, `lib/validators/recepcao.ts`

**Interfaces:** Consome: T3 (função DB). Produz: endpoint HTTP POST que autentica, descarta PII, valida, chama `processar_envio` e responde.

- [ ] **Passo 1: Criar `lib/validators/recepcao.ts`** (Zod: `versao_formato = 1`, `modo = "janela"`, janela, lote 1/1, ≤ 2000 entradas, campos obrigatórios)
- [ ] **Passo 2: Escrever a função**: 405 (método), 413 (tamanho), 401 (token), 429 (ritmo 20 s), 400 (JSON), remoção de PII antes de validar e antes do payload, 422 (schema, com `erros`), RPC `processar_envio`, 500 curto, 200 com contagens/`janela_confirmada`/`proximo_envio_em_segundos`/`reenviar_desde`
- [ ] **Passo 3: Testar localmente** `npx supabase functions serve receber-envio`
- [ ] **Passo 4: Verificação** `tsc --noEmit`, `check`
- [ ] **Passo 5: Commit** em PT-BR imperativo

---

## Tarefa 5: Gerador de dados fictícios (envia pelo mesmo caminho HTTP)

**Arquivos:** `scripts/gerador-dados-ficticios.ts`

**Interfaces:** Consome: T4 (endpoint). Produz: simulador do SCC.

- [ ] **Passo 1: Escrever o gerador**: lê token/URL, gera meses realistas (almoço/jantar, pico sexta/sábado, abertas agora, esquecidas, descontos, garçons), envelope v1 formato do contrato, POST com Bearer, carga inicial em janelas de 7 dias e depois ciclos de ~5 min, modo "parar"
- [ ] **Passo 2: Documentar uso no README**
- [ ] **Passo 3: Verificação** `tsc --noEmit`
- [ ] **Passo 4: Commit** em PT-BR imperativo

---

## Tarefa 6: Testes de recepção (§4) + testes de isolamento RLS

**Arquivos:** `tests/recepcao/envio.test.ts`, `tests/isolamento/rls.test.ts`, `tests/metricas/exemplo-conta.test.ts`

**Interfaces:** Consome: T3–T4. Produz: suíte Vitest verde.

- [x] **Passo 1: Escrever `tests/recepcao/envio.test.ts`** cobrindo todos os casos da §4
- [x] **Passo 2: Escrever `tests/isolamento/rls.test.ts`** (A não lê B, zero linhas ≠ sucesso, admin lê painel do cliente, `restaurante_id` imutável)
- [x] **Passo 3: Criar `tests/metricas/exemplo-conta.test.ts`** (virada 5h, taxa separada) como base
- [x] **Passo 4: Rodar `npm run test`** até tudo verde
- [x] **Passo 5: Commit** em PT-BR imperativo

---

## Tarefa 7: Verificação final (tipos, lint, testes, build) + documentação

- [x] **Passo 1: `npx tsc --noEmit`** → 0 erros
- [x] **Passo 2: `npm run check`** → sem erros
- [x] **Passo 3: `npm run test`** → Vitest 100% verde
- [x] **Passo 4: `npm run build`** → build completa
- [x] **Passo 5: Conferir `.env.example`**
- [x] **Passo 6: Conferir RLS no mesmo arquivo da migration**
- [x] **Passo 7: Conferir remoção de PII antes de validar/salvar**
- [x] **Passo 8: Conferir o gerador enviando por HTTP**
- [x] **Passo 9: Commit local final; push pendente de autorização**

---

## Critérios de Aceite (Fundação)

- [x] Projeto Next.js compila, TS estrito sem erros, Biome OK, Vitest verde.
- [x] Tokens de marca + teste de contraste passam.
- [x] 8 tabelas com RLS habilitado **no mesmo arquivo** de migration.
- [x] Helpers `tem_acesso`, `eh_admin_repply`, triggers `updated_at` e imutabilidade.
- [x] `processar_envio()` em transação, upsert por hash, reconciliação, contagens corretas.
- [x] `receber-envio`: remove PII antes de validar/payload, 401/413/422/429/500 corretos.
- [x] Testes de recepção (§4) e de isolamento RLS passam.
- [x] Gerador envia pelo mesmo caminho HTTP com Bearer token.
- [x] `types/database.types.ts` gerado e compila.
- [x] Sem `any`, sem PII em log/payload, dinheiro em `numeric`, migrations só acrescentam.
