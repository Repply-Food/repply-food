# Otimização sem regressão — plano de implementação

> **Para o executor:** usar `subagent-driven-development` ou `executing-plans` conforme o fluxo aprovado do repositório. Executar uma tarefa por vez, com testes e revisão. A execução local foi autorizada pelo Lucas na conversa; isso não autoriza publicar nem alterar produção. T0 permanece parcial e bloqueia otimizações.

**Objetivo:** reduzir trabalho e latência do MVP preservando números, funcionalidades, acesso e operação do SCC.
**Arquitetura:** manter Next.js/Supabase, SQL como fonte das métricas, RLS e PDF no servidor. Priorizar SQL sem mudar contratos; só avançar para alterações estruturais se o baseline justificar.
**Stack:** Next.js 16 / React, TypeScript, PostgreSQL 17 / Supabase, Vitest, Recharts, React PDF.
**Base:** `422eaef`, em 24/10/2026. **Estado em 25/10:** execução local autorizada; T0 em instrumentação/medição/revisão, sem aceite. T1–T12 não iniciadas. Evidências e limitações em [`baseline.md`](../../desempenho/baseline.md).
**Desenho e evidências:** [diagnóstico](../specs/2026-10-24-desempenho-sem-regressao-design.md).

## Regras de execução

1. Ler `AGENTS.md`, `CLAUDE.md`, desenho acima e `docs/metricas.md`. Conferir alterações posteriores a `422eaef` antes de implementar. Não sobrescrever trabalho de outra pessoa.
2. Trabalhar em ambiente local isolado. Worktree não isola o Supabase: confirmar portas/projeto e quem usa o banco antes de reset, migration ou fixture volumosa. Não resetar banco compartilhado automaticamente.
3. Testes de regressão primeiro; migration nova, nunca editar migration publicada. Preservar funções públicas e `security invoker`. Não criar função auxiliar aberta por padrão.
4. Teste funcional não deve depender de milissegundos de uma máquina compartilhada. Benchmark fica separado da suíte normal.
5. Cada tarefa: evidência inicial → teste relevante → mudança mínima → teste → medição equivalente → revisão → commit local pequeno em português. Não empilhar mudanças para tentar acertar a medição.
6. Não adicionar dependências pesadas se os helpers, `pg`, `tsx` e ferramentas atuais bastarem.
7. Resultado sem ganho ou com equivalência inconclusiva não avança. Registrar hipótese descartada; não manter otimização só porque já foi escrita.
8. Se surgir diferença entre comportamento atual e regra de produto, parar nessa diferença e consultar o Lucas. Não alterar o esperado para fazer o teste passar.
9. Commit não significa publicação: push de `main` publica frontend; migrations/configurações remotas exigem autorização específica.
10. Lotes condicionais não são lista de mudanças obrigatórias. RLS, reescrita em lote do SCC e nova arquitetura exigem retorno à análise, mesmo que o executor seja capaz de codificá-las.

## Dependências e ordem

```text
T0 baseline → T1 equivalência → T2 meta → T3 curva → T4 semanal → T5 índices
           └────────────────→ T6 refresh / T7 admin
T2–T7 medidos → T8 recursos do navegador
             → T9 decisão sobre transporte/contexto
             → T10 reconciliação SCC (somente se necessária)
             → T11 reservas de escala (analisar, não implementar automaticamente)
Lote escolhido concluído → T12 validação integrada e entrega
```

Fazer T2 primeiro dá um ciclo pequeno de equivalência/medição antes das duas reescritas mais delicadas. T6/T7 são independentes do SQL, mas não compartilhar banco de testes com outros executores sem isolamento.

## T0 — Produzir baseline reproduzível

**Criar:** `scripts/desempenho/medir-metricas.ts`, `scripts/desempenho/cenarios.ts`, `docs/desempenho/metodologia.md`, `docs/desempenho/baseline.md`.
**Reutilizar:** `tests/helpers/supabase-local.ts`, gerador fictício, `urlLocalDoSupabase` de `lib/supabase/service.ts` e testes `tests/supabase/trava-nuvem.test.ts`/`tests/gerador/trava-nuvem.test.ts` como referência das guardas.
**Inspecionar:** `scripts/gerador-dados-ficticios.ts`, `vitest.config.ts`, `docs/operacao/publicar.md`.

### Passos

