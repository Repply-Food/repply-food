# Metodologia de Medição - Baseline Repply Food

**Data:** 2026-10-25
**Objetivo:** Produzir baseline reproduzível para guiar otimizações sem regressão

## Princípios

1. **Reprodutibilidade**: Configuração determinística
2. **Fail-closed**: Benchmarks só rodam em ambiente local. Proibido HTTP/Postgres remoto
3. **Separação clara**: Cenários sintéticos/projetados ≠ ingestão real; medições são reais ou BLOQUEADAS
4. **Medição realista**: Perfis reais (dono/autenticado), não superusuário como substituto
5. **Sem dados sensíveis**: Nunca logar JWT, SQL corpo completo com dados, payloads reais, nem incluir URLs/credenciais em erros

## Ambiente

- **Modo**: `npm run build && npm run start` para medições UI (produção-like). Dev tem custos não representativos.
- **Banco**: Supabase local via Docker (IP literal 127.0.0.1 ou ::1). Conexão de preparação só na instância descartável marcada; medições de métricas sob `authenticated` e claim do dono.
- **Rede**: Normal e 4G simulada. Observar em 390px (mobile) e desktop.
- **Cold/warm**: Separados. Primeira consulta local ≠ cold start Vercel.

## Cenários

| Cenário | Descrição | Uso |
|---------|-----------|-----|
| vazio | Sem dados (sintético) | Caso base projetado |
| 90d_x100 | 90 dias × ~100 contas/dia (sintético/projetado) | Típico projetado |
| 365d_x500 | 365 dias × ~500 contas/dia (sintético/projetado) | Médio-grande projetado |
| 730d_x1000_estresse | 730 × 1000/dia (sintético/projetado, opcional) | Opcional, reduzir se faltar recurso |

Distribuição real observada: abertas/removidas/pagas, códigos, lacunas.

## Medição

### Harness SQL disponível

O ambiente de benchmark deve ser iniciado com `--workdir` apontando para uma cópia isolada de `supabase/`, projeto Supabase e portas próprias. O harness só aceita IPs literais `127.0.0.1`/`[::1]`, API na porta `55421` e PostgreSQL na `55422`; recusa inclusive o Supabase compartilhado padrão (`54321/54322`) e `localhost`. Também exige o marcador `benchmark_isolation_guard` exclusivo do projeto e zero jobs `pg_cron` ativos antes de preparar dados ou medir. Nunca use `npm run supabase:reset` neste repositório: o projeto local compartilhado pode pertencer a outra worktree. A configuração de referência desta execução está em `.superpowers/sdd/2026-10-24-otimizacao-sem-regressao/isolated-project/` (ignorada pelo Git).

O marcador é criado uma única vez diretamente no container verificado `supabase_db_repply-food-perf-20261025`, com o valor `repply-food-perf-20261025-55422`; ele não faz parte das migrations do produto. O preparador usa IDs fixos e falha por conflito se a fixture já existir: não limpa nem sobrescreve dados automaticamente.

Preparação fictícia, apenas no banco isolado:

```bash
BENCH_DB_URL='postgresql://postgres:postgres@127.0.0.1:55422/postgres' \
  npx tsx scripts/desempenho/preparar-cenarios.ts
```

O comando cria duas casas e usuários distintos, cada casa com 90 dias × 100 contas/dia. A Casa A recebe meta mensal; a Casa B fica sem meta. Os dados usam semente fixa `20261024`, relógio/datas fixas, códigos, valores e distribuição determinísticos, sem informação pessoal. Guarde localmente os UUIDs impressos para alimentar o medidor; não os publique como credenciais.

Perfis opcionais são separados da massa `90d_x100`: usam IDs fixos próprios, inserção transacional e falham em colisão, sem apagar dados. O comando cria dados; execute apenas quando a série precisar daquele perfil.

