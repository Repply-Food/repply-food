# Baseline - Repply Food

**Status:** PARCIAL — instrumentos em revisão; nenhuma baseline aprovada nem otimização aplicada
**Data:** 2026-10-25
**Commit-base do código:** `f51da81`; harness T0 está em alterações não commitadas durante esta captura.

**Pausa em 25/10:** checkpoint preservado na branch `wip/otimizacao-baseline-2026-10-25`; servidores temporários e containers isolados desligados, sem remover dados. Estado para continuar: [`retomada.md`](retomada.md). A pausa não aprova a T0.

## Estado e limites

Foi preparada uma instância Supabase descartável isolada, com projeto e portas próprios `55420–55424`, migrations locais e sem seed padrão. O Supabase local compartilhado (portas `54321–54324`) não foi reiniciado nem alterado.

Foi concluída uma captura SQL com 5 aquecimentos e 30 amostras em duas casas/usuários. Ela é **preliminar, não aceita**: o `rf-vigia` ficou ativo durante parte da captura (executou quatro vezes), então não há garantia de ausência de interferência de cron. Nenhuma alteração de estado das métricas ou alerta externo foi detectada (`alertas_sinal=0`, `incidentes_sinal=0`). Os três jobs estão agora inativos na instância isolada, verificados com zero jobs ativos.

Uma segunda execução de smoke, no harness mais recente e na massa corrigida, confirmou o marcador de isolamento, a trava de cron e 15 consultas; usou 0 aquecimentos/1 amostra, portanto não fornece p50/p95. A T0 permanece parcial; os tempos abaixo registram a primeira captura para investigação, não autorizam alegar ganho nem iniciar otimizações.

## Ambiente Registrado

| Campo | Valor |
|--------|-------|
| SO | Linux |
| Node | v22.12.0 |
| Branch | correcao-rpcs-resultados-nulas |
| PostgreSQL | 17.11 |
| Kernel / CPUs lógicas | Linux 6.1.0-40-amd64 / 4 |
| Working tree | Suja; harness em revisão; a saída marca `workingTreeSuja=true` |
| Migrations aplicadas | 19 na instância isolada |
| Portas isoladas | API 55421; DB 55422; shadow 55420; SMTP UI 55424 |
| Isolamento | marcador próprio `benchmark_isolation_guard`; porta compartilhada 54321/54322 recusada |
| Cron | 0 jobs ativos após captura; alerta/incidente: 0/0 |
| Dados da captura 5+30 | por casa: 9.000 linhas, 9.000 códigos, 8.100 pagas, 0 abertas, 180 removidas, 90 dias com dados, 0 lacunas |
| Dados do smoke mais recente | por casa: 9.000 linhas, 9.000 códigos, 8.010 pagas, 90 abertas, 90 removidas, 90 dias com dados, 0 lacunas |

Migrations: `20261009120000`, `20261011201500`, `20261011213000`, `20261011213100`, `20261013120000`, `20261013130000`, `20261013140000`, `20261014120000`, `20261015120000`, `20261015130000`, `20261015140000`, `20261019120000`, `20261020140000`, `20261020160000`, `20261020170000`, `20261020180000`, `20261021100000`, `20261021110000`, `20261022120000`.

## Captura SQL preliminar — milissegundos

Cada par é `Casa A / Casa B`; 30 amostras medidas e 35 chamadas totais (5 aquecimentos + 30). O tempo inclui transação, `SET ROLE`/claims e ida/volta PostgreSQL.