1. Registrar commit, versões, ambiente, portas, migrations aplicadas, máquina e método. Não imprimir `.env`, cookies, tokens, credenciais ou payload real.
2. Montar cenários determinísticos com semente e relógio fixo, pelo menos duas casas e usuários distintos. Usar as fixtures existentes; construção em massa direta só em banco descartável para medir leitura, claramente separada de teste da ingestão real.
3. Cenários sugeridos (massa sintética, não previsão comercial): vazio; 90 dias × 100 contas/dia; 365 × 500; 730 × 1.000 como estresse opcional. Registrar distribuição real de abertas, removidas, pagas, códigos e lacunas. Reduzir o maior se faltar recurso, sem esconder a limitação.
4. Para ingestão usar caminho real e lotes de 10, 500 e 2.000 entradas, respeitando também 2 MB, ritmo, datas e reconciliação. Não dividir uma mesma janela em lotes incompletos que removam entradas de outro lote. Medir repetição idêntica, alteração parcial e reaparecimento.
5. Medir Hoje e Resultados para 1/7/30/90 dias, comparação anterior/semanal, meta presente/ausente. Incluir intervalo histórico distante e histórico com grandes lacunas.
6. Medir SQL sob `authenticated` com claims da fixture, usando `comoAutenticado`. Medir dono e admin. Superusuário serve para preparar massa, não como substituto do perfil real.
7. Coletar `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` em leitura local. RPC PL/pgSQL pode expor só `Function Scan`: também analisar a consulta interna com parâmetros equivalentes e mesmo papel, sem atribuir custo interno a um nó opaco. `auto_explain` com nested statements só no ambiente descartável, se necessário.
8. Separar tempo total HTTP, tempo SQL, autenticação, configuração, montagem React e PDF. O tempo HTTP menos SQL é apenas aproximação de transporte/fila/runtime. Não somar durações de chamadas paralelas para representar latência.
9. Para rastreamento local temporário, usar marcas de duração por operação com nomes fixos. Nenhum argumento, corpo SQL, JWT ou resposta sensível em log. Não criar serviço externo de telemetria nesta tarefa.
10. Rodar app com `npm run build` e `npm run start` para medições de UI; desenvolvimento inclui custos que não representam produção. Observar 390 px e desktop, 4G simulada e rede normal, cold/warm, com/sem shell em cache.
11. Executar 5 aquecimentos + pelo menos 30 amostras medidas por cenário; para p95 confiável buscar 100 e registrar tamanho da amostra. Alternar versões A/B, repetir séries, registrar mediana/p95 e dispersão. Partida fria em grupo separado; não chamar primeira consulta local de cold start da Vercel.
12. Concorrência sintética local: 1/5/20 telas, mesma casa e casas distintas. Se fila/timeout aparecer, parar a escala e registrar. Sem teste de carga no cliente piloto ou casa de demonstração.
13. Benchmark de escrita executa efeitos: usar banco descartável e dados próprios. Rollback não desfaz necessariamente efeitos externos; não disparar cron/pg_net/Resend reais.

### Entrega/aceite

- Tabela por cenário: p50/p95, amostras, chamadas, linhas/loops/buffers, bytes, erros; PDF inclui tempo de renderização e memória quando disponível.
- Leitura não exige nova rede ao trocar somente aba; registrar confirmação no navegador.
- Medir tempo até números úteis e gráfico, não só TTFB do skeleton. Registrar LCP/CLS e latência de interação; teste local não representa INP de campo.
- Benchmark recusa endpoint remoto de HTTP **e** de Postgres, independentemente de `NODE_ENV`, `PERMITIR_NUVEM_NO_DEV` ou opção de confirmação do gerador; as guardas existentes permitem exceções que não servem para este benchmark. Conferir também as URLs do app iniciado com build de produção. Testes de guarda cobrem a recusa. Limpeza só de fixtures próprias, conforme autorização para o ambiente descartável.
- Registrar gargalo dominante e escolher as tarefas seguintes. Sem baseline não declarar que uma otimização melhorou o sistema.

## T1 — Construir a rede de equivalência

**Alterar:** testes em `tests/metricas/`, `tests/isolamento/resultados.test.ts`, `tests/pdf/resultados.test.tsx` conforme cada função afetada.
**Criar:** `tests/metricas/equivalencia-desempenho.test.ts` e fixtures auxiliares apenas se evitarem duplicação real.

### Passos

