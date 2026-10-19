# Etapa 5 — Tela "Hoje" · Desenho

**Objetivo:** mostrar ao dono, durante o expediente, os números do dia do restaurante quase em tempo real — quanto a casa já vendeu (e se está acima ou abaixo do normal para aquele dia e horário), quem está na casa, se há conta esquecida e como anda a meta do mês. Fiel à tela aprovada [`docs/telas/hoje.html`](../../telas/hoje.html).

**Arquitetura (resumo):** funções SQL `metrica_*` (por migration) calculam cada número no banco; `lib/metricas/` as consome com tipos; a página `/r/[slug]/hoje` (Server Component, atrás do guarda de casa) renderiza, e um componente de cliente a atualiza a cada ~1 min; o gráfico usa Recharts pelo `ChartContainer` do shadcn. A moldura, o menu e o selo (M05) já existem da etapa 2.

**Decisão do dono (19/10/2026):** construir a tela inteira como aprovada — números + comparação em % + curva "dia típico" + meta —, com a comparação e a curva aparecendo quando houver histórico.

---

## 1. Escopo

**Dentro:**
- **M01** Faturamento da casa até agora (+ taxa de serviço separada), com a **comparação** "mesmo dia da semana até o mesmo horário" e a **curva "dia típico"**.
- **M02** Mesas abertas agora (quantidade + valor consumido em aberto).
- **M03** Pessoas na casa (soma de `numero_ocupantes` das abertas).
- **M04** Contas abertas há mais de 4 h (máx. 3 + "ver todas (N)", D-33).
- **M09** Por pessoa (hoje), com comparação.
- **M11** Meta do mês (com estado "sem meta definida" até a etapa 6).
- **M05** O selo "há X min" — **já existe**; a etapa 5 só garante que ele se atualiza junto (resolve a dívida 26).

**Fora:** a tela Resultados (etapa 7), **definir** a meta em Ajustes (etapa 6), o PDF (etapa 8), o alarme (etapa 9).

**Provisório:** as fórmulas dependem de respostas da SCC — H5 (fórmula do `ValorConsumido`), H6 (taxa de serviço), H9 (o `numero_ocupantes` é preenchido de verdade?), B6 (dia de operação), H7 (fiado e cortesia). Construímos com o que está definido hoje; não "consertar" sem conversar (CLAUDE.md §7). O gabarito é o exemplo de conta de `metricas.md` §2.

---

## 2. As funções no banco (`metrica_*`)

**Regra absoluta:** todo número vem de uma função SQL `metrica_*` (CLAUDE.md §5). A tela, o PDF (etapa 8) e o "ver painel do cliente" do admin chamam as **mesmas** funções. Nunca recalcular em TypeScript.

**Isolamento:** as funções são `security invoker` — rodam com a RLS de quem chama. Assim o dono só vê a casa dele e o admin (leitura, D-38) vê qualquer casa, sem código extra. Recebem `p_restaurante_id`; a página passa o id **já verificado** pelo guarda (`exigirCasa`). Uma casa a que o chamador não tem acesso devolve vazio/zero (a RLS filtra), nunca erro nem dado de outro. `set search_path = public`. Nascem fechadas: `grant execute` para `authenticated` de propósito, na própria migration, e entram em `tests/isolamento/funcoes-fechadas.test.ts` (CLAUDE.md §8.1).

**Regras de cálculo (metricas.md §1):** só contas válidas (`removida_em` vazio); conta paga = `pago = true`; faturamento da casa = `valor_consumido − taxa_servico` (D-14); momento da venda = `fechada_em`; dia de operação = `data(aberta_em − hora_virada)` (padrão 05:00); horas no **fuso do restaurante**; dinheiro `numeric(12,2)`; **divisão por zero devolve `null`** (a tela mostra "—", nunca 0 nem erro).

**As funções:**

