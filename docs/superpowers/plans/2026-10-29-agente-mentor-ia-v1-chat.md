# Agente mentor de IA (v1: chat) — plano de execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um mentor de IA no painel do dono que conversa em português, lê os números reais da casa (tool-use nas `metrica_*`) e interpreta + aconselha, com os trilhos de segurança; controlado por uma cartilha global da Repply, que também lê as conversas.

**Architecture:** o dono conversa numa aba nova ("Mentor"). Uma função do servidor (o "cérebro") monta cartilha + trilhos + histórico + ferramentas, chama o **provedor de IA (Gemini, trocável por uma interface)**, executa os pedidos de ferramenta rodando as `metrica_*` **com o `restaurante_id` da sessão** (nunca do modelo), repete até a resposta e grava tudo. A Repply, no admin, edita a cartilha e lê as conversas (só leitura). Isolamento por RLS em todas as tabelas.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript estrito, Supabase (Postgres + RLS + pg_cron), `@google/genai` (SDK do Gemini), Vitest, Biome.

**Spec:** [docs/superpowers/specs/2026-10-29-agente-mentor-ia-design.md](../specs/2026-10-29-agente-mentor-ia-design.md) — o plano argumenta a partir dele; leia os dois.

## Global Constraints

- **Idioma:** domínio em PT-BR (tabelas `mentor_*`, colunas, funções SQL `snake_case`); termos técnicos genéricos em inglês. Respostas ao cliente sempre em PT-BR.
- **Isolamento (crítico):** o `restaurante_id` das ferramentas vem SEMPRE da sessão (`exigirCasa`), NUNCA de nada que o modelo diga. RLS (`tem_acesso(restaurante_id)`) em toda tabela de dado de restaurante. Teste de isolamento obrigatório.
- **Função SQL nova nasce fechada:** `grant execute` explícito na própria migration + entra na lista de `tests/isolamento/funcoes-fechadas.test.ts`. Proibido `FORCE ROW LEVEL SECURITY`.
- **Migrations só se acrescentam** (`supabase/migrations/AAAAMMDDHHmmss_<tema>.sql`); a migration vai no mesmo commit da funcionalidade.
- **Funções do servidor** devolvem `{ ok: true, data? } | { ok: false, error: string }`, `error` é frase de produto (nunca `error.message` do Postgres); log só com código (`logError`).
- **Nada pessoal ao modelo:** só números de negócio (via ferramentas) + cartilha + mensagens do dono. Nenhum `any` (TS estrito).
- **Segredo:** a chave da API do provedor fica em variável de ambiente sem `NEXT_PUBLIC_`; nunca no git.
- **Interface (D-39):** toda tela funciona em celular (390 px) e computador; tema claro e escuro; estado vazio.
- **Commits** em PT-BR, imperativo; trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. `git fetch` antes de commitar; nunca `git add -A`/`--force`/`--no-verify`. Push só com o ok do Lucas Ferreira.
- **Provedor padrão:** Gemini, mas atrás da interface `ProvedorIA` (trocável). Nos testes, um dublê — nunca chamar a API de verdade.

---

## Mapa de arquivos

**Banco (migrations, cada uma com RLS/grants no mesmo arquivo):**
- `supabase/migrations/<ts>_mentor_conversas.sql` — tabelas `mentor_conversas`, `mentor_mensagens` + RLS.
- `supabase/migrations/<ts>_mentor_cartilha_uso.sql` — `mentor_cartilhas` (global), `mentor_uso` (limite), funções `mentor_cartilha_ativa()`, `mentor_registrar_uso(uuid)` + RLS/grants + cartilha-semente.
- `supabase/migrations/<ts>_mentor_retencao.sql` — rotina pg_cron que apaga conversas/mensagens com +12 meses.

