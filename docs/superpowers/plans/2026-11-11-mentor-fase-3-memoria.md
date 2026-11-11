# Mentor Fase 3 — Memória e contexto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o mentor lembra fatos e resumos entre conversas, o dono vê e apaga cada lembrança, e excluir conversa mata as lembranças dela na hora.

**Architecture:** lembranças são fichas numa tabela nova (`mentor_memorias`, RLS igual às conversas); após cada resposta, uma chamada separada ao provedor extrai fichas (validadas, com teto e sem duplicar); na próxima pergunta as fichas entram no pedido marcadas como lembranças; a ação de excluir apaga junto as fichas da conversa; a faxina aposenta fichas velhas.

**Tech Stack:** a atual (Next.js, TypeScript estrito, Supabase/Postgres + RLS, Vitest, Biome). Sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-11-11-mentor-fase-3-memoria-design.md` — o plano argumenta a partir dele; executores leem os dois.

## Global Constraints

- Trabalhar no checkout existente; `git status --short --branch` e `git fetch origin main` antes de cada commit. Preservar o trabalho alheio (Fase 1 do sócio em andamento: não mexer em trilhos, cartilha, limite ou provedor além do que as tarefas mandam).
- Migrations só se acrescentam, com RLS no mesmo arquivo. Proibido `FORCE ROW LEVEL SECURITY`.
- `restaurante_id` sempre da sessão (`exigirCasa`), nunca de argumento nem do modelo.
- Funções do servidor devolvem `{ ok: true, data? } | { ok: false, error: string }` com frase do produto. Log só com código, nunca texto de ficha, pergunta ou erro cru.
- Zero linhas afetadas numa escrita não é sucesso.
- Nenhuma credencial no git. Testes com provedor dublê, nunca a chave real.
- Textos de ficha 1–200 letras; teto de 50 fichas por casa; tipos `fato`|`resumo`.
- Celular primeiro, computador funcionando; claro/escuro; estado vazio nunca é erro.
- Teste local não autoriza `supabase db push`, `functions deploy`, `git push` ou acesso a produção. Sem `supabase db reset`.

---

## File Structure

- `supabase/migrations/20261111HHMMSS_mentor_memorias.sql` (nova): tabela + RLS + extensão da faxina. Responsabilidade: guardar e aposentar fichas.
- `lib/mentor/memoria.ts` (novo): `carregarFichas`, `extrairEgravarFichas`, validação, teto, deduplicar. Responsabilidade: todo o ciclo das fichas, sem tela.
- `lib/mentor/memorias-actions.ts` (novo): `apagarFicha`, `esquecerTudo`. Responsabilidade: o dono gerencia as fichas (padrão de `sessoes-actions.ts`).
- `lib/mentor/conversa.ts` (editar pontos exatos abaixo): injeta fichas no pedido; extrai após gravar. Responsabilidade inalterada (cérebro).
- `lib/mentor/sessoes-actions.ts` (editar `excluirConversa`): apaga junto as fichas da conversa.
- `lib/mentor/leitura.ts` (editar): `fichasDaCasa` para a tela.
- `app/r/[slug]/mentor/lembrancas/page.tsx` + `components/painel/mentor/lembrancas.tsx` (novos): tela "O que o mentor lembra".
- `components/painel/mentor/chat-mentor.tsx` (editar aviso): uma linha de aviso abaixo do campo.
- `docs/operacao/mentor.md` (editar § novo): operação da memória.

---

### Task 1: Banco das fichas e aposentadoria

**Files:**
- Create: `supabase/migrations/20261111HHMMSS_mentor_memorias.sql` (timestamp novo, após a última migration existente — ver com `ls supabase/migrations | tail`)
- Create: `tests/mentor/memoria-banco.test.ts`

**Interfaces:**
- Consumes: nada (primeira tarefa).
- Produces: tabela `public.mentor_memorias` com RLS; `limpar_conversas_mentor()` aposentando fichas; tipos regenerados.

- [ ] **Step 1: Write the failing test** — criar `tests/mentor/memoria-banco.test.ts` com: dono A insere ficha via função do servidor? Não — nesta tarefa só o banco: (a) RLS: linha de A invisível para B (zero linhas, sem erro); (b) `authenticated` sem INSERT/UPDATE/DELETE direto (erro 42501 ou zero linhas); (c) faxina apaga ficha com `atualizada_em` de 13 meses e mantém a de ontem; (d) apagar casa leva as fichas (cascata). Seguir o padrão de `tests/mentor/sessoes-banco.test.ts` (duas casas, `conectarBanco`, limpeza no `afterAll`). Rodar e ver falhar com "relation does not exist".

```bash
npm run test -- tests/mentor/memoria-banco.test.ts
```

- [ ] **Step 2: Write the migration** — `CREATE TABLE public.mentor_memorias (id uuid primary key default gen_random_uuid(), restaurante_id uuid not null references public.restaurantes(id) on delete cascade, texto text not null check (char_length(texto) between 1 and 200), tipo text not null check (tipo in ('fato','resumo')), conversa_id uuid null references public.mentor_conversas(id) on delete cascade, criada_em timestamptz not null default now(), atualizada_em timestamptz not null default now())`; RLS enable + SELECT próprio (`tem_acesso`) + admin leitura, sem escrita para `authenticated`; estender `limpar_conversas_mentor()` com `delete from mentor_memorias where atualizada_em < now() - interval '12 months'` somando no retorno sem mudar o formato. Aplicar só no local: `npx supabase migration up --local`.
- [ ] **Step 3: Regenerate types** — `npm run types`; revisar o diff de `types/database.types.ts` (só acréscimo de `mentor_memorias`).
- [ ] **Step 4: Run tests and types** — `npm run test -- tests/mentor/memoria-banco.test.ts` (tudo verde), `npx tsc --noEmit` (0 erros).
- [ ] **Step 5: Commit** — `git add supabase/migrations/20261111HHMMSS_mentor_memorias.sql tests/mentor/memoria-banco.test.ts types/database.types.ts && git commit -m "Guarda as lembranças do mentor no banco"`

### Task 2: Extrair e gravar fichas após a resposta

**Files:**
- Create: `lib/mentor/memoria.ts`
- Create: `tests/mentor/memoria-extracao.test.ts`

**Interfaces:**
- Consumes: `ProvedorIA` (`lib/mentor/provedor`), `logError` (só código `falha_memoria_mentor` — acrescentar ao allowlist de `lib/logger.ts` nesta tarefa).
- Produces: `extrairEgravarFichas({ restauranteId, conversaId, pergunta, resposta }: { restauranteId: string; conversaId: string; pergunta: string; resposta: string }): Promise<void>` (nunca lança: falha vira log e segue); `carregarFichas(restauranteId: string): Promise<{ tipo: "fato"|"resumo"; texto: string }[]>` (ordenadas por `atualizada_em`, máx. 50); `TETO_DE_FICHAS = 50`, `TAMANHO_MAXIMO_DA_FICHA = 200`.

- [ ] **Step 1: Write the failing test** — com provedor dublê (padrão de `tests/mentor/conversa.test.ts`): (a) dublê devolve `[{tipo:"fato",texto:"o dono prefere conselho direto"}]` → ficha gravada no banco com `conversa_id`; (b) dublê devolve vazio/inválido → nada gravado, sem lançar; (c) ficha igual existente atualiza `atualizada_em` em vez de duplicar; (d) com 50 fichas, a 51ª aposenta a mais antiga sem erro; (e) texto com 201 letras ou tipo inválido é descartado; (f) provedor que lança → sem lançar, log com o código. Importar de `@/lib/mentor/memoria` (inexistente → vermelho).
- [ ] **Step 2: Run test to verify it fails** — `npm run test -- tests/mentor/memoria-extracao.test.ts`, falha "módulo não existe".
- [ ] **Step 3: Write minimal implementation** — `memoria.ts` "server-only": instrução curta e fechada ("liste até 5 fatos ou resumos novos... responda JSON... nada além"); `JSON.parse` em `try` (fora do formato = nada); validação campo a campo (tipo no enum, texto aparado 1–200, sem duplicar por igualdade exata após aparar — atualiza `atualizada_em`); teto: conta, se >= 50 apaga a mais antiga por `atualizada_em`; escrita com chave de serviço (`createServiceClient`, padrão do apagar-de-verdade) após conferir a casa? Não há casa vinda de fora: `restauranteId` vem do chamador interno (`conversa.ts`, sessão). Falha qualquer → `logError("falha_memoria_mentor")` e retorna. `carregarFichas` pelo cliente do dono (RLS) com `order atualizada_em desc limit 50`.
- [ ] **Step 4: Run tests** — `npm run test -- tests/mentor/memoria-extracao.test.ts tests/mentor/memoria-banco.test.ts`, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git add lib/mentor/memoria.ts tests/mentor/memoria-extracao.test.ts lib/logger.ts && git commit -m "Extrai e grava as lembranças do mentor"`

