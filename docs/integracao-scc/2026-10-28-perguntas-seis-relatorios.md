# Seis relatórios — pedido técnico para o Pedro / SCC

> **Backlog de refinamento e homologação, não pré-condição de desenvolvimento.** O usuário determinou construir com o material disponível. Seguir o [contrato atual](contrato-relatorios-v1.md) e a [entrada do executor](../superpowers/plans/2026-10-28-seis-relatorios-executar.md); encaminhar estas perguntas quando for conectar/conferir os dados reais.

**Data:** 28/10/2026. **Estado:** rascunho para o usuário encaminhar. Não enviado a ninguém pelo agente.

Os PDFs reais e os SQLs recebidos foram analisados. Para reproduzir os números com segurança, precisamos completar as regras abaixo. Não precisamos de cópia do banco real nem de dados pessoais de clientes para responder: preferir estrutura das tabelas, consultas e exemplos fictícios.

## Mensagem curta, pronta para encaminhar

Pedro, analisamos os seis relatórios e as consultas. A base do Food hoje recebe os totais das contas; para esses relatórios precisaremos ampliar o envio. Antes de definir o formato, você consegue nos ajudar com estes pontos?

1. **Resumo financeiro:** enviar todas as consultas e o código/regra que monta os blocos e totais, tanto on-line quanto histórico, com os filtros usados.
2. **Comissão:** a consulta recebida retorna as vendas, mas não a coluna Comissão do PDF. Enviar a fórmula/código completo, percentuais e arredondamento, e como são incluídos os operadores sem vendas e todas as funções. Precisamos de um exemplo fictício com pagamentos mistos, pois o SQL exclui a conta inteira se alguma forma não paga comissão.
3. **Caixa:** de onde vem o operador que agrupa o PDF? A consulta de lançamentos não retorna esse campo. Enviar também a consulta on-line, a regra de sinal de crédito/débito e os filtros da tela.
4. **Notas assinadas:** enviar a consulta on-line e explicar se o relatório lista notas emitidas, notas ainda em aberto ou ambas; o que acontece quando a nota é baixada/cancelada. Precisamos do vínculo entre nota, pagamento, entrada e cliente, sem o cadastro pessoal completo.
5. **Chaves e fechamento:** enviar a estrutura das tabelas envolvidas, com tipos/decimais, chaves e relacionamentos. Ao passar das temporárias para as finais os códigos são mantidos? Existem períodos em que os dois lados coexistem ou nenhum dos dois está completo? Como identificamos o movimento já fechado de modo consistente?
6. **Datas e filtros:** confirmar o significado de `DataMovimento` e `DataMovimentacao`, qual tabela fornece a data no relatório de produtos e como consultar um dia que atravessa a meia-noite. Nos ramos on-line recebidos alguns filtros não são usados; isso é intencional ou existe código complementar?
7. **Produtos e auditoria:** o custo vem do cadastro atual ou deve ser o da venda? Como se calcula/arredonda com quantidade fracionária? Na auditoria precisamos da chave única e código do operador; enviar também exemplos fictícios de todos os tipos e a regra de `ExibirTransferenciasAuditoria`.
8. **Envio e tamanho:** o emissor atual consegue mandar itens, pagamentos, lançamentos, auditorias, notas e cadastros mínimos? Qual a versão do SQL Server/SCC e o volume aproximado diário/histórico do maior cliente? Precisamos prever envio por partes inclusive quando um único dia for grande, sem duplicar nem apagar dados durante a carga.

Por favor, incluam as rotinas que completam os PDFs fora dessas procedures. Um SQL que retorna parte das colunas não basta para conferir o relatório inteiro. Os exemplos podem ser todos fictícios.

## Detalhamento e dependências do planejamento

### T01 — Composição completa do financeiro

- Procedures, views e trechos Delphi/relatório usados nos dois modos; parâmetros e ordem de execução.
- Definição de entradas/categorias/habilitados/reabilitados/encerrados/abertos, inclusive período sem movimento e mais de um caixa.
- O Food incluirá as contagens por sexo/categoria somente agregadas por movimento. A SCC consegue calcular e enviar esses totais sem sexo por pessoa, identificador individual ou vínculo com cada entrada? Enviar a fórmula e categorias, não os dados individuais.
- Fórmula e origem de consumo, serviço, complemento, entradas, produto embutido e flyers. Relação com `ValorItens`, `ValorConsumido`, `ValorDescontos` e `TaxaServico` do envio atual.
- Como classificar dinheiro, crédito, débito, PIX, nota assinada, desconto e bandeiras. Cadastro e código devem ser usados ou há regra por nome?
- Troco, desconto de pagamento versus de item/conta, estorno, devolução, cortesia, fiado, taxa retirada e recebimento posterior. Quais componentes são receita, recebimento, crédito não recebido ou ajuste?
- Quais blocos reconciliam entre si e quais diferenças são legítimas? Exemplo fictício completo com componentes não zerados.