**Servidor / lib:**
- `lib/mentor/provedor/tipos.ts` — a interface `ProvedorIA` e os tipos de mensagem/ferramenta.
- `lib/mentor/provedor/gemini.ts` — implementação Gemini da interface.
- `lib/mentor/provedor/index.ts` — escolhe o provedor pela env (padrão Gemini).
- `lib/mentor/ferramentas.ts` — catálogo de ferramentas (as `metrica_*`) + executor seguro.
- `lib/mentor/trilhos.ts` — o texto fixo dos trilhos (prefixo do sistema).
- `lib/mentor/conversa.ts` — o laço do agente (monta, chama provedor, executa ferramentas, grava).
- `lib/mentor/limite.ts` — checa/registra o teto diário por restaurante.
- `lib/mentor/leitura.ts` — leitura das conversas/mensagens (dono e admin).
- `lib/mentor/cartilha.ts` — leitura/escrita da cartilha (admin).
- `lib/mentor/tipos.ts` — tipos compartilhados (Conversa, Mensagem, PapelMensagem).

**Telas:**
- `app/r/[slug]/mentor/page.tsx` — a aba do dono (lista + histórico).
- `components/painel/mentor/` — o chat (lista de mensagens, campo, aviso de privacidade, estado vazio).
- `app/r/[slug]/mentor/enviar.ts` ou uma Server Action em `lib/mentor/enviar-action.ts` — recebe a mensagem, chama o cérebro, devolve a resposta.
- `app/admin/mentor/page.tsx` — editor da cartilha + atalho para conversas.
- `app/admin/mentor/conversas/` — lista e leitura das conversas (admin, só leitura).
- Menu: `components/painel/moldura-painel.tsx` (ou onde vivem os destinos) — adicionar o 4º item "Mentor".

**Docs/decisões:** `docs/operacao/mentor.md`, `docs/decisoes.md` (D-71+), `README.md`, `SPEC.md`, `docs/divida-tecnica.md`.

---

### Task 1: Banco — conversas e mensagens (com RLS)

**Files:**
- Create: `supabase/migrations/<ts>_mentor_conversas.sql`
- Modify: `tests/isolamento/funcoes-fechadas.test.ts` (nada novo de função aqui; só se criar função)
- Test: `tests/mentor/conversas-isolamento.test.ts`

**Interfaces:**
- Produces: tabelas `mentor_conversas(id uuid pk, restaurante_id uuid, titulo text, criada_em timestamptz, ultima_em timestamptz)` e `mentor_mensagens(id uuid pk, conversa_id uuid, restaurante_id uuid, papel text check in ('dono','mentor'), texto text, ferramentas_usadas jsonb, criada_em timestamptz)`.

- [ ] **Step 1: Escreva o teste de isolamento (falha)** — em `tests/mentor/conversas-isolamento.test.ts`, no padrão de `tests/admin/acoes-contra-o-banco.test.ts` (banco local, dois logins reais). Crie duas casas (A, B), um dono de A; insira uma conversa + mensagem em A pelo cliente logado do dono; afirme: (a) o dono de A lê a própria conversa/mensagem; (b) um cliente logado SEM acesso a A recebe 0 linhas ao consultar as de A (RLS); (c) o cliente do admin lê as de A (RLS de leitura do admin).

- [ ] **Step 2: Rode e veja falhar** — `npm run test -- tests/mentor/conversas-isolamento.test.ts` → falha (tabelas não existem).

- [ ] **Step 3: Escreva a migration** — crie as duas tabelas. RLS idêntica ao padrão de `entradas` (veja `supabase/migrations/20261009120000_fundacao_esquema.sql`): `restaurante_id uuid not null references public.restaurantes(id) on delete cascade`; `enable row level security`; política de select/insert/update usando `public.tem_acesso(restaurante_id)` para o dono, e a leitura do admin pela mesma política de leitura usada em `entradas`/`sinal_de_vida` (admin lê tudo). Índices: `(restaurante_id, ultima_em desc)` em conversas e `(conversa_id, criada_em)` em mensagens.