1. Capturar resultados da versão anterior com dataset e parâmetros determinísticos. Comparar com a nova versão em dois bancos descartáveis equivalentes ou execuções sequenciais reprodutíveis. Se usar função-oráculo local, não publicá-la nem expô-la ao app; garantir o mesmo papel/RLS.
2. Complementar comparação diferencial com exemplos de resultado conhecido. O comportamento antigo não é prova suficiente de correção se ambos os caminhos tiverem o mesmo erro.
3. Comparar todas as colunas, nulos, quantidade e ordem das linhas. Para dinheiro validar tipo texto e igualdade decimal exata, sem `Number`/tolerância de centavos; não mascarar mudanças observáveis de formato. Campos sem ordem contratada podem ser ordenados por chave só no comparador.
4. Cobrir zero/uma/duas/quatro/mais ocorrências; dias sem movimento; pagamentos depois do horário comparado; taxa; descontos; pessoas zero/nulas; total zero; removida/reaparecida; códigos desconhecidos/nulos; empates.
5. Cobrir 00:00, antes/exatamente/depois da virada, virada com minutos/segundos, fim do mês/ano, bissexto, fusos distintos e transições históricas de horário de verão. Reaproveitar parâmetros `p_agora`/`p_ate` em vez de simular relógio do banco globalmente.
6. Isolamento: dono A/A, A/B, B/B, admin/A, sem acesso e anon; mesmos códigos SCC em A e B. Para agregadoras, incluir duas sessões simultâneas e revogação/troca de acesso entre requisições.
7. Registrar screenshots/conteúdo de Hoje, quatro abas e PDF com a mesma massa. PDF: comparar texto extraído, todas as seções, ordenação e paginação legível; não exigir igualdade binária de metadados do arquivo.
8. Caracterizar URL, voltar/avançar, troca rápida de filtros, reload, logout, troca de casa e navegação instalada. Reportar comportamento inesperado preexistente separadamente.

**Comandos iniciais:**

```bash
npx vitest run tests/metricas tests/isolamento tests/pdf/resultados.test.tsx
```

**Aceite:** matriz de casos passa na base; cada alteração posterior tem teste que detectaria sua regressão. Não relaxar asserts antigos para acomodar implementação nova.

## T2 — Meta mensal com uma leitura de entradas

**Origem:** `supabase/migrations/20261019120000_metricas_hoje.sql:277–330`.
**Criar:** migration aditiva `AAAAMMDDHHmmss_otimiza_meta_do_mes.sql` (timestamp real da execução).
**Alterar testes:** `tests/metricas/meta-do-mes.test.ts`, equivalência de T1.

1. Acrescentar casos de fronteira do mês e de pagamento futuro antes de mudar SQL.
2. Dentro da função, substituir as duas leituras de entradas por uma consulta delimitada do início do mês ao dia atual, retornando duas somas: total e total com `dia_operacao < v_dia_hoje`. Ambas preservam `pago AND fechada_em <= p_agora`, `coalesce` e exclusão de removidas.
3. Manter consulta/herança de meta, cálculo de projeção, nomes/tipos de retorno e falta de acesso.
4. Rodar testes e medir p50/p95/buffers em mês curto/cheio e casa vazia. Validar Hoje e Resultados/Mês, incluindo PDF.

**Aceite:** equivalência integral; leitura redundante eliminada no plano sem regressão mensurável. Commit sugerido: `Otimiza a leitura da meta mensal sem alterar os cálculos`.

## T3 — Curva do Hoje sem multiplicar cada conta por 48 pontos

**Origem:** `20261019120000_metricas_hoje.sql:184–256`.
**Criar:** migration `AAAAMMDDHHmmss_otimiza_curva_do_dia.sql`.
**Testes:** `tests/metricas/curva-do-dia.test.ts`, `comparacao-do-dia.test.ts`, `faturamento-do-dia.test.ts`, equivalência.

### Algoritmo especificado

1. Preservar seleção dos quatro dias históricos: anteriores, mesmo dia da semana, pelo menos uma paga válida no dia inteiro. Não filtrar pelo horário atual durante a seleção dos dias.
2. Construir conjunto pequeno de dias: hoje + ocorrências. Calcular o início real de cada dia com `date + hora_virada AT TIME ZONE fuso` uma vez por dia.
3. Ler contas pagas válidas somente desses dias. Para cada fechamento não nulo, determinar a primeira faixa em que `fechada_em <= inicio + make_interval(mins => 30 * indice_faixa)`:
   - `faixa = greatest(0, ceil(segundos_decorridos / 1800))` como índice 0–47;
   - exatamente na borda pertence àquela borda; um segundo depois pertence à seguinte;
   - fechamento anterior ao início entra no ponto 0, preservando a função antiga mesmo em dado anômalo;
   - faixa > 47 não entra em nenhum ponto; não truncar para 47;
   - `segundos_decorridos = extract(epoch from (fechada_em - inicio))`; usar precisão do timestamp, sem arredondar para minuto antes do `ceil`;
   - na saída, `minuto_do_dia = 30 * indice_faixa`; não devolver índice 0–47 como se fosse minuto.
4. Agregar faturamento por `(dia, faixa)` antes de cruzar com a grade.
5. Criar grade de 48 faixas para cada dia selecionado, preencher lacunas com zero e calcular `sum(...) over (partition by dia order by faixa rows between unbounded preceding and current row)`.
6. Média histórica por faixa inclui zeros dos dias selecionados; somente disponível com duas ou mais ocorrências. Arredondar no mesmo ponto da função anterior.
7. Ocultar faixas futuras de hoje exatamente como antes e retornar 48 pontos ordenados, com dinheiro como texto. Manter zero versus ausência de acesso/nulo.