**Desbloqueia:** escopo, dados e fórmulas de R01; reconciliação com produtos, pagamentos e notas. Sem isso não há cálculo homologável do financeiro.

### T02 — Data e movimento

- `DataMovimento` representa abertura, fechamento da conta, fechamento de caixa ou outra referência? `AuditoriasFinal.DataMovimentacao` tem a mesma semântica?
- No SQL de Produtos, `DataMovimento` não está qualificada. Em qual tabela está essa coluna? O emissor pode fornecê-la explicitamente?
- Como identificar o movimento aberto e os movimentos fechados? Há código de movimento/caixa/turno além da data? Pode haver mais de um aberto?
- O período inclui as duas datas? Como ficam conta aberta em um dia e paga em outro, madrugada, reabertura e lançamentos retroativos?
- Todas as datas/horas estão no fuso local da casa? Há nulidade, precisão de frações de segundo ou horários inválidos a tratar?

**Desbloqueia:** filtros e vínculo temporal de todos os relatórios; evita alterar incorretamente o dia do Hoje.

### T03 — Estrutura, identidade e passagem entre fontes

Enviar DDL de tabelas/view/relacionamentos, sem conteúdo, para `Entrada`/`EntradaFinal`, `Consumo`/`ConsumoFinal`, `Produtos`, `GrupoEstoque`, `PDV`, `Operadores`, `Pagamento`/`PagamentoFinal`, `FormasPagamento`, `LancamentosFinal` e equivalente on-line, `TiposCredito`, `TiposDebito`, `Auditorias`/`AuditoriasFinal`, `Parametros`, `NotasAssinadasFinal` e equivalente on-line. De `Clientes`, apenas tipos/chaves dos campos mínimos usados na nota, sem dados.

- Chave primária real de cada fato; escopo de unicidade por caixa/dia/instalação e eventual reutilização de códigos.
- Chaves preservadas, copiadas ou recriadas na passagem para as tabelas finais? Como relacionar as duas identidades se mudam?
- Passagem é transacional? Pode haver duplicidade temporária ou lacuna? Como o emissor obtém uma fotografia coerente sem prejudicar o caixa?
- Correções, cancelamentos e exclusões afetam só temporárias ou também finais? Há carimbo confiável de alteração ou lista de removidos?
- Cadastro inativado/excluído continua disponível para os relatórios antigos? Como interpretar fatos órfãos dos `INNER JOIN`s?

**Desbloqueia:** chaves, relacionamentos, idempotência, reconciliação, fechamento e modelo de dados. Não criar DDL definitivo por suposição.

### T04 — Comissão completa

- Qual rotina calcula o valor da coluna Comissão? É por item, conta, operador, produto, nível, percentual individual, período ou rateio?
- Percentuais são históricos ou atuais? Qual a base e onde/quando ocorre o arredondamento? Há casas com regras diferentes?
- A exclusão da conta inteira por uma forma não comissionável, mesmo num pagamento pequeno misto, é a regra desejada?
- Como aparecem operadores sem vendas e a função de sistema, ausentes do resultado SQL recebido? Quais níveis existem além dos mapeados?
- Quais filtros a tela possui? O on-line deve aplicar operador, apesar de o SQL recebido não o aplicar?
- Pode fornecer exemplo fictício com produto não comissionável, pagamento misto, operador com regra diferente e trocas de garçom entre itens?
- Se o cálculo estiver apenas no desktop, o SCC consegue enviar o resultado oficial e dimensões necessárias sem o Food estimar?

**Desbloqueia:** R03. Não substituir comissão por taxa de serviço nem inferir percentual a partir de PDF.

### T05 — Duas fontes e filtros de cada tela

- Procedures completas dos seis relatórios nos dois modos. Faltam todas as de R01 e as on-line de R04/R06.
- Capturas das telas de filtro sem dados reais, ou lista dos campos/opções/defaults. Há outros filtros além dos parâmetros SQL?
- Produtos on-line ignora datas, PDV, grupo, garçom e mesa no SQL; Comissão on-line ignora operador/datas; Auditoria on-line ignora operador/datas. Confirmar se é intencional ou se outra rotina faz o filtro.
- No on-line, o que as datas obrigatórias devem representar? O movimento atual pode estar numa data anterior à data civil?
- Os `LIKE` são usados só com `%` para Todos e código exato, ou suportam padrões parciais? Códigos nulos e filtro de mesa têm comportamento especial?
- Qual ordenação do PDF vem do SQL e qual vem do componente do relatório? Por exemplo, produtos agrupados por PDV/grupo não têm `ORDER BY` no procedimento.