| Operação | p50 A / B | p95 A / B | Linhas | Bytes A / B | EXPLAIN raiz (B) |
|---|---:|---:|---:|---:|---|
| Hoje — curva | 274,3 / 297,8 | 311,5 / 326,5 | 48 | 3.539 / 3.539 | 249,958 ms; 18.674 buffers |
| Hoje — comparação | 1.241,5 / 1.264,9 | 1.423,2 / 1.407,9 | 1 | 209 / 209 | — |
| Hoje — meta do mês | 130,9 / 115,9 | 144,8 / 140,5 | 1 | 122 / 112 | — |
| Resultados — 1d anterior | 7,2 / 8,5 | 11,2 / 10,9 | 1 | 494 / 494 | — |
| Resultados — 1d semana | 301,5 / 293,0 | 338,4 / 324,8 | 1 | 500 / 500 | — |
| Resultados — 7d anterior | 37,8 / 32,7 | 51,9 / 38,6 | 1 | 501 / 501 | — |
| Resultados — 7d semana | 818,9 / 789,4 | 946,5 / 880,1 | 1 | 507 / 507 | — |
| Resultados — 30d anterior | 149,0 / 150,7 | 172,4 / 200,8 | 1 | 505 / 505 | — |
| Resultados — 30d semana | 2.613,0 / 2.475,7 | 2.972,6 / 2.651,6 | 1 | 511 / 511 | — |
| Resultados — 90d anterior | 197,3 / 194,7 | 240,5 / 248,2 | 1 | 465 / 465 | — |
| Resultados — 90d semana | 5.995,3 / 5.955,3 | 6.634,2 / 6.566,8 | 1 | 468 / 468 | 5.610,121 ms; 485.564 buffers |
| Resultados — vendas diárias do mês | 216,1 / 214,8 | 247,8 / 235,9 | 24 | 2.209 / 2.209 | — |

O `EXPLAIN` de PL/pgSQL mostra a raiz (`Function Scan`); seus tempos e buffers não representam o SQL interno. A saída JSON integral fica no workspace ignorado `.superpowers/sdd/2026-10-24-otimizacao-sem-regressao/`.

O probe de saúde retornou HTTP 200; a duração de uma única chamada foi 42,7 ms (Casa A) e 166,1 ms (Casa B), sem significado de p95. O conjunto de dados medido na captura 5+30 precede o seed com semente e IDs determinísticos; a forma (90 × 100 por casa) foi igual, mas seus IDs/hash eram descartáveis.

## Cenários ainda não medidos

| Cenário | Status |
|---|---|
| Restaurante vazio | Não medido |
| 365d × 500 entradas/dia | Projetado; não medido (182.500 entradas por casa) |
| 730d × 1.000 entradas/dia | Estresse opcional; não medido |
| Histórico com lacunas / intervalo distante | Não medido |
| Concorrência 1/5/20 telas | Não medido |

## Conferência do app de produção local — continuação de 25/10

O build na instalação original foi bloqueado pela verificação de segurança: `node_modules` continha Next.js 16.4.0, embora o manifesto e o lock já determinassem 16.4.3. Uma cópia de execução sem `.env` recebeu `npm ci` com o lock existente; seu `npm run build` **passou com Next.js 16.4.3**. Não houve alteração de dependências do projeto. O app dessa cópia roda em `127.0.0.1:3100` exclusivamente contra a API descartável `127.0.0.1:55421`. Houve aviso de múltiplos lockfiles; esse detalhe deve acompanhar qualquer comparação futura.

Foi realizada uma primeira conferência visual de Hoje e das quatro abas de Resultados em 390/1440 px e temas claro/escuro, incluindo segunda casa e visão do admin. Trata-se de **smoke, não série estatística**. A captura inicial esperava os números, mas não o término da montagem/animação do gráfico: essas imagens não aprovam a superfície gráfica e exigem nova captura com condição de gráfico estável. Não houve transbordamento horizontal nos casos capturados.

A recaptura `ui-evidencias-v2/` concluiu os mesmos 28 casos esperando a geometria gráfica estabilizar: 26 telas renderizaram os números; as duas falhas continuam restritas a Hoje/admin. Houve conferência visual das barras, curva, mapa de calor e cartões/tabela da equipe, inclusive em celular e desktop e nos dois temas. Os registros distinguem tempo dos números e tempo do gráfico. Trocar somente as quatro abas não gerou nova leitura de dados nem navegação do documento; o Chromium fez algumas requisições adicionais a `/favicon.svg` ao atualizar a URL. Portanto, não afirmar literalmente “zero requisições”. A série estatística de navegação normal/4G é separada desse smoke.

