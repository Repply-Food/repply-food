# Relatório T0 — baseline de desempenho sem regressão

**Data:** 2026-10-25
**Branch:** `correcao-rpcs-resultados-nulas`
**Base:** `422eaef`
**Status:** PARCIAL — captura SQL 5+30 concluída; T0 não aprovada.

> Relatório histórico desta rodada. O checkpoint pausado e as verificações posteriores estão em `docs/desempenho/retomada.md` e `docs/desempenho/baseline.md`. Branch de preservação: `wip/otimizacao-baseline-2026-10-25`. Não interpretar as pendências antigas abaixo como estado atualizado nem como autorização para continuar durante a pausa.

## Ambiente isolado

- Supabase descartável em `.superpowers/sdd/2026-10-24-otimizacao-sem-regressao/isolated-project/` (ignorado pelo Git), `project_id` próprio e portas API/DB `55421/55422`; sem seed padrão.
- Foram aplicadas 19 migrations da branch à instância nova. PostgreSQL 17.11, Node v22.12.0.
- O Supabase compartilhado nas portas `54321/54322` permaneceu ativo e intocado. A guarda exige IP de loopback literal e portas isoladas `55421/55422`; também exige marcador próprio do banco, zero jobs `cron` ativos, e recusa query/hash PostgreSQL, userinfo HTTP e redirects.
- Três jobs das migrations (`rf-vigia`, `rf-retencao`, `rf-limpa-tentativas`) foram desativados só no DB isolado. `rf-vigia` executou quatro vezes antes; conferi zero registros em `alertas_sinal` e `incidentes_sinal`, sem chamada externa enfileirada. Jobs do DB compartilhado não foram alterados.
- Dados somente fictícios: duas casas, dois usuários/donos distintos, 90 dias × 100 linhas por casa, horários e valores determinísticos, distribuição de abertas/removidas/pagas, uma casa com meta e outra sem meta. Nenhuma informação pessoal.

## Implementação desta continuação

- `scripts/desempenho/medir-metricas.ts`: probe HTTP com redirect manual, valida ambiente antes de conexão, mede métricas Hoje e Resultados 1/7/30/90 dias em 5 aquecimentos + 30 amostras (configurável), papel `authenticated` com claim do dono, contagens/bytes e `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` para curva Hoje e Resultados 90d semanal.
- `scripts/desempenho/preparar-cenarios.ts`: cria fixture sintética transacional apenas no PostgreSQL local da porta isolada.
- `scripts/desempenho/trava-nuvem.ts`: guardas local-only, portas isoladas, sem exceções de `NODE_ENV` ou flags.
- Testes focados em coleta de amostras, percentis, protocolos, portas, marcador, cron e proteção contra hosts remotos.
- Documentação atualizada em `docs/desempenho/metodologia.md` e `docs/desempenho/baseline.md`.

## Evidência TDD desta continuação

### RED 1 — API de amostragem ausente

```text
$ npx vitest run tests/desempenho/medir-metricas.test.ts
2 testes falharam: medirAmostras is not a function; resumirDuracoes is not a function.
```

Implementadas amostragem e percentis. Uma primeira expectativa manual de duração foi corrigida (o relógio fornecido retornava 4 ms e 5 ms após aquecimento); o teste final verifica `[4, 5]`.

### RED 2 — recusar o Supabase local compartilhado

```text
$ npx vitest run tests/desempenho/trava-nuvem-benchmark.test.ts
2 falhas: endpoint local na porta 54321 aceito; Postgres local na porta 54322 aceito.
```

Após restringir a porta do harness às portas próprias `55421/55422`, os testes focados passaram.

### RED 3 — override de host no connection string

```text
$ npx vitest run tests/desempenho/trava-nuvem-benchmark.test.ts
1 falha: PostgreSQL em loopback com query `?host=db.remote.example` foi aceito.
```