### Testes obrigatórios adicionais

- Fechamentos no início, 29:59, 30:00, 30:01, 1410 min e depois da última faixa; segundos fracionários se suportados no dataset SQL.
- Conta paga sem fechamento; fechamento antes da abertura; sem histórico; duas ocorrências com movimento apenas depois do horário observado.
- Virada com minutos, madrugada, instante histórico e transição de fuso. Não assumir que toda distância entre meias-noites locais tem 24 horas; preservar os instantes calculados pelo SQL atual.

**Aceite:** paridade de todos os 48 pontos e métricas relacionadas; plano mostra agregação antes da grade em vez de expansão de cada entrada; ganho repetível nos cenários com volume. Nenhuma alteração de gráfico/regras para disfarçar diferença.

## T4 — Comparação semanal agregada por dia

**Origem efetiva:** `20261021100000_limita_e_compara_pessoas_resultados.sql:16–91`; validação nula em `20261021110000_rejeita_datas_nulas_resultados.sql`.
**Criar:** migration `AAAAMMDDHHmmss_otimiza_comparacao_semanal_resultados.sql`.
**Testes:** `tests/metricas/resultados-sql.test.ts`, equivalência, PDF.

1. Cobrir referências diferentes dentro do mesmo intervalo e grandes lacunas antes de mudar a função.
2. Alterar primeiro somente o ramo `p_comparacao = 'semana'`; manter cálculo atual e ramo anterior intactos.
3. Agregar entradas pagas/válidas da casa por `dia_operacao`, até `p_fim`, em faturamento, contas e pessoas. Somente dias com movimento entram. Não impor corte inferior arbitrário de 28/90 dias ao histórico.
4. Sobre essa série diária, calcular janelas particionadas pelo dia da semana, ordenadas por data, com `ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING`. Obter contagem das ocorrências e médias de faturamento/contas/pessoas.
5. Filtrar os dias selecionados **depois** das janelas. Filtrar antes eliminaria as referências externas ao período.
6. Somar as médias dos dias selecionados; só disponibilizar se todos os dias necessários tiverem ao menos duas ocorrências. Período sem movimento mantém o comportamento nulo vigente.
7. Preservar arredondamento apenas nos mesmos estágios, referências de ticket derivadas das somas e diferenças entre zero e nulo. Nunca tirar média de tickets individuais como substituto.
8. Medir também 1 dia com anos de histórico. Agregar todo histórico pode perder para `LATERAL ... LIMIT 4` com bom índice nesse cenário. Se houver regressão, não adicionar heurística arbitrária por tamanho: comparar seleção limitada de dias históricos ou retornar para nova análise.

**Aceite:** igualdade em 1/7/30/90 dias e histórico esparso; ganho em cenários relevantes sem piora injustificada no caso curto; todas as oito RPCs continuam com limite e tratamento de nulos corretos.

## T5 — Índices e acesso a contas abertas, guiados pelo plano

**Criar somente os aprovados pelo benchmark:** migrations aditivas por índice/família.
**Testes:** métricas, recepção, isolamento e benchmark de escrita.

### Candidatos, não uma lista para criar inteira

| Alvo | Candidato | Condição para adotar |
|---|---|---|
| Histórico pago | `(restaurante_id, dia_operacao) WHERE removida_em IS NULL AND pago` | Se seletividade/tamanho superar índice existente; testar custo de mudanças em `pago` |
| Dia da semana | `(restaurante_id, (extract(dow from dia_operacao)), dia_operacao DESC)` parcial | Só se seleção histórica dominar após T3/T4; query deve casar com expressão |
| Abertas | `(restaurante_id, aberta_em, cod_entrada)` parcial de abertas válidas | Se leitura/ordenação de abertas ainda for relevante |
| Fechamentos e reconciliação | `(restaurante_id, fechada_em)` e eventualmente `(restaurante_id, aberta_em)` parciais de válidas | Se T10 demonstrar plano melhor; medir escrita |
| Lista do admin | `(restaurante_id, recebido_em DESC) WHERE versao_scc IS NOT NULL` em envios | Se lateral percorrer muitos envios sem versão |
| Acessos no detalhe | `(restaurante_id, user_id)` | Se volume justificar e PK existente não atender |
| Retenção | índice por idade parcial `WHERE payload IS NOT NULL` | Se rotina varrer histórico grande; considerar custo de tirar payload do índice |

Não usar `now()` em predicado de índice parcial. Não duplicar nomes/definições existentes. Não apagar índices antigos automaticamente; eventual retirada exige avaliação de todos os consumidores e autorização.

