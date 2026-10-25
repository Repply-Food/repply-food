# Retomada da otimização — checkpoint pausado

**Pausa solicitada pelo Lucas em 25/10/2026.** Branch de preservação: `wip/otimizacao-baseline-2026-10-25`. É um backup de trabalho incompleto, não uma entrega aprovada. Não integrar à `main` nem aplicar otimizações automaticamente.

## Onde paramos

- Desenho e plano: `docs/superpowers/specs/2026-10-24-desempenho-sem-regressao-design.md` e `docs/superpowers/plans/2026-10-24-otimizacao-sem-regressao.md`.
- **T0 parcial, sem aceite. T1–T12 não iniciadas.** Nenhuma mudança de produto ou migration nova foi feita nesta execução. Resultados e limitações: `docs/desempenho/baseline.md`.
- SQL autenticado já tem medidor real, guardas e revisão das últimas correções; sondas de faturamento dono/admin passaram. A série SQL limpa 5+30 ainda não foi executada.
- EXPLAIN nested real foi capturado; só `supabase_admin` local permite `LOAD`, depois as RPCs rodam sob `authenticated`. Resultados 90d/semanal admin cancelou por timeout sob instrumentação; preservar falha, não aumentar limites.
- PDF tem série de tempo HTTP total e conferência das seis páginas/quatro seções; renderização isolada/memória pendentes.
- UI tem smoke e série preliminar. Repetir grupos relevantes sem testes concorrentes e com método de cache/worker/4G calibrado antes de referência conclusiva.
- HTTP RPC: sonda de identidade/papel/casa passou. Medidor ainda mistura Hoje e Resultados no mesmo lote; separar superfícies e resumir por RPC antes de tratar como latência de uma tela. Concorrência entre casas permanece pendente.
- Preparador das três reservas SCC passou revisão, mas **não foi executado**. O medidor de ingestão recebeu implementação parcial nesta rodada e 35 testes focados; o implementador foi interrompido a pedido de pausa, antes do relatório/revisão. Não executar carga sem revisar código/contrato/estado e guardas.

## Verificações no momento da pausa

- `npx tsc --noEmit`: passou.
- `npx vitest run tests/desempenho`: **99/99 passaram**, sem DB.
- `git diff --check`: passou.
- `npm run check`: **falhou somente por formatação em `tests/desempenho/medir-ingestao.test.ts`**, no teste de envelope acima de 2 MB. Preservado como pendência, sem alegar lint verde.
- Suíte completa anterior na cópia isolada: **1.347 passaram/4 falharam**. Duas falhas exigem cron ativo, uma encontra a tabela-marcador adicional, outra depende de caminho Git rastreado na cópia. Não relaxar asserções nem religar cron para esconder diferenças; detalhes na baseline.
- Build anterior da cópia `app-medicao/` passou com Next.js 16.4.3. A instalação original continha 16.4.0 divergente do lock e foi bloqueada pela verificação de segurança. Não é build refeito neste checkpoint, nem motivo para atualizar dependências sem investigar.

## Servidores pausados, dados preservados

- Parados os sete containers `supabase_{db,kong,auth,rest,realtime,inbucket,edge_runtime}_repply-food-perf-20261025`, sem remover containers, volumes, imagens ou dados.
- Parados o Next de medição (`3100`), a ponte temporária de login (`3101`) e o Chromium/CDP próprio (`9311`). Portas verificadas sem escuta, inclusive `55421/55422/55424`.
- Supabase compartilhado (`54321/54322`), outros containers, servidores de outras tarefas e o OpenCode foram mantidos. Não usar `docker stop` geral, `down -v`, prune ou reset.
- Última conferência do banco isolado: zero cron ativo, Vault vazio, zero alertas/incidentes. Massa global **14 casas sintéticas/36.000 entradas**, incluindo ensaios antigos; principais A/B têm 9.000 cada, 90 abertas, 90 removidas, 8.010 marcadas pagas e 7.920 pagas válidas. Não apagar ensaios sem autorização; cardinalidade global influencia os tempos.

## Próxima sessão

1. Ler este arquivo, `AGENTS.md`, `CLAUDE.md`, a baseline e o plano. Confirmar pedido de retomada; não reiniciar serviços enquanto o trabalho estiver pausado.
2. A worktree local e o volume Docker foram preservados. Workspace ignorado: `.superpowers/sdd/2026-10-24-otimizacao-sem-regressao/`. Nele estão `progress.md`, briefs, relatórios/revisões, cópia do app, dados brutos, capturas e configuração isolada. **Não estão no GitHub**: não adicionar em massa nem publicar credenciais/cookies/payloads/arquivos locais.
3. O agente SCC interrompido é `ses_e8cbdaebbffe0yN2Sl23S5Nk78`; brief local `t0-serie-ingestao-brief.md`. Conferir o que já existe antes de reimplementar. Corrigir formatação pendente e obter relatório/revisão independente do medidor SCC antes de qualquer execução real.
4. Brief local preparado, ainda não despachado: `t0-http-superficies-brief.md` (superfícies HTTP e teste portável do caminho secreto). Nenhuma segunda implementação em paralelo.
5. Para reativar a instância preservada, identificar os containers exatos acima com `docker ps -a`. Iniciar **primeiro apenas** `supabase_db_repply-food-perf-20261025`, depois os seis serviços desse mesmo projeto. Não usar o projeto compartilhado, reset, migration ou seed. Conferir API/DB literais `127.0.0.1:55421/55422`, marcador `repply-food-perf-20261025-55422` e zero cron antes de qualquer acesso/escrita dos runners.
6. Só então reiniciar a cópia do app com configuração local correta (sem `.env` de produção), se necessário. Credenciais locais continuam em arquivos ignorados `0600`; não imprimi-las nem reprovisionar contas que já funcionam.
7. Com instrumentos congelados e sem testes/coletas concorrentes, executar o wrapper local `rodar-sql-series.mts`. Depois completar HTTP/concorrência, SCC revisado, cenários vazio/esparso/maior volume/histórico distante e lacunas restantes. Registrar erros e séries parciais sem fabricar percentis.

Este checkpoint foi autorizado para uma nova branch no GitHub. Isso não autoriza merge na `main`, alterações no Supabase remoto ou publicação do produto.