| Função | Devolve | Métrica |
|---|---|---|
| `metrica_faturamento_do_dia(p_restaurante_id uuid, p_ate timestamptz)` | `faturamento`, `taxa_servico`, `contas_pagas`, `pessoas_pagas` das contas pagas do dia de operação de `p_ate` com `fechada_em ≤ p_ate` | M01, M09 (base) |
| `metrica_mesas_abertas(p_restaurante_id uuid)` | `quantidade`, `valor_em_aberto` (soma de `valor_consumido`), `pessoas_na_casa` (soma de `numero_ocupantes`) das abertas | M02, M03 |
| `metrica_contas_esquecidas(p_restaurante_id uuid, p_limite interval)` | conjunto `{identificador, aberta_ha, valor_em_aberto}`, da mais antiga para a mais nova | M04 |
| `metrica_comparacao_do_dia(p_restaurante_id uuid)` | `faturamento_hoje`, `por_pessoa_hoje`, `media_faturamento`, `media_por_pessoa`, `variacao_faturamento`, `variacao_por_pessoa`, `ocorrencias` (ver §3) | M01, M09 (comparação) |
| `metrica_curva_do_dia(p_restaurante_id uuid)` | conjunto de pontos `{minuto_do_dia, acumulado_hoje, acumulado_tipico}` (ver §3) | curva |
| `metrica_meta_do_mes(p_restaurante_id uuid)` | `faturamento_mes`, `meta`, `andamento`, `projecao`, `projecao_disponivel` (bool) | M11 |

A função-primitiva é `metrica_faturamento_do_dia(restaurante, ate)`: serve tanto para o **hoje** (`ate = agora`) quanto para os **pontos de comparação** (as ocorrências passadas até `início daquele dia + decorrido`). Uma lógica só, sempre coerente.

---

## 3. A comparação e a curva (metricas.md §4)

**Mesmo dia da semana até o mesmo horário** (`metrica_comparacao_do_dia`):
1. `decorrido = agora − início do dia de operação atual`.
2. Das **últimas 4 ocorrências** do mesmo dia da semana **com movimento** (≥ 1 conta paga no dia inteiro), some o faturamento da casa das pagas com `fechada_em ≤ início daquele dia + decorrido` (via a função-primitiva).
3. A referência é a **média** dessas somas; `variacao = (hoje − média) ÷ média`.
4. Com **menos de 2 ocorrências**, a comparação **não aparece** (`ocorrencias < 2` → `variacao = null`).

A mesma regra vale para "por pessoa" (M09).

**A curva "dia típico"** (`metrica_curva_do_dia`): a curva acumulada de hoje (laranja, até o ponto de "agora") contra a média, **ponto a ponto**, das 4 curvas acumuladas das mesmas ocorrências. As curvas são amostradas em **faixas de 30 minutos a partir da virada do dia** (intervalo fixo, ajustável), para serem comparáveis entre si; cada ponto é o faturamento acumulado até o fim daquela faixa. Nunca comparar com o dia inteiro (às 21 h o dono sempre pareceria "abaixo"). Sem histórico suficiente, só a linha de hoje aparece.

**Meta e projeção** (`metrica_meta_do_mes`, metricas.md §4):
- `andamento = faturamento do mês ÷ meta`.
- `projecao = (faturamento do mês até ontem ÷ dias de operação decorridos até ontem) × dias do mês`.
- A projeção só a partir do **3º dia** do mês (`projecao_disponivel`).
- Sem meta definida para o mês → `meta = null` (a tela mostra "sem meta definida").

---

## 4. A tela

- **Página** `app/r/[slug]/hoje/page.tsx` (Server Component), começa pelo guarda `exigirCasa` (sessão → `modoAdmin` para o "ver painel do cliente"). Busca os números por `lib/metricas/` e renderiza. **Suspense** para a tela aparecer rápido (a moldura e o selo primeiro, os números em seguida).
- **Atualização automática:** um componente de cliente dispara `router.refresh()` a cada **~1 min** (os dados da SCC chegam a cada ~5 min; 1 min deixa o selo "há X min" e os números frescos sem peso). Resolve a dívida 26.
- **Ordem (fiel ao desenho, D-33):** faturamento da casa → linha da taxa → curva do dia → três quadros (mesas abertas, pessoas, por pessoa) → contas esquecidas (só quando existem) → meta do mês.
- **Celular primeiro, computador sempre (D-39/D-40):** no celular, o importante cabe sem rolar (até os três quadros); no computador, o menu vira barra lateral escura, a curva ocupa 2/3 com os quadros ao lado, alerta e meta lado a lado.
- **Cores só com significado (D-33):** verde = acima do normal, vermelho = abaixo, amarelo = meta em risco; laranja só para a marca e a linha de hoje. Cor nunca é o único canal (seta ▲▼ sempre junto).
- **Gráfico:** Recharts pelo `ChartContainer` do shadcn (padrão do Imob).

**Componentes novos** em `components/painel/hoje/`: cartão do faturamento (número + chip de comparação + curva), a curva (`CurvaDoDia`), os três quadros, as contas esquecidas (máx. 3 + "ver todas"), o quadro da meta. `lib/metricas/` consome as funções do banco (dinheiro como `string`, formatado por `lib/format`).