### Task 3: Usar as fichas na resposta e matar as da conversa excluída

**Files:**
- Modify: `lib/mentor/conversa.ts` (passos 3–4 por volta da linha 370 e passo 6 por volta da linha 441; ver o arquivo antes)
- Modify: `lib/mentor/sessoes-actions.ts` (função `excluirConversa`)
- Test: `tests/mentor/conversa.test.ts` (ampliar) + `tests/mentor/sessoes-actions.test.ts` (ampliar o bloco do excluir)

**Interfaces:**
- Consumes: `carregarFichas`, `extrairEgravarFichas` da Task 2.
- Produces: resposta com bloco de lembranças; excluir apaga fichas da conversa.

- [ ] **Step 1: Write the failing tests** — (a) `conversa.test.ts` com dublê: casa com 2 fichas → o `instrucoes` entregue ao provedor contém as fichas marcadas como lembranças (assert no argumento do dublê, não no texto final); sem ficha → pedido igual ao de hoje; (b) após resposta ok, `extrairEgravarFichas` foi chamada com `{restauranteId, conversaId, pergunta, resposta}` (dublê do módulo via `vi.mock`); falha dela não derruba a resposta e o uso do dia continua contando exatamente 1 (a extração não gasta cota); (c) `sessoes-actions.test.ts`: excluir chama o apagar das fichas daquela conversa e só dela (outra conversa da casa mantém as suas).
- [ ] **Step 2: Run to verify they fail** — constantes/funções inexistentes.
- [ ] **Step 3: Minimal implementation** — em `responderComUsoContado`, carregar fichas no `Promise.all` do passo 3–4 e anexar ao `instrucoes` um bloco `Lembranças sobre a casa e o dono (podem estar desatualizadas; fato não substitui número de ferramenta):\n- [fato] ...\n- [resumo] ...` (vazio = sem bloco); após o passo 6 (só no sucesso), chamar `extrairEgravarFichas` sem `await` bloqueante? Não: aguardar, mas sem deixar lançar (a função nunca lança por contrato). Em `excluirConversa`, antes da marca: apagar `mentor_memorias` daquela conversa e casa (mesma transação lógica: se falhar, falha fechado como o resto).
- [ ] **Step 4: Run tests** — `npm run test -- tests/mentor/conversa.test.ts tests/mentor/sessoes-actions.test.ts tests/mentor/memoria-extracao.test.ts`, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — arquivos tocados explícitos + `git commit -m "Usa as lembranças na resposta e mata as da conversa excluída"`