**Desbloqueia:** contrato de filtros, equivalência desktop/Food, rotas e testes de UI/PDF.

### T06 — Caixa

- Código/nome do operador e vínculo com caixa/movimento, que não aparecem na consulta enviada.
- Valores de débito chegam positivos, negativos ou mistos? Regras para estorno, fundo, retirada, recebimento e valor zero.
- Agrupamento e totais do PDF por operador/data civil; categorias com códigos iguais em crédito e débito.
- Significado e necessidade de `CredorDevedor` e `Descricao`; os textos podem ser minimizados ou substituídos por informação estruturada?

**Desbloqueia:** R04, incluindo sinais e proteção de texto livre.

### T07 — Auditoria

- Chave única da ocorrência, código do operador e vínculo com movimento/entrada.
- Lista completa dos tipos e exemplos fictícios de perda, limites, exclusão de taxa e transferência, além de cancelamento.
- Parâmetro de exibição de transferências vale na data da ocorrência ou no momento em que o relatório é gerado?
- Como ficam produto excluído, quantidades negativas, evento repetido com mesmo momento e correção/exclusão de auditoria?
- Precisamos de valor/quantidade/total para cada tipo; quais campos e totais fazem sentido e quais não se aplicam?
- É possível omitir `Nomecliente` e minimizar texto livre na extração? A avaliação de nome para Notas não deve liberar os demais campos automaticamente.

**Desbloqueia:** R05, identidade, significado dos totais e política de dados.

### T08 — Notas e cadastros mínimos

- Nota emitida versus pendente: o que entra se foi paga depois, cancelada ou alterada? Existe saldo/baixa em outra tabela que não faz parte deste relatório?
- Relacionamentos/quantidades entre nota, pagamento, entrada e cliente; pode haver várias notas por entrada e alteração de cliente?
- O nome é lido do cadastro atual ou existe fotografia da emissão? Como lidar com nome alterado e cadastro removido?
- É viável enviar só código e nome de exibição dos clientes necessários às notas, sem demais dados pessoais?

**Desbloqueia:** R06 e a avaliação de política; não amplia automaticamente para gestão de recebíveis.

### T09 — Precisão, custo e estabilidade histórica

- Tipos SQL, precisão/escala e limites de dinheiro, valores unitários, acréscimo/desconto, custo e quantidade. Confirmar frações além de três casas.
- Arredonda por item, grupo, conta ou apenas no final? `NULL`, custo zero, cancelado e estorno têm regras distintas?
- `Produtos.PrecoCusto`, nome, grupo e `PagaComissao` atuais devem alterar resultado de período antigo ao serem editados? Ou o Food deve manter a fotografia da época?
- A alteração de formas de pagamento/operadores também modifica resultados antigos? Como detectar mudança em cadastro sem mudança no fato?

**Desbloqueia:** tipos exatos, recomputação, sincronização de dimensões e igualdade centavo a centavo.

### T10 — Emissor, volume e consistência

- Quem mantém o emissor e qual parte da ampliação será feita pelo Pedro? Linguagem/componente, versões SCC e SQL Server dos clientes.
- Capacidade de ler/enviar novos conjuntos, extrair fotografia coerente, dividir dentro do dia, guardar checkpoint e repetir com a mesma geração.
- Maior número diário de contas, itens, pagamentos, lançamentos, auditorias e notas; anos de histórico, tamanho aproximado e frequência de correções antigas.
- O ritmo de cinco minutos é viável para todos os conjuntos? Como capturar fechamento/reabertura e atualizações cadastrais?
- Quais índices/consultas estão disponíveis sem criar carga excessiva ou alterar produção nesta fase?
- Se for proposto Change Tracking, confirmar suporte/permissões/chaves/ciclo das tabelas; não habilitar recurso nesta etapa.

**Desbloqueia:** loteamento, limites, orçamento de armazenamento, frequência e viabilidade operacional.

### T11 — Massa de homologação

- Gerar exemplo inteiramente fictício cobrindo um movimento aberto, fechamento e madrugada; os seis relatórios correspondentes com filtros conhecidos.
- Incluir produtos/custos não zerados, frações, cancelados, formas mistas, comissão, débito/crédito e múltiplas notas.
- Fornecer resultados esperados e versão da SCC/configurações. Não é necessário fornecer o banco real do cliente.

**Desbloqueia:** testes reproduzíveis compartilhados e conferência do sistema completo.

## P01 — Decisões internas do Food, não transferir ao Pedro

A apresentação com identidade Food e as contagens por sexo/categoria agregadas na SCC, sem sexo por pessoa, já foram confirmadas pelo usuário. Ainda precisam de confirmação a navegação, prioridade on-line/histórico, limite de períodos grandes e política delimitada de nomes/textos. O Pedro informa a origem e semântica; a Repply decide finalidade, dados mínimos e acesso no produto.