Para RPCs de mesas/esquecidas, testar separar ramos disjuntos com `UNION ALL`: `fechada_em IS NULL` e `fechada_em > p_agora`. Ambos preservam `aberta_em <= p_agora`, restaurante, removidas e limite. Não usar `UNION` que deduplica nem limitar a três linhas: “ver todas” precisa do conjunto completo.

**Aceite:** plano, p95, buffers, tamanho de índice e custo de lote SCC comparados. Um `Seq Scan` em tabela pequena não é por si só problema. Escolher forma de criação online só na preparação autorizada de produção: `CREATE INDEX CONCURRENTLY` não cabe em transação normal da migration; não copiar cegamente o comando para o fluxo transacional.

## T6 — Refresh consciente da visibilidade

**Alterar:** `components/painel/hoje/atualiza-hoje.tsx`.
**Criar:** `tests/painel/atualiza-hoje.test.tsx`.
**Preservar:** `intervaloMs={60_000}` na página, selo e métricas baseadas em tempo.

1. Testar timer com aba visível, oculta, offline, retorno online, `pageshow`, desmontagem e React StrictMode.
2. Agendar enquanto visível e não explicitamente offline. `navigator.onLine` é indício, não garantia de rede.
3. Ao ocultar/offline, cancelar agendamento. Ao retornar visível/online ou voltar de bfcache, solicitar atualização e reiniciar cadência. Coalescer eventos simultâneos para não gerar duas chamadas.
4. Não fazer refresh extra na montagem normal que já recebeu dados do servidor. Diferenciar montagem inicial de retomada do ciclo.
5. `router.refresh()` não retorna Promise de conclusão: não usar `await refresh()` como trava de requisição. Se medições mostrarem sobreposição, validar `useTransition` e ciclo real de pendência na versão do Next antes de adicionar controle; não inventar flag liberada por um timeout arbitrário.
6. Remover todos os listeners/timers na desmontagem. Não coordenar todas as abas/aparelhos por infraestrutura nova nesta tarefa.
7. Testar: SCC parado, virada do dia/mês, conta que ultrapassa quatro horas sem novo envio, sessão expirada e troca de casa. O tempo sozinho altera números/alertas; não otimizar com “último envio igual, não atualiza”.

**Aceite:** zero refresh programado oculto/offline, retomada imediata sem duplicata, mesma cadência visível, sem perder “ver todas” e estado do painel. Demonstrar economia de requisições no navegador e comportamento no PWA.

## T7 — Eliminar espera evitável no detalhe do admin

**Alterar:** `app/admin/restaurantes/[id]/page.tsx`.
**Testes:** `tests/admin/detalhe-fechavel.test.tsx`; criar `tests/admin/pagina-detalhe.test.tsx` se necessário para testar ordem das leituras.

1. Após `exigirAdmin`, iniciar a leitura de lista e detalhe sem que uma espere a outra. Manter o `Suspense` do detalhe e sua apresentação já aprovada.
2. Preferir componentes assíncronos irmãos com fronteiras adequadas, ou promise antecipada consumida pelo detalhe, conforme verificação da versão instalada. Se antecipar promise, tratar rejeição desde a criação para não gerar rejeição não observada enquanto a lista aguarda.
3. Não transformar em `await Promise.all(lista, detalhe)` antes do retorno: isso faria a lista esperar o detalhe e perderia streaming.
4. Manter `notFound`, guardas, ordem/prioridade da lista, destaque da casa e navegação móvel. Não escolher versão de layout por User-Agent nem esconder consultas de segurança.
5. `lerUsuarios` já deduplica IDs. Se o benchmark mostrar muitos autores e pressão no Auth, limitar simultaneidade local dessa leitura e testar todos os usuários retornados. Não listar todo o diretório Auth para evitar chamadas por ID; não cachear dados de conta globalmente.
6. Auditoria em `lib/admin/registro.ts` pode esperar no layout e tentar inserção repetida por hora; medir antes de mudar. Não lançar escrita sem aguardar nem trocar índice único por memória local na Vercel.

**Aceite:** detalhe começa antes de a lista terminar; lista continua aparecendo sem aguardar Auth do detalhe; erro de uma leitura não vira dado falso. Conferir 390 px e desktop, fechar/abrir detalhe, editar/suspender/reativar e revalidação.

## T8 — Recursos do navegador, conforme trace

**Inspecionar/alterar se justificado:** `app/layout.tsx`, `identidade-visual/fontes/`, `components/painel/hoje/curva-do-dia.tsx`, `components/painel/resultados/grafico-*.tsx`, `components/ui/chart.tsx`, `public/sw.js`.