- [ ] **Step 4: Aplique no banco local e rode o teste** — `npx supabase migration up --local` (ou `db reset`), depois o teste → passa.

- [ ] **Step 5: Commit** — `git add supabase/migrations/<ts>_mentor_conversas.sql tests/mentor/conversas-isolamento.test.ts && git commit` ("Cria as tabelas de conversas do mentor com RLS").

---

### Task 2: Banco — cartilha global, limite de uso e funções auxiliares

**Files:**
- Create: `supabase/migrations/<ts>_mentor_cartilha_uso.sql`
- Modify: `tests/isolamento/funcoes-fechadas.test.ts`
- Test: `tests/mentor/cartilha-uso.test.ts`

**Interfaces:**
- Produces: `mentor_cartilhas(id, texto, ativa boolean, criada_em, criada_por uuid)`; `mentor_uso(restaurante_id, dia date, contagem int, pk(restaurante_id,dia))`; função `mentor_cartilha_ativa() returns text` (security definer, só admin + service); função `mentor_registrar_uso(p_restaurante_id uuid) returns int` (incrementa e devolve a contagem do dia; security invoker, roda sob RLS).

- [ ] **Step 1: Teste (falha)** — em `tests/mentor/cartilha-uso.test.ts` (banco local): (a) `mentor_cartilha_ativa()` devolve a cartilha-semente; editar = inserir nova `ativa=true` e `ativa=false` na anterior, e a função passa a devolver a nova; (b) `mentor_registrar_uso` incrementa por dia e por restaurante, isolado; (c) um login comum NÃO consegue ler `mentor_cartilhas` (só admin/service).
- [ ] **Step 2: Rode e veja falhar.**
- [ ] **Step 3: Migration** — crie as tabelas; `mentor_cartilhas` com RLS que só o admin lê/escreve (padrão da leitura do admin); insira uma **cartilha-semente** (texto inicial do mentor: tom acolhedor, foco em restaurante, segue os trilhos — ~1 parágrafo); `mentor_uso` com RLS `tem_acesso`; as duas funções com `grant execute` explícito (`mentor_cartilha_ativa` para `authenticated` só se o cérebro a chamar pelo login — senão, chamada pelo service; `mentor_registrar_uso` para `authenticated`).
- [ ] **Step 4: Registre as funções em `funcoes-fechadas.test.ts`** — adicione `mentor_cartilha_ativa()` e `mentor_registrar_uso(uuid)` à lista `abertas` com os grants certos; rode `tests/isolamento/funcoes-fechadas.test.ts` → passa.
- [ ] **Step 5: Aplique e rode os testes** → passam.
- [ ] **Step 6: Commit** ("Cria a cartilha, o limite de uso e as funções do mentor").

---

### Task 3: Provedor de IA — interface e implementação Gemini

**Files:**
- Create: `lib/mentor/provedor/tipos.ts`, `lib/mentor/provedor/gemini.ts`, `lib/mentor/provedor/index.ts`
- Test: `tests/mentor/provedor.test.ts`
- Modify: `package.json` (dependência `@google/genai`)

**Interfaces:**
- Produces:
  ```ts
  // lib/mentor/provedor/tipos.ts
  export type MensagemIA = { papel: "dono" | "mentor"; texto: string };
  export type DefinicaoFerramenta = { nome: string; descricao: string; parametros: Record<string, unknown> }; // JSON Schema
  export type PedidoFerramenta = { nome: string; argumentos: Record<string, unknown> };
  export type RespostaIA = { tipo: "texto"; texto: string } | { tipo: "ferramenta"; pedidos: PedidoFerramenta[] };
  export type ResultadoFerramenta = { nome: string; resultado: unknown };
  export interface ProvedorIA {
    responder(entrada: {
      instrucoes: string;            // trilhos + cartilha
      historico: MensagemIA[];       // a conversa até aqui
      ferramentas: DefinicaoFerramenta[];
      resultados?: ResultadoFerramenta[]; // devoluções de ferramenta da rodada anterior
    }): Promise<RespostaIA>;
  }
  ```
