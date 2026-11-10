# Mentor Fase 2 — Organização de chats (sessões) — plano de implementação

> **Para o modelo executor:** use a skill `subagent-driven-development` e execute uma tarefa por vez, em TDD. Não publique, não aplique migrations na nuvem e não use dados reais. Marque os checkboxes somente com evidência local. Issue: #3.

**Objetivo:** o dono passa a ver suas conversas com o mentor numa lista navegável (título + data, da mais recente para a mais antiga), abre qualquer uma, cria nova, renomeia, arquiva e exclui. Excluir esconde do dono e guarda cópia de segurança da empresa por 60 dias (decisão nova D-75, abaixo); arquivar só tira da lista principal e pode ser desfeito.

**Arquitetura:** o estado novo mora em duas colunas de `mentor_conversas` (`arquivada_em`, `excluida_em`); nenhuma tabela nova. O dono nunca apaga linha: só marca pelos botões, e quem apaga de verdade é a rotina do pg_cron (60 dias após excluir, resto após 12 meses) ou o admin no suporte (apagar de verdade imediato, com chave de serviço). A lista do dono nunca mostra excluída; a do admin mostra com marca. Enviar a primeira pergunta continua criando a conversa (código atual já faz isso quando `conversaId` é nulo); o botão "Nova conversa" só limpa a tela, sem gastar o limite do dia.

**Stack:** a atual (Next.js, TypeScript estrito, Supabase/Postgres + RLS, Vitest, Biome). Sem dependência nova.

**Fonte de verdade:** `docs/roadmap.md` (Fase 2), decisões D-72/D-73/D-74 e a D-75 proposta na tarefa 2, `docs/operacao/mentor.md`.

## Decisões fechadas com o Lucas Ferreira (não reabrir)

1. "Nova conversa" só cria de verdade ao enviar a primeira pergunta; não gasta limite antes disso.
2. Excluir esconde do dono e mantém cópia de segurança da empresa por até 60 dias; apaga de verdade sozinha após o prazo, ou na hora se o cliente pedir no suporte. A tela avisa isso ao excluir.
3. O título continua nascendo sozinho da primeira pergunta (até 60 letras, como hoje); o dono pode renomear depois.

## Restrições globais

- Trabalhar no checkout existente; `git status --short --branch` e `git fetch origin main` antes de cada commit. Preservar trabalho alheio (o sócio está na Fase 1, manual, sem código — mas a cartilha pode mudar: se mudar no meio, reexecutar os testes da tarefa 6).
- Migrations só se acrescentam; nunca editar as existentes. RLS no mesmo arquivo da migration. Proibido `FORCE ROW LEVEL SECURITY`.
- `restaurante_id` sempre da sessão (`exigirCasa`), nunca de argumento. RLS é a trava; o filtro por casa no código é a segunda camada.
- Funções do servidor devolvem `{ ok: true, data? } | { ok: false, error: string }` com frase do produto, nunca `error.message` do banco. Log só com código, nunca pergunta do dono.
- Zero linhas afetadas numa escrita não é sucesso.
- Nenhuma credencial no git. Testes com provedor dublê, nunca a chave real.
- Celular primeiro, computador sempre funcionando; temas claro/escuro; estado vazio.
- Teste local não autoriza `supabase db push`, `functions deploy`, `git push` ou acesso a produção.

## Tarefa 1 — banco: arquivar, excluir e a faxina de 60 dias

**Arquivos:**
- criar `supabase/migrations/20261110HHMMSS_mentor_sessoes.sql` (timestamp novo, após a última migration existente);
- criar `tests/mentor/sessoes-banco.test.ts`;
- ampliar `tests/isolamento/todas-as-tabelas.test.ts` se listar `mentor_conversas`.

**Interfaces produzidas:** colunas `arquivada_em timestamptz null` e `excluida_em timestamptz null` em `mentor_conversas`; rotina de faxina passa a apagar de verdade (conversa + mensagens em cascata) as excluídas há mais de 60 dias, mantendo a regra dos 12 meses para o resto.