1. Registrar arquivos realmente baixados, comprimidos, fonte de cache, tempo de parse/hidratação e tarefas longas. Fontes do layout totalizam cerca de meio MB no disco; isso não é tamanho medido de download.
2. Confirmar se preloads de oito arquivos competem com recurso crítico. Testar ajuste seletivo de preload antes de conversão de formato. Manter famílias, pesos e fallback; não remover acentos/símbolos BRL.
3. WOFF2 só se licença/ferramenta permitirem e aparência for equivalente; preservar originais da identidade visual. Não substituir tipografia da marca para atingir meta de bytes.
4. Considerar importação dinâmica de gráfico somente se reduzir JS inicial sem atrasar o conteúdo principal; reservar tamanho e manter tabela alternativa, tooltip, tema e acessibilidade. Não desativar SSR indiscriminadamente.
5. Manter dados das quatro abas disponíveis. Avaliar payload RSC sem presumir que todo objeto `dados` virou JSON duplicado: Server Components passados como slots não equivalem a serializar o objeto inteiro quatro vezes.
6. Cache shell usa nomes imutáveis, mas pode acumular arquivos de vários deploys sob `rf-shell-v1`. Se armazenamento crescer, desenhar limpeza compatível com abas ainda abertas; não limpar todos os caches durante uso. A gravação assíncrona pode usar `event.waitUntil` se for alterada, com tratamento de falha sem bloquear rede.

**Aceite:** bytes/tempo realmente menores, sem CLS ou atraso maior do gráfico, sem regressão visual ou de atualização do PWA. Se o custo estiver no servidor, encerrar tarefa sem mudar frontend.

## T9 — Decisão sobre transporte e contexto da casa

**Esta tarefa primeiro produz decisão com evidência.** Só implementar a alternativa estritamente necessária e revisada após T0–T8.

### A. Contexto da casa

Se configuração serial representar parte relevante da latência, avaliar incluir `hora_virada` e `limite_conta_esquecida` nas leituras já autorizadas de `obterSessao`/`casaPeloEndereco`. São dados não secretos, mas aumentam o contexto de todas as casas do login.

- Arquivos: `lib/auth/sessao.ts`, leitores de configuração das páginas Hoje/Resultados e rota PDF; todos os consumidores de `CasaDoLogin` e seus mocks.
- Não basta colocar `cache()` num novo leitor: hoje há uma única leitura de configuração por página, e memoização não elimina uma chamada única.
- Se escolhido, alterar ambos os caminhos, dono e admin, e passar só as props necessárias ao cliente. Manter validações de configuração ausente.
- Testar alteração de fuso/virada/limite e revogação de acesso entre pedidos. Não persistir autorização entre requisições. Não prometer deduplicação React em Route Handler.
- Se aumentar complexidade/payload sem benefício, manter leitura atual.

### B. RPC agregadora

Se rede/fila continuar dominante, prototipar primeiro **uma** superfície (Hoje ou Resultados), mantendo função pública antiga como fonte da regra. Nova função `metrica_painel_*` com `security invoker`, autorização via RLS, parâmetros validados, grants mínimos e retorno tipado/validado.

- Agregadora chama funções existentes; não copiar fórmulas para TypeScript nem converter métricas para `security definer`.
- Uma chamada com 8 consultas internas pode ser mais lenta que oito HTTP paralelos: comparar latência, CPU e concorrência. Sem ganho, descartar protótipo.
- Se o problema for varredura repetida, wrapper por si só não resolve; compartilhar base SQL exigirá novo desenho, para manter uma única definição das métricas.
- Retorno composto/JSON deve manter nomes, arrays, `null`, texto decimal e ordem. Dinheiro não pode virar número JSON por acidente. Validação runtime sem `as unknown as` que finja contrato.
- Tela e PDF usam o mesmo leitor. Meta continua apenas em Mês; erro parcial continua erro, não preenchimento com zeros.
- Manter migração compatível com frontend anterior. Atualizar `types/database.types.ts` via `npm run types` e allowlist em `tests/isolamento/funcoes-fechadas.test.ts`.
- Testes: RPC direta A/B/anon/admin, parâmetros inválidos/nulos, concorrência, leitura e PDF; comparar com conjunto completo das RPCs antigas.

### C. RLS

Se planos autenticados mostrarem custo alto das políticas, voltar para análise especializada antes de editar. Função `stable` não garante execução única; mas repetição textual também não prova chamada por linha.

Subconsultas para avaliar `auth.uid()` ou admin uma vez são candidatas apenas quando independentes da linha. `(SELECT tem_acesso(restaurante_id))` permanece correlacionado e não é garantia de cache. Nunca substituir por `tem_acesso` de um ID fornecido pelo cliente para autorizar toda a tabela; nunca remover RLS ou usar service role para leitura do dono.

**Aceite de T9:** decisão registrada com números e escopo. Se implementar A/B, revisão de segurança e equivalência antes de integrar. C não é autorização automática para reescrever políticas.

## T10 — Reconciliação SCC com limites de tempo indexáveis