- Consumes: nada (camada mais baixa).

- [ ] **Step 1: Teste (falha)** — `tests/mentor/provedor.test.ts`: um dublê de `ProvedorIA` e um teste de contrato leve (dado histórico, devolve `RespostaIA`); e um teste de `escolherProvedor()` (index) que, sem a env da API, devolve um provedor que lança erro claro ao ser chamado (não quebra o build).
- [ ] **Step 2: Rode e veja falhar.**
- [ ] **Step 3: Implemente** — `tipos.ts` (acima); `gemini.ts` usa `@google/genai` (fixe a versão exata ≥ 2 semanas; confirme a forma de function-calling do SDK no `node_modules`/docs ao implementar): mapeia `instrucoes`→systemInstruction, `historico`→contents, `ferramentas`→tools(functionDeclarations), e a resposta do modelo → `RespostaIA` (texto ou `functionCall`s). Lê a chave de `process.env.MENTOR_IA_CHAVE` e o modelo de `process.env.MENTOR_IA_MODELO` (padrão um modelo Gemini Flash). `index.ts`: `escolherProvedor()` lê `MENTOR_IA_PROVEDOR` (padrão "gemini").
- [ ] **Step 4: Rode os testes** (com dublê) → passam. `npx tsc --noEmit` 0.
- [ ] **Step 5: Commit** ("Cria o provedor de IA do mentor (interface + Gemini, trocável)").

---

### Task 4: Ferramentas — as métricas como ferramentas, com executor seguro

**Files:**
- Create: `lib/mentor/ferramentas.ts`
- Test: `tests/mentor/ferramentas.test.ts`

**Interfaces:**
- Consumes: `metrica_*` via `supabase.rpc` (padrão de `lib/metricas/hoje.ts`); `ResultadoFerramenta`, `DefinicaoFerramenta`, `PedidoFerramenta` (Task 3).
- Produces:
  ```ts
  export const FERRAMENTAS: DefinicaoFerramenta[]; // catálogo p/ o provedor
  export async function executarFerramentas(
    pedidos: PedidoFerramenta[],
    restauranteId: string,          // DA SESSÃO, nunca do modelo
  ): Promise<ResultadoFerramenta[]>;
  ```

- [ ] **Step 1: Teste (falha)** — `tests/mentor/ferramentas.test.ts` com um dublê de `createClient` (como `tests/auth/sessao.test.ts`): (a) um pedido "faturamento de hoje" chama `rpc("metrica_faturamento_do_dia", { p_restaurante_id: <o da sessão> })` — afirme que o `p_restaurante_id` é o passado à função, **ignorando** qualquer `restaurante_id` vindo nos `argumentos` do modelo; (b) um pedido de ferramenta inexistente volta um resultado de "ferramenta desconhecida", sem quebrar; (c) erro da rpc vira um resultado de "não consegui esse número", não exceção.
- [ ] **Step 2: Rode e veja falhar.**
- [ ] **Step 3: Implemente** — `FERRAMENTAS`: uma definição por métrica de Hoje e de Resultados (nome em PT, descrição do que responde, parâmetros só os de negócio: período/data quando fizer sentido — NUNCA `restaurante_id`). `executarFerramentas`: para cada pedido, acha a métrica pelo nome, monta os params **injetando `p_restaurante_id: restauranteId`** (o da sessão) + os params do modelo (validados), chama `supabase.rpc`, devolve `{ nome, resultado }` (ou a mensagem de erro amigável). Reusa `createClient()` (JWT do dono → RLS).
- [ ] **Step 4: Rode os testes** → passam.
- [ ] **Step 5: Commit** ("Cria as ferramentas do mentor (métricas) com o restaurante da sessão").