- [ ] Escrever primeiro o teste vermelho: dono A arquiva/exclui a própria conversa (update permitido); dono B não altera a de A (zero linhas); ninguém apaga linha direto (`DELETE` recusado pela RLS para `authenticated`); conversa excluída há 61 dias some após a faxina; excluída há 59 dias fica; arquivada (não excluída) segue a regra dos 12 meses.
- [ ] Migration apenas por acréscimo: `add column` das duas colunas (nuláveis, sem default), políticas RLS de UPDATE própria (dono só toca nas colunas novas + `titulo`, nunca em `restaurante_id`), sem política de DELETE para `authenticated`; estender a função `limpar_conversas_mentor()` com o corte de 60 dias para `excluida_em`.
- [ ] Regenerar `types/database.types.ts` com `npm run types` contra o banco local e revisar o diff (não inventar tipos à mão).
- [ ] Rodar `npm run test -- tests/mentor/sessoes-banco.test.ts` e `npx tsc --noEmit`.
- [ ] Commit: `Guarda arquivadas e excluídas do mentor no banco`.

## Tarefa 2 — decisão D-75 e documentos

**Arquivos:**
- editar `docs/decisoes.md` (nova linha no fim da tabela);
- editar `docs/operacao/mentor.md` (§6 retenção + §3 conversas);
- editar `docs/roadmap.md` se citar retenção da Fase 2.

**Texto da D-75 (data do dia do commit):** **Cópia de segurança de conversa excluída: 60 dias.** Quando o dono exclui uma conversa do mentor, ela some da vista dele e fica guardada pela empresa por até 60 dias, para segurança e suporte; após o prazo apaga de verdade, sozinha. Se o cliente pedir no suporte, o admin apaga na hora. A tela avisa isso ao excluir. Arquivar é diferente: só tira da lista principal e o dono pode trazer de volta.

- [ ] Conferir que D-74 é a última antes de numerar; riscar nada; só acrescentar.
- [ ] Atualizar o §6 de `operacao/mentor.md` (dois prazos: 60 dias para excluídas, 12 meses para o resto) e o §3 (admin vê excluída marcada e tem o botão de apagar de verdade).
- [ ] `git diff --check`; commit junto da tarefa 1 ou separado: `Registra a decisão da cópia de segurança de 60 dias`.

## Tarefa 3 — ações do servidor e leitura

**Arquivos:**
- criar `lib/mentor/sessoes-actions.ts` (ou estender `enviar-action.ts` se o padrão do repo preferir um arquivo por ação — ver como `cartilha-actions.ts` faz);
- editar `lib/mentor/leitura.ts` (`conversasDaCasa`, leituras do admin);
- criar `tests/mentor/sessoes-actions.test.ts`.

**Interfaces:**

```ts
renomearConversa(slug, conversaId, titulo): Promise<Resultado> // máx. 60 letras
arquivarConversa(slug, conversaId, arquivar: boolean): Promise<Resultado>
excluirConversa(slug, conversaId): Promise<Resultado> // marca excluida_em, não apaga
apagarConversaDeVerdade(conversaId): Promise<Resultado> // só admin, chave de serviço
```

- [ ] Teste vermelho para cada ação: dono mexe só na conversa da casa da sessão; admin em modo leitura não renomeia/arquiva/exclui pelo caminho do dono; dono não chama o apagar-de-verdade; título vazio/longo recusado com frase do produto; excluir conversa já excluída é idempotente (ok sem erro).
- [ ] `conversasDaCasa` passa a excluir `excluida_em is not null` e a devolver `arquivada_em` no tipo `ConversaDaLista`; criar `conversasArquivadasDaCasa` (só arquivadas, sem excluídas). Leituras do admin passam a trazer a marca `excluida` e continuam só-leitura (o apagar-de-verdade é ação à parte, com `exigirAdmin()` + chave de serviço).
- [ ] Renomear reaproveita o limite de 60 (`TAMANHO_DO_TITULO`); nada de IA para gerar título (YAGNI).
- [ ] Rodar testes focados + `npx tsc --noEmit`.
- [ ] Commit: `Cria as ações de sessão do mentor`.