### Falha preexistente observada: Hoje como admin

Nas duas larguras, Hoje abriu a tela de erro para o admin da fixture. Uma sonda diagnóstica sequencial das seis RPCs, com os argumentos efetivos do app e o relógio real, isolou o problema:

| Perfil / operação | Resultado da sonda única |
|---|---|
| Dono A / comparação diária | HTTP 200, aproximadamente 1.826 ms |
| Admin / comparação diária | HTTP 500, código `57014`, cancelada pelo `statement_timeout` em aproximadamente 8.025 ms |
| Admin / outras cinco RPCs do Hoje | HTTP 200 |

Essa é evidência diagnóstica, **não p50/p95**, não demonstra ganho nem autoriza mudar RLS ou aumentar limites. A falha existe no código-base de produto, que não foi otimizado. Artefatos locais ignorados: `ui-evidencias/`, `diagnostico-hoje-admin.json`, no workspace do plano. O relógio da tela foi o real (25/10); a massa e a futura série SQL usam referência fixa de 24/10, portanto não comparar diretamente esses números.

Os instrumentos HTTP/ingestão/EXPLAIN foram inicialmente rejeitados pela revisão: faltavam guardas, fidelidade das consultas e controle de concorrência/reconciliação. As correções de leitura já permitiram as sondas e os planos reais descritos adiante; ingestão e séries HTTP completas continuam pendentes de implementação/revisão/coleta. Isso não aprova a T0 inteira.

### PDF — série HTTP total

Na cópia de produção descrita acima, foram executados 5 aquecimentos + 30 amostras sequenciais por perfil, sem coleta de UI/SQL simultânea. Período explícito `01/10–24/10/2026`, comparação anterior, massa de 9.000 entradas por casa; marcador e zero jobs verificados antes/depois. O tempo inclui acesso, configuração, RPCs paralelas, montagem, renderização e transferência do PDF — **não é tempo isolado de renderização**. Máquina local compartilhada, sem garantia de exclusividade de CPU; não extrapolar para a Vercel.

| Perfil | p50 (ms) | p95 (ms) | Mín.–máx. (ms) | Dispersão máx.–mín. | Amostras / chamadas totais | Erros |
|---|---:|---:|---:|---:|---:|---:|
| Dono A | 1.047,7 | 1.225,5 | 869,0–1.249,4 | 380,4 | 30 / 35 | 0 |
| Dono B | 1.073,2 | 1.248,3 | 846,9–1.513,5 | 666,6 | 30 / 35 | 0 |
| Admin vendo A | 3.790,1 | 4.473,0 | 3.052,7–4.634,6 | 1.581,9 | 30 / 35 | 0 |

Todos os exemplares salvos têm seis páginas A4, aproximadamente 16,2 kB e as quatro seções. O texto extraído confirma faturamento R$ 211.200,00, taxa separada R$ 21.120,00, 2.112 contas e 7.536 pessoas, como na tela do mesmo intervalo. O exemplar A foi rasterizado e inspecionado nas seis páginas, sem corte de tabelas observado. Artefatos: `pdf-medicoes.json` (durações brutas), `pdf-{donoA,donoB,admin}.pdf/.txt` e `pdf-donoA-contato.png`, no workspace ignorado. Falta separar renderização/memória e ampliar cenários; esta série não encerra a T0.

### Navegação — primeira série de navegador

Foram concluídos oito grupos de 5 aquecimentos +30 navegações medidas, mais uma sonda de cache frio por grupo: 288 navegações registradas, sendo 240 medidas. Chromium 141.0.7390.54, dono A, tema claro, mesma cópia de produção. Resultados usa `01/10–24/10`, comparação anterior; Hoje usa relógio real. Valores abaixo são milissegundos desde o início da navegação até números úteis ou geometria gráfica estável, não só o skeleton.

