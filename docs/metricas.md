# Métricas do repply food.

*Definição exata de cada número que aparece no painel. Se a tela, o PDF e (no futuro) o mentor IA mostram um número, ele sai daqui. Estas definições viram **funções SQL com nome** no banco (`metrica_*`) e **testes automáticos** com o exemplo da §2.*

- **Origem:** o cardápio de métricas da descoberta (M01–M45, avaliado pela SCC, D-23). Aqui estão só as da **primeira versão**.
- **Estado:** **provisório** até a SCC responder as perguntas B6 (dia de operação), H5 (fórmula do `ValorConsumido`), H6 (taxa de serviço) e H7 (fiado e cortesia). Cada métrica diz de qual pergunta depende.

---

## 1. Regras que valem para todas

| Regra | Definição |
|---|---|
| **Conta válida** | Entrada com `removida_em` vazio. Removidas nunca entram em métrica nenhuma |
| **Conta paga** | Conta válida com `pago = true` |
| **Faturamento da casa** de uma conta | `valor_consumido − taxa_servico` (D-14). Inclui descontos, acréscimos e complemento, porque já estão no `valor_consumido`. *Depende de H5/H6* |
| **Momento da venda** | `fechada_em`: a venda conta quando a conta é paga. É o que a curva acumulada do "Hoje" usa |
| **Dia de operação** | `dia_operacao = data(aberta_em − hora_virada)`. Padrão: virada às **05:00**, configurável por restaurante. Uma mesa aberta às 23h30 e fechada à 1h15 pertence ao dia da abertura. *Depende de B6* |
| **Fuso** | Horas do SCC chegam sem fuso e são gravadas no fuso do restaurante (padrão `America/Fortaleza`) |
| **Dinheiro** | Tipo exato (`numeric(12,2)`). Arredondamento só na exibição, com 2 casas |
| **Divisão por zero** | Se o divisor é 0, a métrica mostra "—" (nunca 0, nunca erro) |

## 2. Exemplo de conta (vira teste)

Restaurante com virada às 05:00. "Agora" = **10/10/2026 às 02:00**, ainda dentro do dia de operação de **sexta, 09/10**.

| Entrada | Abertura | Fechamento | Itens | Desc. | Taxa | Consumido | Pago | Pessoas | Garçom | Op. fech. | Obs. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E1 | 09/10 12:10 | 09/10 13:05 | 100,00 | 0 | 10,00 | 110,00 | Sim | 2 | 27 | 99 | |
| E2 | 09/10 12:40 | 09/10 14:10 | 200,00 | 20,00 | 20,00 | 200,00 | Sim | 4 | 14 | 99 | |
| E3 | 09/10 23:30 | 10/10 01:15 | 300,00 | 0 | 30,00 | 330,00 | Sim | 3 | 27 | 98 | atravessa a meia-noite |
| E4 | 09/10 21:00 | — | 150,00 | 0 | 15,00 | 165,00 | Não | 2 | 14 | — | ainda aberta |
| E5 | 10/10 05:30 | 10/10 06:10 | 50,00 | 0 | 5,00 | 55,00 | Sim | 1 | 27 | 99 | já é o dia 10/10 |
| E6 | 09/10 19:00 | 09/10 20:00 | 80,00 | 0 | 8,00 | 88,00 | Sim | 2 | 14 | 99 | **removida** |

Resultados esperados para o **dia de operação 09/10**:

| Métrica | Valor | Conta |
|---|---|---|
| Faturamento da casa | **R$ 580,00** | (110−10) + (200−20) + (330−30). E4 não está paga, E5 é de outro dia, E6 foi removida |
| Taxa de serviço | **R$ 60,00** | 10 + 20 + 30 |
| Contas pagas | **3** | E1, E2, E3 |
| Ticket por conta | **R$ 193,33** | 580 ÷ 3 |
| Pessoas atendidas (pagas) | **9** | 2 + 4 + 3 |
| Ticket por pessoa | **R$ 64,44** | 580 ÷ 9 |
| Atendimentos (todas as válidas) | **4 contas · 11 pessoas** | E1–E4 |
| Mesas abertas agora | **1 · R$ 165,00 em aberto · 2 pessoas** | E4 |
| Contas abertas há mais de 4h | **1** | E4, aberta há 5h |
| Descontos | **R$ 20,00 · 3,45% do faturamento** | 20 ÷ 580; todos do operador 99 |
| Permanência média | **1h23** | (55 + 90 + 105) ÷ 3 min |
| Garçom 27 | **R$ 400,00 · taxa R$ 40,00 · 2 contas** | E1 + E3 |
| Garçom 14 | **R$ 180,00 · taxa R$ 20,00 · 1 conta** | E2; E4 está aberta e não conta |
| Por hora de abertura | **12h: R$ 280,00 · 23h: R$ 300,00** | E1+E2 · E3 |

## 3. Métricas da primeira versão

As fórmulas usam só contas válidas do restaurante, dentro do período e do dia de operação.

### Tela "Hoje"

| # | Métrica | Definição | Depende de |
|---|---|---|---|
| M01 | **Faturamento da casa até agora** | Soma do faturamento da casa das contas pagas do dia de operação atual com `fechada_em ≤ agora`. **Comparação:** veja a regra "mesmo dia da semana até o mesmo horário" (§4) | H5, H6, B6 |
| — | **Taxa de serviço até agora** | Soma de `taxa_servico` das mesmas contas. Aparece abaixo do número principal | H6 |
| M02 | **Mesas abertas agora** | Contas com `fechada_em` vazio: quantidade e soma do `valor_consumido` ("em aberto", com a taxa, porque é o que o cliente vai pagar) | — |
| M03 | **Pessoas na casa** | Soma de `numero_ocupantes` das contas abertas | H9 (o campo é preenchido de verdade?) |
| M04 | **Contas abertas há mais de 4h** | Abertas com `agora − aberta_em > 4h`, da mais antiga para a mais nova. A tela mostra **no máximo 3** e o botão "ver todas (N)" (D-33). O limite de 4h é ajustável | — |
| M05 | **Última atualização** | O selo **segue o estado do vigia** (`sinal_de_vida.estado`, D-53), com os limites dele: verde até 15 min, amarelo de 15 a 45 min, vermelho acima de 45 min, só dentro do horário de funcionamento. O tempo mostrado ("há X min") sai de `ultimo_envio_ok_em`. Casa fechada: cinza, "fechado agora · últimos dados às HH:MM". Sem envio ainda: "aguardando o 1º envio". Textos completos na D-53 | — |
| M09 | **Por pessoa (hoje)** | Faturamento da casa ÷ pessoas das contas pagas do dia, comparado com o mesmo dia da semana | H9 |
| M11 | **Meta do mês** | Faturamento da casa do mês ÷ meta do mês, mais a **projeção** (§4) | — |

### Tela "Resultados" (período escolhido)

| Aba | # | Métrica | Definição |
|---|---|---|---|
| Vendas | M06 | Faturamento da casa | Soma do período, com gráfico por dia de operação |
| Vendas | M07 | Taxa de serviço | Soma de `taxa_servico` das pagas e % média aplicada (`taxa ÷ valor_itens`) |
| Vendas | M08 | Ticket por conta | Faturamento da casa ÷ contas pagas |
| Vendas | M09 | Ticket por pessoa | Faturamento da casa ÷ pessoas das pagas |
| Vendas | M10 | Contas e pessoas | Quantidade de contas válidas e soma de pessoas |
| Vendas | M21 | Mesa × balcão × outros | Faturamento da casa por `tipo_ocupacao`, em % |
| Vendas | M11 | Meta (só com o período "Mês") | Igual à do "Hoje" |
| Horários | M14 | Faturamento por hora | Pela **hora de abertura** (hora em que o cliente chegou), somado no período |
| Horários | M15 | Mapa de calor dia × hora | Contas válidas por dia da semana × hora de abertura (média por ocorrência do dia) |
| Horários | M16 | Almoço × jantar | Faturamento e contas por turno, conforme os turnos de Ajustes (padrão: almoço até 17h) |
| Horários | M18 | Permanência média | `fechada_em − aberta_em` das contas fechadas, por turno |
| Equipe | M24 | Ranking de garçons | Por `cod_garcom`: faturamento da casa, contas, ticket por conta e por pessoa. Mostra "Garçom 27" até a SCC mandar os nomes (H11) |
| Equipe | M25 | Taxa de serviço por garçom | Soma de `taxa_servico` das pagas por garçom. É a base para dividir os 10% |
| Descontos | M12 | Descontos | Total, % do faturamento e por `cod_operador_fechamento` |