```bash
BENCH_DB_URL='postgresql://postgres:postgres@127.0.0.1:55422/postgres' \
  npx tsx scripts/desempenho/preparar-perfis.ts vazio
# alternativas: esparso, 365d_x500
```

Medição do dono autenticado (o URL do banco e o endpoint precisam ser loopback; flags de exceção são ignoradas):

```bash
BENCH_HTTP_URL='http://127.0.0.1:55421' \
BENCH_DB_URL='postgresql://postgres:postgres@127.0.0.1:55422/postgres' \
BENCH_RESTAURANTE_ID='<UUID da casa sintética>' \
BENCH_USUARIO_ID='<UUID do dono sintético>' \
BENCH_DATA_REFERENCIA='2026-10-24T23:00:00.000Z' \
npx tsx scripts/desempenho/medir-metricas.ts > resultado-local.json
```

Por padrão, executa 5 aquecimentos e 30 amostras em chamadas SQL sob `authenticated`, com o claim do dono. O tempo amostrado inclui transação, definição do papel/claim e ida e volta ao PostgreSQL; não é apresentado como tempo puro do executor. O plano JSON com `ANALYZE/BUFFERS` é coletado separadamente para curva do Hoje e Resultados 90d semanal. Em RPCs PL/pgSQL, o plano pode mostrar só `Function Scan`; `tempoRaizDoPlanoMs`/buffers da raiz **não** são atribuídos ao SQL interno e a análise do corpo ainda precisa ser feita antes de aceitar a baseline. O endpoint HTTP é apenas um probe de saúde (`/auth/v1/health`), não uma medição de RPC pela rede. A suíte de UI, HTTP RPC autenticada, ingestão, PDF e concorrência ainda requerem execução própria; este harness, sozinho, não as representa.

### SQL por papel e falhas parciais

Confirme o papel efetivo (`dono` ou `admin`) na sessão autenticada antes de registrar o rótulo. Se uma chamada falhar ou vencer o timeout, registre a série parcial, as durações brutas já obtidas e a falha; percentis ausentes são `null`, nunca zero. Use datas explícitas de início/fim para histórico distante e uma lista explícita de operações para limitar a coleta.

### HTTP RPC autenticado e concorrência

O runner faz login local da fixture por variáveis de ambiente e não imprime e-mail, senha, token ou resposta. Cada amostra dispara Hoje e Resultados em paralelo; tempo de parede não é a soma das chamadas. São 5 aquecimentos e 30 amostras nas escalas 1, 5 e 20; timeout de 20 s interrompe as escalas seguintes.

Antes do login, o runner confirma marcador, cron, usuário/papel/restaurante no PostgreSQL; depois exige que a sessão autenticada seja o mesmo UUID e que a API confirme a casa e `eh_admin_repply`. Para as contas sintéticas já provisionadas, passe chave anon, e-mail e senha somente pelo ambiente ou arquivo `0600` ignorado; nunca os imprima. Não use nem leia arquivos de acesso de outra execução.

```bash
BENCH_HTTP_URL='http://127.0.0.1:55421' \
BENCH_DB_URL='postgresql://postgres:postgres@127.0.0.1:55422/postgres' \
BENCH_ANON_KEY='<anon-key-local>' BENCH_LOGIN_EMAIL='<fixture-local>' BENCH_LOGIN_SENHA='<segredo-local>' \
BENCH_USUARIO_ID='<uuid-usuario>' BENCH_RESTAURANTE_ID='<uuid-fixture>' BENCH_PAPEL='dono' \
  npx tsx scripts/desempenho/medir-rpc-http.ts > .superpowers/desempenho/http-rpc.json
```

### Amostragem
- 5 aquecimentos + ≥30 amostras medidas (buscar 100 para p95 confiável)
- Alternar A/B, repetir séries
- Registrar mediana (p50), p95, dispersão, tamanho amostra
- Partida fria em grupo separado