| Largura / rede configurada | Tela | Números p50 / p95 | Gráfico p50 / p95 |
|---|---|---:|---:|
| 390 / normal | Hoje | 2.574,2 / 2.751,5 | 2.958,0 / 3.125,6 |
| 390 / normal | Resultados | 987,5 / 1.221,2 | 2.000,4 / 2.275,0 |
| 390 / 4G nominal | Hoje | 2.907,3 / 3.256,9 | 3.318,3 / 3.787,0 |
| 390 / 4G nominal | Resultados | 1.006,8 / 1.183,9 | 1.984,6 / 2.215,5 |
| 1440 / normal | Hoje | 2.882,5 / 3.292,3 | 3.249,9 / 3.648,9 |
| 1440 / normal | Resultados | 964,9 / 1.201,5 | 1.992,6 / 2.299,4 |
| 1440 / 4G nominal | Hoje | 2.845,2 / 3.140,9 | 3.239,4 / 3.709,4 |
| 1440 / 4G nominal | Resultados | 973,3 / 1.287,0 | 2.020,6 / 2.358,0 |

Limitações desta série: houve verificações de código na mesma CPU; o service worker estava ativo, e limpar somente o cache HTTP não prova ausência do shell em Cache Storage. Assim, **as sondas “sem shell” não valem como cache realmente frio**. A configuração 4G foi solicitada via CDP (150 ms, 1,6 Mbps de download, 750 kbps de upload), mas sua propagação a todas as requisições mediadas pelo worker ainda precisa ser calibrada; não aprovar esses grupos como referência 4G conclusiva. Um controle posterior com latência de 500 ms confirmou aproximadamente 528 ms em um fetch de manifesto, não todas as navegações. Repetir grupos relevantes com método explícito de cache/worker e sem testes simultâneos antes de comparar otimizações.

Todos os grupos preservam tempos brutos/dispersão/LCP/CLS/bytes no workspace: `ui-series/capturas.json`, `ui-series/resumo.json` e `ui-series-manifest.json`. CLS observado p95 foi zero nos oito grupos (máximo observado aproximadamente 0,000193). Bytes são Resource Timing até os números, não tráfego integral; interações são tempo até dois quadros locais, não INP de campo. Nenhuma troca de aba medida pediu novos dados.

### Sondas e planos internos reais

Após revisão das correções de leitura, a sonda SQL 0+1 de faturamento retornou uma linha, 89 bytes e zero erros para dono e admin com papel confirmado. É smoke, não série estatística. Login e conferência de UUID/papel/casa pela API e pelo DB também passaram nas três contas sintéticas, sem chamar métricas.

Foi coletado `auto_explain` nested real, não consultas simplificadas. O usuário local `postgres` é **não superusuário** e `LOAD` foi recusado com `42501`; a configuração administrativa foi realizada por `supabase_admin`, apenas nessa conexão descartável, antes de trocar para `authenticated`. As RPCs foram executadas com claims de dono/admin, referência fixa `24/10 às 23:00Z`. Nenhuma configuração global foi alterada.

Para limitar a quantidade de planos de auxiliares de segurança, a captura foi seletiva: `log_min_duration=5ms`, no máximo 1.000 avisos por operação, zero descartes observados. Não representa todas as consultas rápidas. Os tempos são **sob instrumentação**, amostra única, não p50/p95 nem latência normal:

| Operação / plano interno | Dono A (ms) | Admin (ms) |
|---|---:|---:|
| Faturamento / Aggregate | 201,711 | 1.624,295 |
| Comparação diária / Subquery Scan principal | 1.068,907 | 7.828,298 |
| Curva / Merge Join, 48 linhas | 125,407 | 850,832 |
| Meta / duas leituras Aggregate | 98,155 e 68,154 | 468,243 e 446,500 |
| Resultados 90d semanal / Aggregate principal | 6.116,792 | cancelado pelo limite de 20 s; planos parciais, sem custo completo |