---

## 5. Comportamentos e estados (o crivo das perspectivas)

- **Restaurante novo, sem envio ainda:** usa o estado vazio já existente — "aguardando o 1º envio" (o selo) e a tela sem números.
- **Sem histórico (primeiras ~4 semanas):** os números do dia aparecem; no lugar do "% vs. normal", o aviso discreto **"ainda juntando o histórico das sextas"**; a curva só com a linha de hoje.
- **Sem meta do mês (até a etapa 6):** o quadro da meta mostra **"sem meta definida"** (sem barra nem projeção); ganha a barra e a projeção quando a meta existir.
- **Divisão por zero** (sem conta paga ainda): "—", nunca 0 nem erro.
- **SCC parado / fora do horário:** o selo segue o vigia (D-53) — vermelho se parado dentro do horário, cinza "fechado" fora dele. Os números ficam nos últimos recebidos.
- **Virada do dia (madrugada):** a mesa aberta às 23h30 conta no dia da abertura; na virada (05:00 padrão) o "hoje" passa a ser o novo dia de operação.
- **Admin "ver painel do cliente" (D-38):** a mesma tela, só leitura (a faixa já existe); as funções `security invoker` deixam o admin ler qualquer casa.
- **Sócio/gerente (mesmo login, D-10):** veem a mesma tela, com tudo.
- **Erro ao ler os números:** tela de erro com "Tentar de novo" (padrão do painel), nunca número errado.

---

## 6. Como fica montado (arquivos)

- **Migrations** `supabase/migrations/` — as funções `metrica_*` (RLS/isolamento no mesmo arquivo; grant explícito; entram nos testes de função fechada).
- **`lib/metricas/`** — um leitor por função (`obterFaturamentoDoDia`, `obterMesasAbertas`, `obterContasEsquecidas`, `obterComparacaoDoDia`, `obterCurvaDoDia`, `obterMetaDoMes`) e um compositor `obterHoje` para a página; tipos gerados do banco; dinheiro como `string`.
- **`app/r/[slug]/hoje/page.tsx`** — a página (substitui o placeholder da etapa 2).
- **`components/painel/hoje/`** — os componentes da tela + a atualização automática.
- **Tipos** — `npm run types` após as migrations.

---

## 7. Testes

- **Gabarito (metricas.md §2):** estende `tests/metricas/exemplo-conta.test.ts` para cobrir **cada** número do "Hoje" contra o exemplo de conta, no banco local (os valores têm que bater exatos: faturamento R$ 580, taxa R$ 60, 3 pagas, ticket/pessoa R$ 64,44, mesas abertas 1 · R$ 165 · 2 pessoas, contas esquecidas 1, etc.).
- **Comparação e curva:** teste da regra das 4 ocorrências do mesmo dia da semana, do "menos de 2 → não aparece", e da curva ponto a ponto.
- **Isolamento:** cada `metrica_*` fechada para quem não é `authenticated`; um dono não lê a casa de outro; o admin lê (D-38). Entram em `funcoes-fechadas.test.ts` e no teste de isolamento.
- **Tela:** a página renderiza, os estados (sem envio, sem histórico, sem meta, "—") aparecem, a atualização automática dispara; celular e computador, claro e escuro (CLAUDE.md §9).
- **Divisão por zero / dinheiro:** nunca `number` para somar; "—" no divisor zero.

---

## 8. Regras absolutas que valem aqui

- Número só por função SQL `metrica_*`; tela, PDF e admin chamam as mesmas.
- Isolamento: `restaurante_id` verificado no servidor (guarda), RLS em `entradas`, funções `security invoker`, teste de isolamento obrigatório.
- Dinheiro `numeric(12,2)` no banco e `string` no código; formatação num utilitário só; divisão por zero → "—".
- Horas e "dia" no **fuso do restaurante**, nunca no do servidor nem no do navegador.
- Taxa de serviço **sempre separada** do faturamento (D-14).
- Contas esquecidas: **máx. 3** + "ver todas (N)" (D-33).
- Cores só com significado, sempre com seta/texto junto (D-33); laranja só na marca e na linha de hoje.
- Celular **e** computador, claro **e** escuro, antes de dizer "feito" (D-39, D-12, CLAUDE.md §9).
- Métricas **provisórias** até a SCC; não "consertar" a regra de negócio sem conversar.
