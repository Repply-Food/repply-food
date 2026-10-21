# Etapa 7 — Tela “Resultados” · Desenho

**Objetivo:** permitir que o dono acompanhe os resultados de um período da sua
casa, compare-os com uma referência justa e exporte as quatro análises em PDF.
É a implementação de “Resultados” aprovada na D-34 e fiel a
[`docs/telas/resultados.html`](../../telas/resultados.html).

**Decisões do dono (20/10/2026):**

- Para períodos com mais de um dia, “mesmo dia da semana” soma a média das
  últimas quatro ocorrências com movimento de **cada** dia do intervalo.
- O período livre aceita no máximo **90 dias**, com datas inicial e final
  inclusivas.

**Arquitetura (resumo):** funções SQL `metrica_resultados_*`, em uma migration,
calculam as métricas e comparações no Postgres com `security invoker`; a camada
`lib/metricas/resultados` chama as RPCs e monta tipos seguros; a página Server
Component lê filtros validados da URL e os componentes cliente apenas trocam os
filtros/aba. Uma rota autenticada monta o PDF a partir dos mesmos dados, sem
recalcular valores no navegador.

---

## 1. Escopo

**Dentro:**

- página `/r/[slug]/resultados` completa, no celular e no computador;
- períodos Hoje, 7 dias, Mês e intervalo escolhido de até 90 dias;
- comparação por período anterior e por mesmo dia da semana;
- abas Vendas, Horários, Equipe e Descontos, com as métricas M06 a M12, M14 a
  M16, M18, M21, M24 e M25 definidas em `docs/metricas.md`;
- meta e projeção exclusivamente quando o atalho do período for Mês;
- exportação de um PDF com as quatro abas do período ativo;
- estados sem dados, falha de leitura, isolamento e acessibilidade.

**Fora:**

- comparação com ano anterior (D-22);
- cadastro/nome de garçons ou operadores: a tela usa “Garçom N” e “Operador
  N”;
- dados de itens, meios de pagamento, clientes, custos ou qualquer dado fora
  de `entradas`;
- compartilhar, enviar por e-mail ou agendar o PDF;
- alterar meta, turnos, dados do restaurante ou conteúdo vindo do SCC.

## 2. Período, URL e comparação

A URL é a fonte de verdade dos filtros para que atualizar, voltar/avançar,
abrir um link ou gerar o PDF reproduzam a mesma visão:

```
/r/[slug]/resultados?aba=vendas&periodo=7d&comparacao=anterior
/r/[slug]/resultados?aba=horarios&periodo=escolher&inicio=2026-08-01&fim=2026-08-31&comparacao=semana
```

- `aba`: `vendas`, `horarios`, `equipe` ou `descontos`; padrão `vendas`.
- `periodo`: `hoje`, `7d`, `mes` ou `escolher`; padrão `7d`.
- `comparacao`: `anterior` ou `semana`; padrão `anterior`.
- `inicio` e `fim` só valem em `escolher`, têm formato `AAAA-MM-DD`, `inicio ≤
  fim`, e abrangem no máximo 90 dias. Um par inválido retorna ao período padrão
  em vez de transformar a URL em uma consulta arbitrária.
- As bordas do intervalo usam `dia_operacao`, respeitando fuso e hora de virada
  da própria casa. Hoje é o dia de operação atual; 7 dias inclui hoje e os seis
  dias anteriores; Mês vai do primeiro dia de operação do mês atual até hoje.

Para `anterior`, a referência é o intervalo de igual número de dias que termina
imediatamente antes do início selecionado. Para `semana`, cada dia selecionado
busca até quatro dias anteriores de mesmo dia da semana que tenham pelo menos
uma conta paga; as médias de cada métrica são somadas. Não há comparação para
uma métrica que dependa de duas ocorrências e não as tenha: a interface mostra
“—”, sem chamar ausência de histórico de queda ou alta.

## 3. Dados e isolamento

As funções SQL são `stable`, `security invoker` e recebem o `restaurante_id`
já autorizado por `exigirCasa`. Elas não aceitam ID oriundo do navegador nem
usam `service_role`. A RLS de `restaurantes`, `entradas`, `metas` e `turnos`
continua sendo a barreira que garante que uma casa não lê a outra.

Dinheiro sai do banco como `text`; a camada TypeScript não faz somas em
`number`. `null` representa uma razão sem denominador ou comparação sem base,
e não R$ 0,00. Faturamento é sempre `valor_consumido - taxa_servico`; taxa de
serviço aparece separadamente, em todas as superfícies, como exige a D-14.