**Executar somente se T0 mostrar reconciliação relevante.**
**Origem efetiva:** `20261014120000_recepcao_barra_valor_composto.sql`.
**Criar:** migration aditiva substituindo a função completa com alteração localizada no passo 6; não perder sanitização acrescentada pelas migrations posteriores à fundação.
**Testes:** `tests/recepcao/envio.test.ts`, `campos-permitidos.test.ts`, `registro-erro.test.ts`, isolamento e equivalência de estado.

1. Preservar passos anteriores/posteriores e trava transacional por restaurante.
2. Calcular `inicio = p_desde::timestamp AT TIME ZONE fuso` e `fim_exclusivo = (p_ate + 1)::timestamp AT TIME ZONE fuso`. Cada meia-noite é convertida separadamente; não usar `inicio + quantidade_dias * interval '24 hours'` em fusos com transição.
3. Comparar `aberta_em >= inicio AND aberta_em < fim_exclusivo`, idem fechamento. Manter ramo `fechada_em IS NULL` e filtro dos códigos recebidos, restaurante e `removida_em IS NULL`.
4. Não substituir janela civil por `dia_operacao`; isso mudaria remoção perto da virada.
5. OR pode continuar dificultando índice. Só se o plano exigir, selecionar códigos candidatos por ramos e deduplicar antes de um único UPDATE; manter contagem de removidas exata e snapshot transacional.
6. Testar limites inclusivos, mês/bissexto, fusos históricos, conta aberta fora da janela, abriu antes/fechou dentro, abriu dentro/fechou depois, já removida, reaparecida e janela vazia.
7. Comparar não só entradas, mas JSON de resposta, contadores, sinal, pedido de reenvio, uso de token e payload sanitizado. Verificar sanitização também na chamada direta privilegiada.
8. Duas conexões para a mesma casa devem preservar serialização; casas distintas não devem bloquear desnecessariamente entre si. Capturar espera de lock separada da execução.
9. Medir `duracao_ms` existente sabendo que é capturado antes do insert final de `envios`: ele não representa sozinho todo o HTTP, gravação de payload e commit.

**Aceite:** nenhuma diferença de estado/contagem e melhora sob carga representativa sem regressão de leitura. Qualquer dúvida na reconciliação interrompe o lote; não arriscar dados do piloto por microganho.

## T11 — Reservas de escala, sem reescrita automática

Registrar os seguintes gatilhos no relatório final; abrir novo desenho apenas se atingidos:

- **Ingestão em lote:** loop por 2.000 entradas domina após T10. Antes de set-based, caracterizar códigos duplicados no envelope, ordem, hash exato, reaparecimento, contadores, sanitização e atomicidade. `ON CONFLICT` em lote pode falhar quando código repete; não supor unicidade sem validar contrato e código.
- **Tamanho do corpo:** `req.text()` carrega tudo antes de verificar 2 MB. Leitura limitada por stream pode reduzir memória sob carga, mas precisa preservar limite em bytes, UTF-8, erro 413 antes da autenticação e precedência de respostas. É melhoria separada, não justificativa para alterar o contrato SCC.
- **Retenção:** medir tamanho de `envios`/TOAST, linhas mortas, WAL, autovacuum e duração de `rf-retencao`. Limpar payload não apaga resumo nem necessariamente reduz arquivo físico imediatamente. Não propor `VACUUM FULL` ou exclusão de histórico como atalho.
- **Volume:** 1 envio/5 min durante 24 h equivale a 288 resumos/dia/casa; é teto desse ritmo, não operação observada. Retenção diária de 48 h permite payload permanecer até a próxima execução. Medir bytes reais antes de prever capacidade do plano Free.
- **Admin:** paginação precisa preservar contadores globais, ordem de atenção e acesso a todas as casas; exige desenho de produto. Nunca acrescentar `limit(100)` silencioso. Conferir também limite de linhas PostgREST para crescimento futuro.
- **Alarmes:** verificar backlog frente ao lote de 20 por ciclo e respostas `net._http_response`. Não aumentar paralelismo/ritmo sem avaliar Resend, retries, idempotência e retorno ordenado.
- **PDF:** se renderização/memória dominarem, avaliar streaming com tratamento de erro após headers; manter todas as quatro análises, conteúdo, autenticidade, `no-store` e sem URL pública persistente. Streaming não elimina custo SQL nem garante PDF mais rápido.
- **Infraestrutura:** confirmar região real da função Vercel e distância ao Supabase; mudanças de região/plano exigem autorização e verificação das capacidades atuais do provedor. Não trocar de banco/framework por hipótese.
- **Cache/materialização:** novo desenho precisa cobrir envio repetido/alterado, remoção/reaparecimento, fuso/virada, turno/meta, permissão, madrugada e vigia. Não reduzir frequência visível nem guardar números em CDN/service worker.

## T12 — Validação integrada e entrega

### Verificação funcional