### Métricas
- **Tempo total HTTP**, **tempo SQL**, **autenticação**, **configuração**, **montagem React**, **PDF**
- **Tempo até números úteis e gráfico** (não só TTFB skeleton)
- **LCP/CLS**, latência interação (INP não representativo local)
- **EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)** em leitura local autenticada
- **Chamadas, linhas/loops/buffers, bytes, erros**

### Concorrência
- 1/5/20 telas simultâneas
- Mesma casa e casas distintas
- Se fila/timeout → parar escala e registrar

## Ingestão

O runner usa o POST de `receber-envio`, com timeout de 20 s incluindo leitura da resposta, sem seguir redirecionamentos. Aceita somente a raiz da API com IP literal e porta `55421`, PostgreSQL literal na `55422`, marcador exclusivo e zero jobs cron ativos. Só depois consulta reservas ou escreve. As três casas são **exatamente** os UUIDs/slugs de `RESERVAS_INGESTAO`, exportados pelo preparador; massa de leitura nunca pode substituí-las. O hash SHA-256 do token precisa pertencer à própria casa, sem revogação e sem expiração vencida.

O preparador `scripts/desempenho/preparar-ingestao.ts` cria essas reservas em transação e salva os tokens apenas em `.superpowers/desempenho/ingestao-acessos.local.json` (`0600`, ignorado). **Preparação e medição real dependem de autorização/revisão; não foram executadas nesta implementação.** O medidor não cria reservas nem inventa tokens. Para uma execução futura autorizada, com o JSON já criado pelo preparador:

```bash
BENCH_HTTP_URL='http://127.0.0.1:55421' \
BENCH_DB_URL='postgresql://postgres:postgres@127.0.0.1:55422/postgres' \
BENCH_INGEST_CONFIG='.superpowers/desempenho/ingestao-acessos.local.json' \
  npx tsx scripts/desempenho/medir-ingestao.ts > .superpowers/desempenho/ingestao.json
```

Execute a partir da raiz do repositório. O caminho é opcional (esse é o padrão), deve ficar sob `.superpowers/`, ignorado e não rastreado; arquivo regular `0600` do próprio usuário, sem links simbólicos ou hardlinks. O JSON é lido só em memória, não é impresso e não precisa virar variável de ambiente ou argumento de linha de comando. Não use `cat`, `jq`, `set -x` ou exportação dos tokens. O exemplo contém apenas as credenciais locais públicas do banco descartável; nunca substitua por conexão de produção.

### Série sequencial e pré-estados

Para cada tamanho (10, 500, 2000), separado por casa e faixa fixa de códigos:

1. Uma chamada **de preparo/sonda** estabelece o dataset original completo. Não é amostra de inserção fria. A reserva pode estar vazia ou já usada; qualquer código fora da faixa bloqueia antes de escrever. Nada é apagado fisicamente.
2. Executar **5 ciclos de aquecimento + 30 ciclos medidos**, sem sobreposição. Cada ciclo faz, nesta ordem: **idêntico** (original), **alteração** (apenas o primeiro código com `ValorItens=101`, `ValorConsumido=111`), **remoção** (original sem o primeiro código) e **reaparecimento** (original completo). O último caso restaura o pré-estado do próximo ciclo; não há reset SQL das entradas.
3. Antes de cada POST, fora do tempo HTTP, envelhecer **somente** `sinal_de_vida.ultimo_envio_em` dessa reserva em 21 s. Isto é **pacing sintético**, não teste do ritmo natural. Zero linhas é tolerado apenas na sonda inicial, que pode ainda não ter sinal de vida.
4. Conferir o envelope completo antes de qualquer POST da escala: acima de 2 MB bloqueia, **nunca fragmenta** a janela. A remoção também é uma janela completa: a ausência intencional do primeiro código é o cenário medido.
5. Validar estado após cada POST bem-sucedido: quantidade/códigos exatos, ausência de códigos estranhos na casa inteira, valores exatos dos seis campos monetários e demais campos do dataset, hashes e remoção só onde esperado. `numeric(12,2)` vem como texto; `111` e `111.00` são comparados em representação decimal exata, sem `Number`. Estado bruto e hashes não saem no relatório.