---

### Task 5: Cérebro — o laço do agente (com trilhos, limite e gravação)

**Files:**
- Create: `lib/mentor/conversa.ts`, `lib/mentor/trilhos.ts`, `lib/mentor/limite.ts`, `lib/mentor/tipos.ts`
- Test: `tests/mentor/conversa.test.ts`

**Interfaces:**
- Consumes: `ProvedorIA` (Task 3), `FERRAMENTAS`/`executarFerramentas` (Task 4), `mentor_cartilha_ativa()`/`mentor_registrar_uso()` (Task 2), as tabelas (Task 1).
- Produces:
  ```ts
  export async function responderNoMentor(args: {
    restauranteId: string;
    conversaId: string | null;   // null = nova conversa
    mensagemDoDono: string;
    provedor?: ProvedorIA;        // injetável p/ teste
  }): Promise<{ ok: true; conversaId: string; resposta: string } | { ok: false; error: string }>;
  ```

- [ ] **Step 1: Testes (falham)** — `tests/mentor/conversa.test.ts` com provedor-dublê programável e `executarFerramentas`-dublê: (a) o dublê pede a ferramenta "faturamento" → o cérebro executa, devolve o resultado ao provedor, e grava a resposta final; a mensagem do dono e a do mentor ficam salvas, com `ferramentas_usadas` registrando o que foi puxado; (b) **trilho:** quando o provedor diz que não tem ferramenta/dado, a resposta não inventa número (o cérebro não fabrica dado — ele só repassa); (c) **limite:** se `mentor_registrar_uso` já passou do teto, devolve `{ ok:false, error: "<frase de limite>" }` sem chamar o provedor; (d) provedor lança erro → `{ ok:false, error: "o mentor está indisponível agora, tente de novo" }`, sem vazar erro técnico.
- [ ] **Step 2: Rode e veja falhar.**
- [ ] **Step 3: Implemente** — `trilhos.ts`: o texto fixo dos trilhos (seção 4 do spec). `limite.ts`: `dentroDoLimite(restauranteId)` chamando `mentor_registrar_uso`. `conversa.ts`: checa limite → cria/pega conversa → carrega histórico → `instrucoes = trilhos + cartilha_ativa` → laço: chama `provedor.responder`; se vier `ferramenta`, roda `executarFerramentas(pedidos, restauranteId)` e volta ao provedor com os `resultados`; se vier `texto`, grava as mensagens (dono + mentor, com `ferramentas_usadas`) e retorna. Limite de rodadas de ferramenta (ex.: 5) para não rodar sem fim. Erros → frase de produto + `logError`.
- [ ] **Step 4: Rode os testes** → passam.
- [ ] **Step 5: Commit** ("Cria o cérebro do mentor: laço com ferramentas, trilhos e limite").

---

### Task 6: Chat do dono — a aba "Mentor"

**Files:**
- Create: `app/r/[slug]/mentor/page.tsx`, `app/r/[slug]/mentor/loading.tsx`, `components/painel/mentor/chat-mentor.tsx`, `lib/mentor/enviar-action.ts`, `lib/mentor/leitura.ts`
- Modify: o menu do painel (o componente dos destinos; hoje são 3) para incluir "Mentor"
- Test: `tests/mentor/enviar-action.test.ts`, `tests/componentes/mentor/chat-mentor.test.tsx`

**Interfaces:**
- Consumes: `responderNoMentor` (Task 5), `exigirCasa` (`lib/auth/sessao.ts`), `obterSessao`.
- Produces: Server Action `enviarMensagemAction(slug, conversaId, texto)` que chama `exigirCasa(slug)` (pega `casa.id`), chama `responderNoMentor({ restauranteId: casa.id, ... })` e devolve `{ ok, data: { conversaId, resposta } } | { ok:false, error }`.

