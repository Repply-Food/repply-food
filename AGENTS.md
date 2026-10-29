# AGENTS.md: regras para qualquer IA no repply food.

Este arquivo vale para **qualquer** ferramenta de IA que trabalhe neste repositório: Claude Code, Codex, Cursor, Copilot e outras (D-25). O `CLAUDE.md` puxa este arquivo. **Responda sempre em português do Brasil**, seja qual for o idioma da skill ou do código.

> 🔴 **O manual completo é o `CLAUDE.md`. Leia antes de escrever qualquer código.** Este arquivo é o resumo que liga as skills e aponta as regras.

---

## 1. Skills: use antes de agir

As skills vivem em `.claude/skills/` (lida pelo Claude Code) e `.agents/skills/` (lida pelo Codex). São duas cópias iguais. A fonte é `.claude/skills`: depois de editar, rode `node scripts/sincronizar-skills.mjs`.

**Antes de qualquer tarefa, inclusive antes de perguntar ou abrir arquivos, veja se uma skill se aplica e use.** As de processo (brainstorming, systematic-debugging) vêm antes das de implementação. Se houver 1% de chance de uma skill servir, invoque. Pensamentos como "isso é simples demais" ou "primeiro deixa eu olhar o código" são o sinal para parar e invocar.

> **Toda etapa nova do MVP começa pelo `brainstorming`** (desenho aprovado com o Lucas Ferreira), **depois `writing-plans`** (o plano) e **depois `subagent-driven-development`** (a execução) — nunca pule direto para o plano nem para o código. É assim que as etapas 4a, 5, 6, 7, 9 e 10 foram feitas; a **etapa 8 (PDF) entrou dentro da 7** (o PDF das quatro abas de Resultados, a única exportação do MVP — D-20/D-34), e a **etapa 10 (ensaio geral)** foi concluída em 24/10/2026 (casa de demonstração, kit do vendedor e acabamentos). O **MVP está concluído** e a **etapa 11 (piloto com a SCC e um cliente real)** está em andamento desde 24/10/2026. O desenho vai para `docs/superpowers/specs/`, o plano para `docs/superpowers/plans/` (os dois são commitados).

| O pedido é… | Skill |
|---|---|
| Construir algo novo, discutir uma ideia | `brainstorming` (sempre primeiro), depois `writing-plans` |
| Executar um plano já escrito | `subagent-driven-development` (o padrão dos planos daqui) ou `executing-plans` |
| "Isso não funciona", bug, comportamento estranho | `systematic-debugging`, antes de propor conserto |
| Começar funcionalidade ou conserto | `test-driven-development`: teste antes do código |
| Revisar o que foi feito | `requesting-code-review`; ao receber revisão, `receiving-code-review` |
| Antes de dizer "feito" ou publicar | `verification-before-completion` |
| Várias frentes independentes | `dispatching-parallel-agents`, `using-git-worktrees` |
| Texto que **o cliente lê** soando "de robô" | `humanizer`. Nunca em commit nem em documento técnico |
| Criar ou editar uma skill | `writing-skills` |

- **Desenhos** vão para `docs/superpowers/specs/AAAA-MM-DD-<tema>-design.md`.
- **Planos** vão para `docs/superpowers/plans/AAAA-MM-DD-<tema>.md`.
- Os dois são commitados.
- O rascunho de execução fica em `.superpowers/` (ignorado pelo git).

## 2. Antes de escrever código: "menos é mais"

1. **Procure o que já existe.** Este projeto reaproveita peças do Repply Imob e padrões do Repply CRM (`CLAUDE.md` §2). Reimplementar o que está a alguns arquivos de distância é a fonte de bug mais comum.
2. **Num conserto, ache todos que usam a função e conserte no ponto comum.** Consertar num arquivo que a tela não usa não conserta nada.

Nenhuma das duas é desculpa para ler de menos: elas encurtam a **solução**, nunca a leitura.

## 3. Analisar por todas as perspectivas

Toda mudança passa por este crivo:

- **Quem usa:**
  - o dono no celular, durante o expediente;
  - o sócio ou o gerente com o mesmo login;
  - o dono no computador;
  - o admin da Repply;
  - o SCC enviando dados.
- **Qual restaurante:** o que serve a um não pode quebrar os outros. E **nunca** pode mostrar dado de outro.
- **Em que estado:**
  - restaurante recém-cadastrado, sem dados;
  - carga inicial no meio;
  - SCC parado;
  - virada do dia (madrugada);
  - mês sem meta;
  - primeira vez no aparelho;
  - app instalado contra navegador.
- **Por qual caminho:** tela, link direto, PDF, envio do SCC, rotina do pg_cron.
- **Efeito lateral:** a métrica que outra tela ou o PDF também lê, o selo "há X min", o alarme.
- **O avesso:** quem usa diferente de quem pediu. O que piora para essa pessoa?

Funcionalidade nova cobre **todas as superfícies** que toca:
- celular **e** computador (D-39);
- tela **e** PDF;
- painel do dono **e** "ver o painel do cliente" no admin.

Quando uma perspectiva levantar decisão de produto, **pergunte**; não escolha sozinho.

## 4. Quando parar e perguntar

Pare e converse com o Lucas Ferreira antes de:
- escrever ou apagar **dado de produção**;
- **excluir** qualquer coisa (é irreversível);
- mudar o **banco** de produção (migration escrita não é migration aplicada);
- **decisão de produto** que muda o que o cliente vê ou paga, ou que contraria [`docs/decisoes.md`](docs/decisoes.md);
- **risco de segurança** novo;
- publicar, criar repositório ou mexer em conta externa (Supabase, Vercel, GitHub, DNS).

**Decisão registrada em `docs/decisoes.md` não se reabre** sem falar com ele.

## 5. Verificar antes de dizer "feito"

Evidência antes de afirmação. Rode e confira a saída **antes** de dizer que está pronto (comandos em `CLAUDE.md` §9):

- tipos;
- lint;
- testes;
- build.

Nunca diga "funciona" sem ter visto funcionar. Para tela, isso significa abrir no navegador, em largura de celular **e** de computador.

## 6. As armadilhas mais caras

São lições medidas nos projetos irmãos:

| Armadilha | Regra |
|---|---|
| Dado de um restaurante aparecendo em outro | `restaurante_id` vem do servidor (token ou sessão), nunca do cliente. A RLS em toda tabela. Teste de isolamento obrigatório |
| "Salvo" quando a RLS recusou | Zero linhas afetadas não é sucesso: confira a contagem |
| `FORCE ROW LEVEL SECURITY` | Proibido: recursão infinita nas funções auxiliares (Imob) |
| Migration editada | Só se acrescenta migration nova |
| Dado pessoal de cliente do restaurante no banco ou no log | Descartar na recepção (D-29); log só com código e mensagem curta |
| Rotina em `setInterval` ou limitador em memória | Não funciona na Vercel (cada requisição pode cair numa instância nova). Rotinas no pg_cron; limitador no banco |
| `succeeded` no `cron.job_run_details` | Só quer dizer "foi para a fila"; conferir `net._http_response` (CRM) |
| Tomate depois do nome "repply food" | O tomate só aparece no símbolo (D-42) |
| Guia "tela inicial" no computador ou no app instalado | Proibido (D-36, D-39) |
| Taxa de serviço somada ao faturamento | Sempre separada (D-14) |

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