1. Migrations aplicadas desde uma base limpa **descartável e autorizada**; garantir compatibilidade com frontend anterior para publicação em duas fases.
2. Supabase e funções locais em execução; `pdftotext` disponível para testes reais de PDF. Não desativar testes por falta de pré-requisito: registrar bloqueio.
3. Rodar:

```bash
npx tsc --noEmit
npm run check
npm run test
npm run build
git diff --check
```

4. Navegador com build de produção em 390 px e desktop, claro/escuro, vazio/volume, dono/admin. Hoje: gráfico, selo, “ver todas”, meta; Resultados: 4 abas, 2 comparações, 1/7/mês/90 dias, URL/link direto/voltar/avançar e PDF; Ajustes e invalidação; admin detalhe/lista e ações.
5. Dois restaurantes, dois usuários, mesmo login em aparelhos diferentes, troca de casa/logout, suspensão e acesso revogado. PWA: instalação, retomada e offline sem cache de dados.
6. Cenários de tempo: carga inicial no meio, SCC parado, madrugada/mês novo, mês sem meta, pagamento tardio e reenvio corrigindo passado. Conferir efeito comum na tela e PDF.
7. Recepção/cron alterados: rodar cenários de `docs/arquitetura/recepcao-de-dados.md`, vigia e retorno de alarme. Sem envio de e-mail real nos benchmarks.

### Verificação de desempenho

- Repetir apenas cenários afetados e carga integrada final sob o mesmo ambiente/semente; mostrar baseline e candidato lado a lado.
- Proposta de critério técnico (não SLA já aprovado): melhoria repetível fora da dispersão, buscar ao menos 15% no p95 do gargalo quando houver custo suficiente para medir. Investigar regressão repetida >10% ou >100 ms nas rotas relevantes; esses limites são alarmes de revisão, não permissão para degradar casos menores.
- Para redução de carga sem impacto de latência, demonstrar menos buffers/CPU/chamadas/bytes e latência equivalente. Índice deve justificar também espaço e custo de escrita.
- Objetivos de referência da experiência, não resultados desta análise: LCP até 2,5 s, CLS até 0,1 e boa resposta a interação. Não declarar Core Web Vitals aprovados com uma visita sintética; INP/p75 exigem observação adequada de campo.
- Relatar qualquer regressão, mesmo abaixo dos gatilhos. Não apresentar ganho do endpoint SQL como se fosse ganho igual do carregamento inteiro.

### Entrega ao Lucas

Criar `docs/desempenho/resultado.md` com:

| Campo | Conteúdo obrigatório |
|---|---|
| Escopo | tarefas implementadas, descartadas e condicionais |
| Evidência | commits, ambiente, dataset, amostras e antes/depois |
| Equivalência | testes, casos de isolamento, tela e conteúdo PDF |
| Custo | CPU/IO, chamadas, índice/espaço, recepção |
| Pendências | o que não foi possível medir; decisão necessária |
| Publicação | ordem e autorizações ainda necessárias |
| Reversão | como restaurar função/cliente anterior sem apagar histórico |

### Publicação e reversão — preparar, não executar sem autorização

- Publicar migrations compatíveis antes do frontend que depende delas. Rewrites com mesma assinatura preservam o cliente atual; agregadoras precisam existir e ter grants antes de serem usadas.
- Não editar/remover migration já aplicada para reverter: nova migration restaura definição anterior, incluindo grants e `security invoker`; índices antigos não são retirados automaticamente.
- Frontend: reverter commit específico sem desfazer mudanças alheias. Sem fallback silencioso que mostre números antigos ou zeros em erro.
- Monitorar rotas, recepção, banco e alarmes no piloto após publicação autorizada. Divergência de número/isolamento exige interromper a mudança; teste local não substitui acompanhamento operacional.

## Prompt de passagem para o modelo executor

```text
Leia AGENTS.md, CLAUDE.md e os documentos:
docs/superpowers/specs/2026-10-24-desempenho-sem-regressao-design.md
docs/superpowers/plans/2026-10-24-otimizacao-sem-regressao.md

O objetivo é otimizar sem mudar funcionalidades, métricas, isolamento ou contrato SCC.
Confirme a aprovação do desenho/plano e confira os commits posteriores à base 422eaef.
Comece pela T0 em ambiente local isolado; não escreva otimizações antes do baseline.
Execute uma tarefa por vez, com equivalência, benchmark e revisão antes de avançar.
As tarefas condicionais não são autorização para reescrever tudo.
Não altere produção, não use dados reais/casa de demonstração e não publique sem autorização.
Se houver diferença de produto, dúvida de RLS ou necessidade de reescrita ampla, pare
nessa frente e apresente evidências para análise. Ao final de cada lote, entregue
antes/depois e resultados dos testes; não prometa ganho sem medição.
```