- [ ] **Step 1: Testes (falham)** — da action (dublê de `exigirCasa` + `responderNoMentor`, padrão `tests/painel/ajustes-actions.test.ts`): passa o `casa.id` da sessão ao cérebro; erro do cérebro vira `{ ok:false, error }`. Do componente (jsdom): mostra o estado vazio; ao enviar, mostra a mensagem do dono e a resposta; **mostra o aviso** "esta conversa pode ser utilizada para aprimorar a inteligência artificial"; o botão de enviar segue a regra dos formulários (desligado até hidratar, `use-hidratado`).
- [ ] **Step 2: Rode e veja falhar.**
- [ ] **Step 3: Implemente** — `leitura.ts`: `conversasDaCasa(restauranteId)`, `mensagensDaConversa(conversaId, restauranteId)` (via `createClient`, RLS). `enviar-action.ts`: a Server Action acima. `page.tsx`: `exigirCasa(slug)` → mostra as conversas/última; monta `<ChatMentor>`. `chat-mentor.tsx` (client): lista de mensagens + campo + aviso + estado vazio, celular e computador, tema claro/escuro, marca. Adicione "Mentor" como 4º destino no menu (Hoje · Resultados · Mentor · Ajustes).
- [ ] **Step 4: Rode os testes + `tsc` + `biome`** → verdes. Confira no navegador em 390 px e no computador (claro e escuro).
- [ ] **Step 5: Commit** ("Cria a aba Mentor (chat do dono) e o 4º item do menu").

---

### Task 7: Admin — editor da cartilha

**Files:**
- Create: `app/admin/mentor/page.tsx`, `lib/mentor/cartilha.ts`, `lib/mentor/cartilha-actions.ts`
- Test: `tests/mentor/cartilha-actions.test.ts`

**Interfaces:**
- Consumes: `exigirAdmin` (`lib/auth/sessao.ts`), `mentor_cartilha_ativa()`.
- Produces: `cartilhaAtiva()`, e a action `salvarCartilhaAction(texto)` (cria nova versão ativa; só admin).

- [ ] **Step 1: Testes (falham)** — da action (dublê, padrão das actions do admin em `tests/admin/`): só admin salva; salvar insere nova `ativa=true` e desativa a anterior; texto vazio é recusado com frase de produto.
- [ ] **Step 2: Rode e veja falhar.**
- [ ] **Step 3: Implemente** — `cartilha.ts`: leitura da ativa + histórico. `cartilha-actions.ts`: `salvarCartilhaAction` (via `exigirAdmin` + `createServiceClient`/insert com `criada_por`). `page.tsx`: um `<textarea>` com a cartilha ativa + salvar; segue a regra dos formulários do admin (`use-hidratado`), celular e computador.
- [ ] **Step 4: Rode os testes + `tsc` + `biome`.**
- [ ] **Step 5: Commit** ("Cria o editor da cartilha do mentor no admin").

---

### Task 8: Admin — leitura das conversas

**Files:**
- Create: `app/admin/mentor/conversas/page.tsx`, `app/admin/mentor/conversas/[id]/page.tsx`
- Modify: `lib/mentor/leitura.ts` (adicionar a leitura do admin)
- Test: `tests/mentor/leitura-admin.test.ts`

**Interfaces:**
- Consumes: `exigirAdmin`, as tabelas (Task 1, RLS de leitura do admin).
- Produces: `conversasParaAdmin(filtro?)`, `conversaParaAdmin(id)` (só leitura).

- [ ] **Step 1: Testes (falham)** — o admin lê conversas de qualquer casa (RLS de leitura do admin); ninguém escreve por aqui (só leitura).
- [ ] **Step 2: Rode e veja falhar.**
- [ ] **Step 3: Implemente** — a leitura do admin (via `createServiceClient` com filtro explícito por `restaurante_id`, ou o cliente do admin sob a RLS de leitura — seguir o padrão de `lib/admin/`) e as duas páginas (lista + detalhe da conversa), celular e computador, só leitura.
- [ ] **Step 4: Rode os testes + `tsc` + `biome`.**
- [ ] **Step 5: Commit** ("Mostra as conversas do mentor no admin (só leitura)").