- **Período:** Hoje, 7 dias, Mês ou intervalo escolhido. O intervalo escolhido
  usa `dia_operacao`, inclui as duas datas e aceita no máximo **90 dias**.
- **PDF:** `GET /r/[slug]/resultados/pdf` é uma leitura autenticada do painel.
  A rota confere o acesso à casa, valida os mesmos filtros da URL e lê as mesmas
  métricas da tela; não aceita identificador de restaurante como parâmetro.

## 4. Comparações (D-22)

- **Período anterior.** É o período de mesmo tamanho imediatamente antes: hoje contra ontem, 7 dias contra os 7 anteriores, mês contra o mês anterior até o mesmo dia.
- **Mesmo dia da semana (Resultados).** Para cada dia do período que teve ao
  menos uma conta paga, busca até as quatro ocorrências anteriores com movimento
  do mesmo dia da semana, calcula a média de cada métrica e soma essas médias.
  Se algum dia necessário tiver menos de duas ocorrências, a comparação não
  aparece. Assim, um período de vários dias é comparado com a referência de
  cada um dos seus dias, e não com uma média única do intervalo.
- **Mesmo dia da semana até o mesmo horário** (usado no "Hoje"):
  1. `decorrido = agora − (início do dia de operação atual)`.
  2. Para cada uma das **últimas 4 ocorrências** do mesmo dia da semana **em que a casa teve movimento** (pelo menos 1 conta paga no dia inteiro), some o faturamento da casa das contas pagas com `fechada_em ≤ início daquele dia + decorrido`.
  3. A referência é a média dessas somas.
  4. Variação = `(hoje − média) ÷ média`.
  5. Com menos de 2 ocorrências no histórico, a comparação não aparece.

  A curva "dia típico" é a média das 4 curvas acumuladas, ponto a ponto. *Não comparar com o dia inteiro: às 21h o dono sempre pareceria "abaixo".*
- **Meta do mês e projeção.**
  - `andamento = faturamento do mês ÷ meta`.
  - `projeção = (faturamento do mês até ontem ÷ dias de operação decorridos até ontem) × dias do mês`. O divisor é o **calendário** (do dia 1 até ontem), inclusive os dias em que a casa ficou fechada, e não só os dias com movimento.
  - A projeção só aparece a partir do 3º dia do mês e só com faturamento até ontem (sem base, fica indisponível: nunca R$ 0,00).
  - A projeção é a previsão e independe da meta; a tela só a mostra quando há meta.
  - Fica amarela quando a projeção é menor que a meta.
  - Limitação conhecida: a projeção não pesa os dias da semana. Fica para depois do piloto.

## 5. Fora da primeira versão

Ficam fora as métricas M13, M17, M19, M20, M22, M23 e M26 a M45 do cardápio:
- algumas por decisão de escopo;
- as dos grupos 2 a 5, porque dependem de itens, pagamentos, caixa, custo ou dados digitados pelo dono;
- as de clientes, porque o nome do cliente não é guardado no MVP (D-29).

A lista completa, com o que cada uma precisa, está no cardápio de métricas da descoberta (`_descoberta/2026-10-08-cardapio-de-metricas.md`).
