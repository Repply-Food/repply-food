# Mentor Fase 4 — Anexos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o dono anexa imagem, PDF e planilha à pergunta e o mentor analisa junto do texto.

**Architecture:** arquivos vão para um bucket privado (`mentor-anexos`) com ficha de controle em `mentor_anexos`; a função do servidor valida, sobe em área temporária, vincula após gravar a conversa e entrega os bytes à IA por `inlineData`; excluir conversa apaga arquivos e linhas juntos; a faxina aposenta o que passar de 12 meses.

**Tech Stack:** a atual (Next.js, TypeScript estrito, Supabase/Postgres + RLS + Storage, Vitest, Biome). Sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-11-12-mentor-fase-4-anexos-design.md` — o plano argumenta a partir dele; executores leem os dois.

## Global Constraints

- Trabalhar no checkout existente; `git status --short --branch` e `git fetch origin main` antes de cada commit. Preservar o trabalho alheio (Fase 1 do sócio em andamento: não mexer em trilhos, cartilha, limite, provedor ou memória além do mapeado aqui).
- Migrations só se acrescentam, com RLS no mesmo arquivo. Proibido `FORCE ROW LEVEL SECURITY`.
- `restaurante_id` sempre da sessão (`exigirCasa`), nunca de argumento nem do modelo.
- Funções do servidor devolvem `{ ok: true, data? } | { ok: false, error: string }` com frase do produto. Log só com código novo no allowlist, nunca nome/conteúdo de arquivo, pergunta ou erro cru.
- Zero linhas afetadas numa escrita não é sucesso.
- Nenhuma credencial no git. Testes com provedor dublê e Storage local real, nunca a chave real nem a nuvem.
- Limites exatos: até 5 arquivos por pergunta; 10485760 bytes (10 MiB) cada; tipos imagem (png/jpeg/webp), pdf, planilha (xlsx/csv).
- Celular primeiro, computador funcionando; claro/escuro; vazio nunca é erro.
- Teste local não autoriza `supabase db push`, `functions deploy`, `git push` ou acesso a produção. Sem `supabase db reset`.

---

## File Structure

- `supabase/migrations/20261112HHMMSS_mentor_anexos.sql` (nova): bucket + tabela + RLS + faxina. Responsabilidade: guardar e aposentar arquivos com isolamento.
- `lib/mentor/anexos.ts` (novo): `TIPOS_ANEXO`, `TAMANHO_MAXIMO_ANEXO`, `MAXIMO_ANEXOS_POR_PERGUNTA`, `validarArquivos`, `gravarAnexos`, `urlParaBaixar`, `excluirAnexosDaConversa`. Responsabilidade: todo o ciclo do arquivo, sem tela.
- `lib/mentor/memorias-actions.ts` — não mexer (fichas, não arquivos).
- `lib/mentor/sessoes-actions.ts` (editar `excluirConversa`): apaga arquivos junto. Responsabilidade inalterada.
- `lib/mentor/provedor/tipos.ts` + `gemini.ts` (editar): `AnexoParaIA` e `inlineData`. Responsabilidade inalterada.
- `lib/mentor/conversa.ts` (editar pontos exatos abaixo): recebe anexos, injeta no pedido, vincula após gravar. Responsabilidade inalterada.
- `lib/mentor/enviar-action.ts` (editar `enviarMensagemAction`): 4º parâmetro opcional `arquivos?: File[]`.
- `lib/mentor/anexos-actions.ts` (novo): `baixarAnexo(slug, anexoId)` → `{ ok, url }` (assinada 120 s).
- `lib/mentor/leitura.ts` (editar): `anexosDaConversa(conversaId, restauranteId)`.
- `components/painel/mentor/chat-mentor.tsx` (editar): input de arquivo + lista de anexos + aviso.
- `app/admin/mentor/conversas/[id]/page.tsx` + `components/admin/conversa-do-mentor.tsx` (editar): lista anexos com baixar.
- `scripts/limpar-arquivos-orfaos-mentor.ts` (novo, Tarefa 5): varredura manual de órfãos (dry-run padrão).
- `docs/operacao/mentor.md` (editar § novo, Tarefa 5).

---

## Tarefa 1 — cofre, tabela e faxina

**Arquivos:**
- criar `supabase/migrations/20261112HHMMSS_mentor_anexos.sql` (timestamp novo, após a última migration existente — ver com `ls supabase/migrations | tail -3`);
- criar `tests/mentor/anexos-banco.test.ts`.

**Interfaces produzidas:** bucket `mentor-anexos` privado; tabela `public.mentor_anexos` com RLS; `limpar_conversas_mentor()` estendida; tipos regenerados.

- [ ] Escrever primeiro o teste vermelho (padrão de `tests/mentor/sessoes-banco.test.ts`, com `servico`/anon + `pg`): dono A lê a ficha da casa dele; dono B recebe zero linhas na casa de A; INSERT/UPDATE/DELETE direto recusados para `authenticated` (42501 ou zero linhas + releitura); `storage.from("mentor-anexos").download()` como anônimo/dono nega; faxina apaga linha de 13 meses e mantém a de ontem; apagar conversa/casa leva as linhas junto (cascata). Rodar e ver falhar com `relation does not exist` / bucket inexistente.

```bash
npm run test -- tests/mentor/anexos-banco.test.ts
```

- [ ] Migration append-only com exatamente: `insert into storage.buckets (id, name, public) values ('mentor-anexos','mentor-anexos', false)`; `create table public.mentor_anexos (id uuid primary key default gen_random_uuid(), restaurante_id uuid not null references public.restaurantes(id) on delete cascade, conversa_id uuid null references public.mentor_conversas(id) on delete cascade, nome_original text not null check (char_length(nome_original) between 1 and 120), tipo text not null check (tipo in ('imagem','pdf','planilha')), tamanho_bytes int not null check (tamanho_bytes > 0 and tamanho_bytes <= 10485760), caminho text not null unique, criada_em timestamptz not null default now())`; índice `(restaurante_id, criada_em desc)`; RLS enable + 1 policy SELECT (`tem_acesso(restaurante_id) or eh_admin_repply()`) para `authenticated`, nenhuma política de escrita; `revoke all ... from public, anon, authenticated` + `grant select ... to authenticated`; estender `limpar_conversas_mentor()` deletando linhas com `criada_em < now() - interval '12 months'` (somar no contador existente sem mudar o formato); `comment` nas novidades. Sem policies em `storage.objects` de propósito: navegador nunca toca o cofre direto (só a chave de serviço). Aplicar só no local: `npx supabase migration up --local`.
- [ ] Regenerar tipos (`npm run types`) e revisar o diff (só acréscimo de `mentor_anexos`).
- [ ] Rodar `npm run test -- tests/mentor/anexos-banco.test.ts` (tudo verde) + `npx tsc --noEmit` (0 erros).
- [ ] Commit: `git add supabase/migrations/20261112HHMMSS_mentor_anexos.sql tests/mentor/anexos-banco.test.ts types/database.types.ts && git commit -m "Guarda os anexos do mentor em cofre privado"`

## Tarefa 2 — validar, subir e vincular (com rollback)

**Arquivos:**
- criar `lib/mentor/anexos.ts`;
- criar `tests/mentor/anexos.test.ts`;
- editar `lib/mentor/sessoes-actions.ts` (função `excluirConversa`: após o `is excluida` precoce e antes da marca, apagar arquivos+linhas daquela conversa+casa).

**Interfaces:**
- Consumes: tabela/RLS da Tarefa 1; `createServiceClient`.
- Produces: `TIPOS_ANEXO: Record<string, "imagem"|"pdf"|"planilha">` (extensão→tipo: png/jpeg/webp, pdf, xlsx/csv; mime conferido contra a extensão); `TAMANHO_MAXIMO_ANEXO = 10485760`; `MAXIMO_ANEXOS_POR_PERGUNTA = 5`; `validarArquivos(files: File[]): { ok: true; arquivos: Validados } | { ok: false; error: string }` (frase do produto; nunca lança); `gravarAnexos(restauranteId, conversaId: string | null, arquivos: File[]): Promise<{ id: string; caminho: string }[]>` (sobe para `pendente/{uuid}` + insere linha com `conversa_id` como veio; erro apaga o que subiu e lança `FalhaDoMentor("falha_anexos_mentor")` — código novo no allowlist de `lib/logger.ts`); `vincularAnexos(restauranteId, conversaId: string, ids: string[]): Promise<void>` (move `pendente/*` → caminho final `restaurante_id/conversa_id/` via `storage.move` + update `conversa_id`; falha lança); `excluirAnexosDaConversa(restauranteId, conversaId): Promise<void>` (apaga arquivos via service + linhas com os dois filtros; zero linhas = ok); `urlParaBaixar(restauranteId, anexoId): Promise<string|null>` (confere casa, devolve assinada 120 s ou nulo).

- [ ] Teste vermelho: 6 arquivos recusados; 10 MiB + 1 byte recusado; `.exe` recusado; nome com `../` higienizado (nunca sai do prefixo da casa); falha no meio do lote desfaz o que subiu (conta 0 no bucket e na tabela); excluir apaga arquivos+linhas só daquela conversa (outra conversa da casa intacta); download de outra casa devolve nulo. Provedor não entra aqui (só Storage local real + service key).
- [ ] Teste verde após implementar o mínimo em `lib/mentor/anexos.ts` ("server-only"; todo filtro com `restaurante_id` explícito; log só com `falha_anexos_mentor`).
- [ ] Editar `excluirConversa`: chamar `excluirAnexosDaConversa` antes da marca (ordem igual às fichas: falha fecha sem marcar); idempotência preservada (retorno precoce antes de tudo). Teste: excluir apaga arquivos da conversa; segunda chamada ok sem tocar no cofre.
- [ ] Rodar `npm run test -- tests/mentor/anexos.test.ts tests/mentor/sessoes-actions.test.ts`, `npx tsc --noEmit`.
- [ ] Commit: `git add lib/mentor/anexos.ts lib/mentor/sessoes-actions.ts tests/mentor/anexos.test.ts tests/mentor/sessoes-actions.test.ts lib/logger.ts && git commit -m "Sobe e vincula os anexos do mentor com rollback"`

## Tarefa 3 — entregar os arquivos à IA na resposta

**Arquivos:**
- editar `lib/mentor/provedor/tipos.ts` (acrescentar `AnexoParaIA` + campo `anexos?` na entrada de `responder`);
- editar `lib/mentor/provedor/gemini.ts` (mapear para `inlineData`);
- editar `lib/mentor/conversa.ts` (passo 3–4 por volta da linha 370; passo 5 por volta da 385; passo 6 por volta da 441 — ver o arquivo antes);
- editar `lib/mentor/enviar-action.ts` (`enviarMensagemAction(slug, conversaId, texto, arquivos?: File[])`);
- Test: ampliar `tests/mentor/conversa.test.ts`, `tests/mentor/provedor.test.ts`, `tests/recepcao/…` não — `tests/mentor/enviar-action.test.ts`.

**Interfaces:**
- Consumes: `AnexoParaIA`, `gravarAnexos`/`vincularAnexos` da Tarefa 2, `extrairEgravarFichas` existente.
- Produces: resposta com análise dos anexos; `Resultado` ganha `{ ok: true; data: { conversaId; resposta; anexosFalharam: boolean } }` (falso quando tudo ok; verdadeiro = aviso "alguns anexos não entraram, reenvie só eles").

- [ ] Teste vermelho: dublê de provedor recebe `anexos` com `{tipo, mime, nome, dados}` e o cliente Gemini dublê recebe `inlineData` na primeira chamada (não nas de ferramenta); sem anexo o pedido é byte-idêntico ao de hoje; anexo inválido (mock de `validarArquivos`) recusa sem gastar o uso e sem chamar o provedor; conversa nova: arquivos sobem pendentes, vinculam após gravar (assert na ordem: insert com `conversa_id` nulo → update/moves após o id); falha de vínculo falha fechado com a conversa gravada + aviso `anexosFalharam: true`; extração de fichas continua chamada 1 vez e uso do dia conta exatamente 1.
- [ ] Implementação mínima: `AnexoParaIA = { tipo: "imagem"|"pdf"|"planilha"; mime: string; nome: string; dados: string }` (base64); `ProvedorIA.responder` ganha `anexos?: AnexoParaIA[]`; Gemini monta `parts: [{text: pergunta}, ...anexos.map(a => ({inlineData: {mimeType: a.mime, data: a.dados}}))]` só na primeira chamada (rodadas de ferramenta como hoje); `enviarMensagemAction` segue esta ordem exata — validar arquivos → contar o uso 1 vez → subir em área temporária (`gravarAnexos` com `conversaId: null`) → chamar o provedor com os bytes já em mãos → gravar a conversa → vincular (`vincularAnexos`, move + linka) → extrair fichas; qualquer falha de anexo vira `anexosFalharam: true` sem derrubar a resposta (provedor inalcançável continua devolvendo o uso, como hoje).
- [ ] Rodar os 4 arquivos de teste + `npx tsc --noEmit`.
- [ ] Commit com os arquivos explícitos + `git commit -m "Analisa os anexos junto da resposta do mentor"`

## Tarefa 4 — telas: anexar, ver, baixar, admin

**Arquivos:**
- editar `components/painel/mentor/chat-mentor.tsx` (input `type="file" multiple accept="image/*,.pdf,.xlsx,.csv"` + lista de anexos com baixar);
- editar `lib/mentor/anexos-actions.ts` (novo: `baixarAnexo(slug, anexoId)` → `{ ok, url }` via `urlParaBaixar`; `exigirCasa` + modoAdmin barrado com frase);
- editar `lib/mentor/leitura.ts` (`anexosDaConversa(conversaId, restauranteId)` com filtro duplo + RLS, valida tipo como as fichas);
- editar `app/admin/mentor/conversas/[id]/page.tsx` + `components/admin/conversa-do-mentor.tsx` (lista anexos com baixar; sem apagar/mexer);
- Test: `tests/componentes/mentor/anexos.test.tsx` (novo), ampliar `tests/mentor/anexos-actions.test.ts` (criar), `tests/admin/conversas-do-mentor.test.tsx`.

- [ ] Teste vermelho: input existe com `accept` certo e trava com 6 arquivos; anexar chama a ação com os `File`s e mostra a lista (nome/tipo/tamanho no fuso da casa); erro vira frase e mantém o texto digitado; baixar chama a ação e abre a url (dublê); modo leitura sem input nem botões; admin vê lista com baixar e nada além; guarda: sem módulo = 404.
- [ ] Implementação mínima seguindo `lista-conversas.tsx` (nav com `aria-label`, `role="alert"`, `method="post"` onde houver campo, confirmação antes do que apaga — aqui não há apagar individual: só baixar; esquecer-tudo não toca em anexo, documentado no teste).
- [ ] Rodar testes focados + `npx tsc --noEmit` + `npm run check`; abrir no navegador 390 px e computador, claro/escuro, como dono (3 tipos reais: foto, PDF, planilha pequenos e fictícios) e como admin.
- [ ] Commit com os arquivos explícitos + `git commit -m "Anexa e mostra os arquivos no chat do mentor"`

## Tarefa 5 — operação, varredura de órfãos e regressão final

**Arquivos:**
- editar `docs/operacao/mentor.md` (novo § Anexos: cofre, limites, retenção, o que o admin vê, semáforo de custo);
- criar `scripts/limpar-arquivos-orfaos-mentor.ts` (lista `mentor-anexos` via service, apaga do cofre o sem ficha na tabela; `--dry-run` padrão, só roda com URL loopback como `scripts/importar-relatorios.ts`);
- Test: `tests/mentor/limpar-orfaos.test.ts` (dublê do storage: apaga só o órfão, nunca o vinculado; dry-run não apaga).

- [ ] Documentar + script com teste vermelho→verde; `git diff --check`.
- [ ] Verificação final nesta ordem, guardando saídas: `npx tsc --noEmit`, `npm run check`, `npm run test`, `npm run build`.
- [ ] Reexecutar as suítes que o sócio valida na Fase 1 (enviar, conversa, limite, fichas) + abrir lista, lembranças, anexos e admin como dono e admin. Não apagar dados existentes para forçar cenário; casa fictícia dedicada para o visual, removida depois.
- [ ] Usar `requesting-code-review` para a revisão final independente.
- [ ] Commit só se houver ajuste de documento/evidência. Sem push (publica o frontend).

## Critério de conclusão

- [ ] Dono anexa imagem/PDF/planilha (5×10 MB) e o mentor analisa junto do texto; fora da regra recusa sem custo nem rastro.
- [ ] Nenhuma casa toca anexo de outra; nada de anexo em log; cofre sem leitura pública.
- [ ] Excluir apaga arquivos na hora; 60 dias sem arquivo; 12 meses aposenta o resto; órfãos varridos pelo script.
- [ ] Uso do dia conta 1 por pergunta; falha de anexo não derruba a pergunta; falha de IA devolve o uso.
- [ ] Telas e admin conformes; esquecer-tudo não mexe em anexo (documentado e testado).
- [ ] Tipos, lint, suíte e build verdes; D nova só se preciso (não está previsto); produção intacta.