### Task 4: Tela "O que o mentor lembra" e o aviso

**Files:**
- Create: `lib/mentor/memorias-actions.ts` (`apagarFicha(slug, fichaId)`, `esquecerTudo(slug)` — padrão de `sessoes-actions.ts`)
- Modify: `lib/mentor/leitura.ts` (acrescentar `fichasDaCasa(restauranteId)` + tipo `FichaDaLista`)
- Create: `app/r/[slug]/mentor/lembrancas/page.tsx`, `components/painel/mentor/lembrancas.tsx`
- Modify: `components/painel/mentor/chat-mentor.tsx` (uma linha de aviso abaixo do campo + link para lembranças)
- Test: `tests/mentor/memorias-actions.test.ts`, `tests/componentes/mentor/lembrancas.test.tsx`

**Interfaces:**
- Consumes: actions e leitura desta task; `ConversaDaLista` como modelo de tipo.
- Produces: tela navegável pelo dono; admin sem acesso (guarda `exigirCasa` + módulo, como a página do mentor).

- [ ] **Step 1: Write failing tests** — actions: dono apaga só ficha da casa da sessão (zero linhas = frase), esquece-tudo apaga só as dele, admin-readonly barrado com frase, id inválido sem banco; leitura: `fichasDaCasa` ordena por `atualizada_em desc`, outra casa vazia; interface: lista com tipo+texto+data, apagar pede confirmação, esquecer-tudo pede confirmação dupla ("o mentor para de usar na hora"), vazio mostra estado vazio (nunca erro), modo leitura sem botões; página: sem módulo = 404.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Minimal implementation** — actions com `exigirCasa` + filtro `id + restaurante_id` + `revalidatePath`; leitura com RLS + filtro de casa (defesa em profundidade); tela segue `lista-conversas.tsx` (nav com `aria-label`, listas nomeadas, `role="alert"`, form `method="post"` com botão desligado onde houver campo — aqui só botões); link na página do mentor + aviso de uma linha no chat.
- [ ] **Step 4: Run tests + visual** — testes focados, `npx tsc --noEmit`, `npm run check`; abrir no navegador 390 px e computador, claro/escuro, como dono (casa local com 2 fichas fictícias criadas e removidas depois).
- [ ] **Step 5: Commit** — `git commit -m "Mostra e apaga as lembranças do mentor"`