O conjunto devolvido inclui:

| Aba | Dados |
|---|---|
| Vendas | faturamento diário, faturamento/taxa, contas, pessoas, tickets, participação por tipo de ocupação e meta mensal |
| Horários | faturamento pela hora de abertura, média de contas por dia da semana/hora, totais de almoço/jantar e permanência média |
| Equipe | ranking por `cod_garcom`, faturamento, contas, tickets, pessoas e taxa de serviço |
| Descontos | total, participação no faturamento e ranking por `cod_operador_fechamento` |

Contas consideradas são somente as não removidas, pagas e fechadas dentro do
intervalo pelo seu `dia_operacao`. A hora dos gráficos vem de `aberta_em` no
fuso do restaurante. Um código nulo não se mistura a um funcionário: aparece
como “Sem garçom” ou “Sem operador”.

## 4. Interface

O topo contém os quatro atalhos de período, o controle de comparação e
“Exportar PDF”. No computador, ficam numa linha; no celular, preservam alvos
tocáveis e podem ocupar mais de uma linha. O intervalo escolhido abre dois
campos de data com limites coerentes, não um calendário impossível de usar em
tela pequena.

As abas, nessa ordem, são Vendas · Horários · Equipe · Descontos. Elas usam
botões com semântica de tab, foco visível e `aria-selected`; a aba ativa está
na URL. No computador, a moldura existente mostra a barra lateral; no celular,
o menu inferior existente permanece livre e legível.

- **Vendas:** cartão de faturamento com barra diária e comparação; taxa separada;
  cartões de contas, pessoas, ticket por conta e por pessoa; distribuição Mesa
  × Balcão × Outros; e meta/projeção quando o período é Mês.
- **Horários:** barras por hora, mapa de calor legível também sem cor, cartões
  almoço/jantar e permanência média. Sem turnos cadastrados, usa o padrão
  documentado: almoço até 17h e jantar a partir daí.
- **Equipe:** tabela/cartões ordenados por faturamento com código do garçom e
  taxa de serviço. Sem dados, informa que não houve contas pagas no período.
- **Descontos:** total, percentual e lista por operador de fechamento; zero
  descontos é um resultado válido, distinto de período sem movimento.

Verde significa melhora contra a referência e vermelho significa piora;
laranja fica para marca e gráficos. Comparações aparecem apenas onde a métrica
tem uma referência válida. Os textos curtos de estado vazio explicam se não há
movimento, histórico suficiente ou meta cadastrada.

## 5. PDF

O botão solicita uma rota protegida do próprio painel. Ela repete a validação
da URL e a autorização da casa, lê exatamente o mesmo conjunto de métricas e
devolve um PDF baixável com nome contendo o período. O documento contém nome
da casa, intervalo, tipo de comparação, momento da geração e as quatro abas;
não contém nomes de clientes, payload SCC, tokens, e-mails ou segredos.

Falha de geração devolve erro controlado e não entrega PDF parcial. A rota não
aceita IDs de restaurante em parâmetros nem torna dados disponíveis sem a
sessão autenticada.

## 6. Testes e critérios de aceite

- Funções SQL: faturamento e taxa separados; fronteiras de dia de operação;
  período anterior; soma da média por mesmo dia da semana; máximo de 90 dias;
  turnos; permanência; rankings; descontos; ausência de histórico; e casa sem
  dados.
- Camada TypeScript: converte o formato das RPCs, preserva dinheiro em string e
  falha ao receber resposta SQL incompleta, em vez de inventar valores.
- Isolamento: uma sessão da casa A não obtém nenhum resultado, nem PDF, da casa
  B; admin em modo leitura vê somente a casa selecionada.
- Interface: URL inválida cai no padrão seguro; troca de aba/filtro preserva a
  casa; todos os quatro conteúdos e estados vazios funcionam em celular e
  desktop.
- PDF: rota exige sessão e acesso à casa, contém as quatro seções e não expõe
  conteúdo pessoal ou segredo.

## 7. Operação e limites

A migration é local durante o desenvolvimento; não aplicar migration remota,
não publicar nem criar segredos sem autorização explícita do Lucas Ferreira.
Antes de concluir: tipos, lint, toda a suíte de testes, build com URL local
temporária, verificação visual em larguras de celular e computador, revisão e
comparação com `origin/main`.