Os `Function Scan` externos estão separados dos planos internos nos artefatos `planos-reais-{dono,admin}.json` e `planos-reais-resumo.json`. O erro `57014` da comparação semanal admin foi preservado; não foi convertido em tempo zero nem em série completa. Ainda falta repetir SQL 5+30 limpo e completar os demais perfis/superfícies para aprovar a T0.

### Conferência do ambiente e suíte isolada

A suíte completa rodou na cópia com Next.js 16.4.3 e portas dos helpers redirecionadas exclusivamente para `55421/55422`, sem relaxar asserções de negócio. Resultado em 25/10, 13:36Z: **1.347 aprovados, 4 falhas em 3 arquivos**, 304,45 s. Não é uma suíte integralmente verde:

- `tests/rotinas/estados-retencao.test.ts`: duas verificações exigem jobs ativos, incompatíveis com a proteção de medição que exige zero jobs ativos; não foram reativados.
- `tests/isolamento/todas-as-tabelas.test.ts`: a comparação exata de tabelas encontra `benchmark_isolation_guard` adicional. Seus privilégios de `anon` e `authenticated` estavam vazios; a diferença foi a tabela de proteção, não um grant extra de dados do produto.
- `tests/desempenho/preparar-ingestao.test.ts`: o caso de arquivo rastreado usa caminho do repositório original; na cópia `app-medicao/` esse caminho não é rastreado. A falha é de portabilidade do teste novo e continua registrada; não demonstra que a proteção tenha sido aprovada nessa cópia.

Depois da suíte, foram confirmados marcador correto, zero jobs ativos, Vault vazio, zero alertas/incidentes e 9.000 entradas em cada casa A/B, com 90 abertas e 90 removidas. São 8.010 marcadas pagas, mas **7.920 pagas válidas** por casa após excluir removidas.

O inventário global revelou **14 casas sintéticas e 36.000 entradas**: além das duas casas principais, havia duas casas de ensaios anteriores com 9.000 entradas cada e dez vazias. Todas foram criadas antes das 08:35Z, portanto anteriores à série UI e à suíte desta rodada. Não foram apagadas. A cardinalidade global também afeta varreduras e regras de acesso: as medições deste ambiente não podem ser apresentadas como um banco contendo apenas 18.000 entradas. Qualquer comparação posterior deve preservar ou declarar essa população global. Evidências ignoradas: `estado-pos-suite.json`, `inventario-casas-pos-suite.local.json`, `suite-isolada-{ajustes,resultado}.json` e saída local com modo 0600.

## Travamento de Nuvem

**Implementado nesta tarefa:**
- `scripts/desempenho/trava-nuvem.ts` - validadores fail-closed (protocolo + host local-only)
- `tests/desempenho/trava-nuvem-benchmark.test.ts` - testes de guarda
- Recusa HTTP/Postgres remoto, `localhost`, portas compartilhadas, query/fragmento no URL e HTTP com credenciais
- Exige marcador exclusivo do banco descartável e zero jobs `pg_cron` ativos antes de semear/medir
- Mensagens sem vazar URL/credenciais
- Aceita apenas `http:`/`https:` e `postgres:`/`postgresql:` em `127.0.0.1` ou `[::1]`, nas portas isoladas

## Próximos passos

1. Repetir a captura 5+30 com o harness atual e jobs cron desativados, incluindo a massa seedada com contas abertas/esquecidas.
2. Coletar EXPLAIN das consultas internas PL/pgSQL com mesmo papel/claims.
3. Completar ingestão pela função local, HTTP autenticado, UI/PDF, admin e concorrência; executar vazio, lacunas e demais tamanhos se recursos permitirem.
4. Não iniciar otimizações SQL até aprovar uma baseline reproduzível e completa para os caminhos que serão alterados.

**NUNCA** inventar métricas. Os cenários projetados, a amostra de smoke e as futuras medições estatísticas são categorias distintas.