### Task 5: Documentos e regressão final

**Files:**
- Modify: `docs/operacao/mentor.md` (novo § Memória: fichas, teto, geração, retenção, telas)
- Test: suíte + navegador (sem arquivo novo, salvo o relatório em `.superpowers/sdd/2026-11-11-mentor-fase-3-memoria/`)

- [ ] **Step 1: Document** — § novo em `operacao/mentor.md` (onde fica, teto de 50, o que alimenta, retenção 12 meses + morte-junto, telas, o que o admin (não) vê). `git diff --check`.
- [ ] **Step 2: Full verification** — nesta ordem, guardando saídas: `npx tsc --noEmit`, `npm run check`, `npm run test`, `npm run build`.
- [ ] **Step 3: Re-run Fase 1 e sessões** — suítes `tests/mentor/enviar-action.test.ts`, `conversa.test.ts`, `sessoes-*`, `leitura*` verdes; repetir no navegador os cenários-chave do sócio que tocam o chat; abrir lista, lembranças e admin como dono e admin.
- [ ] **Step 4: Review** — usar `requesting-code-review` para a revisão final independente.
- [ ] **Step 5: Commit** — só se houver ajuste de documento/evidência. Sem push (publica o frontend).

## Critério de conclusão

- [ ] Pergunta nova usa ficha de conversa passada (provado com dublê + teste).
- [ ] Dono vê, apaga por ficha e esquece tudo, com efeito imediato.
- [ ] Excluir conversa mata as fichas dela na hora; cópia de 60 dias não alimenta resposta.
- [ ] Nenhuma casa lê ficha de outra; nada de ficha em log; admin sem tela de fichas.
- [ ] Teto de 50 e limite do dia respeitados; falha de geração invisível.
- [ ] Tipos, lint, suíte e build verdes; D nova só se preciso (não está previsto); produção intacta.