## Tarefa 4 — tela do dono: lista, nova, renomear, arquivar, excluir

**Arquivos:**
- editar `app/r/[slug]/mentor/page.tsx`;
- editar `components/painel/mentor/chat-mentor.tsx` (ou extrair `lista-conversas.tsx` se o arquivo passar de ~300 linhas — ver o tamanho atual antes);
- criar `tests/componentes/mentor/sessoes.test.tsx`.

- [ ] Teste vermelho de interface: lista mostra títulos da mais recente para a mais antiga; "Nova conversa" volta ao estado vazio sem criar nada (nenhuma chamada de escrita); abrir uma conversa carrega as mensagens dela; renomear chama a ação e atualiza o título; arquivar tira da principal; excluir pede confirmação com o aviso dos 60 dias e tira da vista.
- [ ] No celular, a lista é a primeira tela e o chat abre com botão de voltar; no computador, lista ao lado do chat. Conferir as duas larguras, claro/escuro e casa sem conversa (estado vazio igual ao de hoje).
- [ ] Trocar de conversa no meio de "Pensando…" cancela só a vista (não duplica envio: o `emAndamento` atual já trava; manter).
- [ ] Falha de leitura continua caindo na tela de erro, nunca em lista vazia (princípio atual de `leitura.ts`).
- [ ] Rodar testes focados, `npx tsc --noEmit`, `npm run check`.
- [ ] Commit: `Lista e organiza as conversas do mentor`.

## Tarefa 5 — admin: marca de excluída e botão de apagar de verdade

**Arquivos:**
- editar `app/admin/mentor/conversas/page.tsx` e `[id]/page.tsx`;
- editar `components/admin/lista-conversas-do-mentor.tsx` e `conversa-do-mentor.tsx`;
- ampliar `tests/admin/conversas-do-mentor.test.tsx`.

- [ ] Teste vermelho: excluída aparece na lista com marca visível; detalhe mostra a marca; botão "apagar de verdade" pede confirmação dupla (texto claro: some para sempre, inclusive da segurança) e some com a conversa; dono não alcança essas telas (já barrado por `exigirAdmin`, só regressão).
- [ ] O apagar-de-verdade usa a ação da tarefa 3 (chave de serviço), nunca DELETE direto pela tela.
- [ ] Rodar testes focados + tipos.
- [ ] Commit: `Mostra excluídas e apaga de verdade no admin`.

## Tarefa 6 — regressão final e evidência

**Pré-condição:** Supabase local no ar; nenhuma mudança aplicada em produção.

- [ ] Rodar, nesta ordem, guardando as saídas reais: `npx tsc --noEmit`, `npm run check`, `npm run test`, `npm run build`.
- [ ] Reexecutar os cenários-chave da Fase 1 do sócio que tocam o chat (capacidade básica + fato x conselho): a Fase 2 não pode ter quebrado o comportamento que ele está validando. Se a cartilha mudou no meio do caminho, registrar e reexecutar de novo.
- [ ] Abrir no navegador a lista e o chat em 390 px e no computador, claro/escuro, como dono; abrir a lista do admin e o detalhe com excluída marcada.
- [ ] Conferir `git diff --check`, `git status --short --branch`; não fazer push (push publica o frontend).
- [ ] Usar `requesting-code-review` para a revisão final.
- [ ] Commit final só se houver ajuste de documento/evidência.

## Critério de conclusão

- [ ] Dono vê lista navegável, abre qualquer conversa, cria nova (só existe após a 1ª pergunta, sem gastar limite antes), renomeia, arquiva/desarquiva e exclui com o aviso dos 60 dias.
- [ ] Excluída some para o dono, fica marcada para o admin, apaga sozinha após 60 dias e sai na hora pelo botão do admin.
- [ ] Nenhuma casa vê conversa de outra; dono não apaga linha direto; admin não escreve conversa.
- [ ] Limite diário, trilhos, cartilha e retenção de 12 meses intactos; tipos, lint, suíte e build verdes; D-75 registrada.
- [ ] Nenhuma migration, função ou dado de produção alterado.