A guarda passou a rejeitar query/hash no URL PostgreSQL; o driver não recebe parâmetros capazes de substituir o host validado.

### RED 4 — `localhost` e DNS

```text
$ npx vitest run tests/desempenho/trava-nuvem-benchmark.test.ts
2 falhas: HTTP e PostgreSQL em `localhost` foram aceitos.
```

As guardas agora aceitam somente os IPs literais `127.0.0.1`/`::1`.

### RED 5 — prova de instância e jobs

```text
$ npx vitest run tests/desempenho/trava-nuvem-benchmark.test.ts
2 falhas: validarBancoDescartavel is not a function.

$ npx vitest run tests/desempenho/trava-nuvem-benchmark.test.ts
2 falhas: validarJobsCronInativos is not a function.
```

Implementadas `validarBancoDescartavel` e `validarJobsCronInativos`; ambas falham fechadas em ausência, inconsistência ou erro de consulta.

### GREEN / verificações mais recentes

```text
$ npx vitest run tests/desempenho/trava-nuvem-benchmark.test.ts tests/desempenho/medir-metricas.test.ts
2 arquivos passaram; 36 testes passaram.

$ npx tsc --noEmit
(sem saída)

$ npm run check
Checked 297 files in 2s. No fixes applied.

$ git diff --check
(sem saída)
```

## Medições e bloqueios restantes

- Captura SQL preliminar: 5 aquecimentos + 30 amostras para as duas casas; os tempos e limitações estão em `docs/desempenho/baseline.md`. Foi antes de desativar `cron` e usou distribuição sem contas abertas; não é baseline aceita.
- Smoke atual: HTTP local respondeu 200; 15 consultas SQL autenticadas executadas na massa seedada com abertas/esquecidas, marcador presente e cron inativo. Foram 0 aquecimentos/1 amostra, portanto **não** é p50/p95.
- Os arquivos de saída detalhados são locais em `.superpowers/sdd/2026-10-24-otimizacao-sem-regressao/` e não devem ser publicados sem revisar os dados.
- O `EXPLAIN` de uma RPC PL/pgSQL pode apresentar apenas `Function Scan`; a duração/buffers da raiz são rotulados como tais e não atribuídos ao SQL interno. Medir as consultas internas permanece pendente.
- Também faltam: HTTP autenticado das RPCs, UI (build/start e navegação em mobile/desktop), PDF, ingestão via `receber-envio`, concorrência, cenários vazio/365d/estresse e confirmação de equivalência funcional. Logo, a baseline ainda é parcial e não autoriza alegar ganho ou iniciar otimizações SQL.
- As medições não acessaram produção/nuvem e não alteraram o Supabase compartilhado.

## Revisão anterior

Os commits prévios `ac3a0c6` e `d53c020` foram rejeitados nas revisões. `f51da81` corrigiu parte dos achados, mas ainda continha um medidor que não coletava métricas; esta continuação substitui esse no-op por medição real e registra limites que ainda faltam. O histórico das revisões está em `progress.md`.

## Revisão da implementação atual

- Corrigidos: aceitação de `localhost` (só IPs literais `127.0.0.1`/`::1`), risco de sobrescrita de host na query string PostgreSQL, falta de prova da instância (marcador exclusivo obrigatório), jobs ativos (trava fail-closed consulta `cron.job` antes de preparar/medir) e fixture com IDs/valores/tempos fixos e semente `20261024`.
- Permanecem: admin não medido; EXPLAIN interno de PL/pgSQL; cenários vazio, 365d/estresse, lacunas; ingestão, HTTP RPC, UI/PDF e concorrência; erro SQL aborta a captura sem linha parcial de erro. A captura estatística foi executada antes de desativar cron e com dataset sem contas abertas; por isso os tempos são apenas preliminares.
- Veredito do reviewer: **T0 não conforme/não aprovada** até resolver os itens pendentes; o relatório continua distinguindo essa captura preliminar do smoke de 1 amostra na massa nova.