---

### Task 9: Retenção, documentação e decisões

**Files:**
- Create: `supabase/migrations/<ts>_mentor_retencao.sql`, `docs/operacao/mentor.md`
- Modify: `docs/decisoes.md` (D-71+), `README.md`, `SPEC.md`, `docs/divida-tecnica.md`
- Test: `tests/mentor/retencao.test.ts` (opcional: afirma que a função de limpeza apaga +12 meses e preserva o resto)

- [ ] **Step 1: Teste da retenção (falha)** — a função de limpeza apaga conversas/mensagens com `criada_em < now() - interval '12 months'` e preserva as recentes.
- [ ] **Step 2: Rode e veja falhar.**
- [ ] **Step 3: Migration de retenção** — função + `cron.schedule` diário (padrão das outras retenções do projeto).
- [ ] **Step 4: Docs e decisões** — `docs/operacao/mentor.md` (o que é, como a Repply edita a cartilha, onde lê as conversas, o provedor/env, o limite); em `docs/decisoes.md` registre **D-71** (mentor de IA: público/escopo/cartilha global/Repply lê para aprimorar a IA/guarda 12 meses) e **D-72** (provedor Gemini como padrão do piloto, código trocável; a IA do produto é conta separada do Claude Code); atualize `README.md`/`SPEC.md` (mentor em construção, Fase 2); anote em `docs/divida-tecnica.md` o que fica para a v2 (avisos proativos: e-mail+app, WhatsApp depois; cartilha por restaurante; relatórios como ferramenta).
- [ ] **Step 5: Rode tudo** — `npx tsc --noEmit`, `npm run check`, `npm run test`, `npm run build`.
- [ ] **Step 6: Commit** ("Fecha o mentor v1: retenção de 12 meses, docs e decisões").

---

## Self-Review

**1. Cobertura do spec:** §1 decisões → Tasks 1–9 + D-71/72 (Task 9). §2 fluxo/segurança → Tasks 4 (restaurante da sessão) e 5 (laço). §3 componentes → o mapa de arquivos cobre todos. §4 trilhos → `lib/mentor/trilhos.ts` (Task 5). §5 modelo de dados → Tasks 1–2 + retenção (9). §6 privacidade → Tasks 4/5 (só número ao modelo), 1 (RLS), 6 (aviso), 9 (12 meses). §7 erro → Task 5. §8 fora de escopo → anotado na Task 9. §9 testes → cada task é TDD; isolamento na Task 1. §10 a confirmar → envs `MENTOR_IA_*` (Task 3), valor do limite (Task 2), streaming (decidir na Task 6). Sem lacunas.

**2. Placeholders:** nenhum "TBD/implementar depois"; os poucos pontos abertos do §10 do spec são padrões configuráveis por env com valor-padrão.

**3. Consistência de tipos:** `ProvedorIA`/`RespostaIA`/`PedidoFerramenta`/`ResultadoFerramenta` (Task 3) são usados igual em 4 e 5; `executarFerramentas(pedidos, restauranteId)` e `responderNoMentor({restauranteId, conversaId, mensagemDoDono, provedor})` batem entre 4→5→6; `restauranteId` (da sessão) é o mesmo nome em toda a cadeia.

**Nota de execução:** este plano mexe em código novo isolado (`lib/mentor/`, `app/r/[slug]/mentor/`, `app/admin/mentor/`, `supabase/migrations/mentor_*`), então convive com o trabalho do Lucas Duarte (relatórios); o único toque compartilhado é o **menu do painel** (4º item) — coordenar com ele. Os testes de banco exigem o Supabase local de pé.