Contadores esperados por ciclo (`N` = tamanho):

| Caso | recebidas | gravadas | inalteradas | removidas |
|---|---:|---:|---:|---:|
| idêntico | N | 0 | N | 0 |
| alteração | N | 1 | N−1 | 0 |
| remoção | N−1 | 0 | N−1 | 1 |
| reaparecimento | N | 1 | N−1 | 0 |

Na remoção, o primeiro código continua com valores/hash **alterados**, mas fica removido. No reaparecimento volta aos valores/hash **originais**, portanto conta como **gravada**, conforme a função efetiva `processar_envio` da migration `20261014120000`. Na sonda, gravadas/inalteradas dependem dos hashes antes/depois; não se presume reserva vazia. Também se exige `ok: true`, janela confirmada correta e intervalo inteiro positivo, não apenas um objeto JSON.

### Telemetria e falhas parciais

São **141 chamadas HTTP por tamanho** (1 sonda + 20 aquecimentos + 120 medidas), **423 no total** se tudo passar. Cada tentativa registra fase, ciclo, caso, status real (ou `null` sem resposta), duração HTTP, timeout, bytes UTF-8 do corpo enviado/recebido e validade. Os bytes não incluem cabeçalhos nem representam captura de rede comprimida. O tempo começa imediatamente antes de `fetch` e termina após ler o corpo; serialização, pacing e consulta de validação ficam fora.

Por tamanho/caso: durações brutas **somente das medidas válidas**, p50/p95 por *nearest-rank*, dispersão como máximo menos mínimo, contagem de chamadas incluindo aquecimento, erros, bytes recebidos conhecidos e quantidade de respostas sem tamanho conhecido. Sem amostra, percentis/dispersão são `null`. A sonda fica nas tentativas, separada dos quatro casos amostrados.

Erro de rede, timeout, resposta inválida ou divergência de estado aborta o restante da série e escalas seguintes, preservando resultados anteriores e fase/ciclo/caso/etapa da falha. Não há retry nem zeros usados como amostra. O CLI emite o JSON parcial e termina com código 1; falha de configuração emite apenas erro sanitizado. Nenhum token, payload, credencial de conexão, SQL ou estado bruto é impresso. **Testes unitários com fronteiras simuladas não constituem medição HTTP real nem conclusão da T0.**

## EXPLAIN interno

O runner carrega e configura `auto_explain` como administrador local na conexão descartável antes de trocar para `authenticated`, e então chama as RPCs reais. Ele requer planos nested entregues à conexão; se a instalação não os encaminhar, falha fechado e a coleta deve usar o log exclusivo da instância. Não usa consultas equivalentes simplificadas, não muda migration ou configuração global.

```bash
BENCH_HTTP_URL='http://127.0.0.1:55421' \
BENCH_DB_URL='postgresql://postgres:postgres@127.0.0.1:55422/postgres' \
BENCH_USUARIO_ID='<uuid-dono>' BENCH_RESTAURANTE_ID='<uuid-casa>' \
BENCH_EXPLAIN_SAIDA='.superpowers/desempenho/explain-interno.json' \
  npx tsx scripts/desempenho/explain-interno.ts
```

## Travas de Segurança
- **HTTP remoto**: Recusado sempre (sem exceções). Apenas `http:`/`https:` para hosts locais
- **Postgres remoto**: Recusado sempre (sem exceções). Apenas `postgres:`/`postgresql:` para hosts locais
- **Flags ignoradas**: `PERMITIR_NUVEM_NO_DEV`, `NODE_ENV=production` não permitem exceção
- **Sem vazamento**: Mensagens de erro não incluem URLs/credenciais
