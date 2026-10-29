# Seis relatórios SCC — análise dos materiais e proposta de arquitetura

> **Pesquisa histórica, substituída como orientação de execução.** Após este documento, o usuário determinou executar com os materiais disponíveis e refinar depois. O [desenho atual](2026-10-28-seis-relatorios-design.md) e a [entrada do executor](../plans/2026-10-28-seis-relatorios-executar.md) são normativos. Os bloqueios e propostas abaixo registram a análise original, não pré-condições para iniciar a implementação atual.

**Data:** 28/10/2026. **Base inspecionada:** `422eaefdcef606210ac52e9ba8fe5ae7b88a9182`.

**Estado:** análise documental e proposta para discussão; não é desenho aprovado nem autorização de implementação. Nenhuma consulta anexa foi executada. Nenhuma mudança de aplicação ou banco faz parte deste trabalho. As dependências de informação estão identificadas por código, com perguntas no [pedido técnico à SCC](../../integracao-scc/2026-10-28-perguntas-seis-relatorios.md). A sequência proposta está no [roteiro de planejamento](../plans/2026-10-28-seis-relatorios-roteiro.md).

## 1. Objetivo e decisões já recebidas

Preparar o Food para oferecer os seis relatórios aos restaurantes, com dados conferíveis com a SCC, filtros, consulta em celular/computador e PDF. O usuário pediu somente análise e planejamento; outro modelo executará depois.

O parceiro confirmou que os PDFs são relatórios **reais de um cliente**. Eles são referência privada de análise, não fixtures nem conteúdo para o repositório público. Este documento não reproduz nomes, valores, dados cadastrais ou linhas desse cliente. Os testes futuros usarão cenários inteiramente fictícios.

O usuário confirmou **adaptar a apresentação para a identidade do repply food., mantendo os mesmos números, detalhes e filtros da SCC e preservando os relatórios atuais**. A localização da nova área e as exceções de dados pessoais ainda precisam de definição.

O usuário também confirmou incluir no Resumo financeiro **contagens agregadas por sexo e categoria de entrada, sem sexo por pessoa**. A agregação deve ocorrer na SCC, antes do envio; o Food não recebe os registros individuais para produzir essas contagens.

Na conversa, o usuário escolheu **avaliar uma mudança da regra para mostrar nomes em Notas assinadas**. Isso permite estudar uma exceção delimitada; não aprova coletar dados pessoais nem remove a filtragem atual. A política final e o desenho precisam de confirmação antes da execução.

## 2. Materiais recebidos e o que comprovam

Foram recebidos **13 arquivos: seis PDFs, seis arquivos SQL e um `.sqlsuo`**. Os PDFs somam oito páginas. Foram extraídos os textos de todas as páginas; as primeiras páginas dos seis relatórios e a última de Produtos foram inspecionadas visualmente.

| Nº | Relatório / arquivo | Material disponível | Limite da evidência |
|---|---|---|---|
| 01 | Resumo financeiro | PDF de uma página | Nenhum SQL correspondente. O parceiro informou que pedirá ao Pedro as múltiplas consultas usadas |
| 02 | Produtos vendidos | PDF de três páginas; `02_spRelatorioProdutosVendidos.sql` | SQL tem ramos on-line/histórico; não mostra toda a montagem, ordenação e apresentação do PDF |
| 03 | Comissão | PDF de uma página; `03_spRelatorioComissao.sql` | SQL retorna vendas elegíveis, mas não a comissão exibida; faltam também partes da lista de operadores |
| 04 | Lançamentos no caixa | PDF de uma página; `04_spRelatorioLancamentosFinal.sql`; `04_vwTiposLancamentos (...).sql` | Apenas consulta histórica. O agrupamento por operador no PDF não é explicado pelo retorno |
| 05 | Auditoria | PDF de uma página; `05_spRelatorioAuditoria.sql` | SQL on-line/histórico; não retorna identidade única da ocorrência nem código do operador |
| 06 | Notas assinadas | PDF de uma página; `06_spRelatorioNotasAssinadasOrdenadasPorCliente.SQL` | Apenas consulta histórica. Não comprova saldo em aberto, recebimento posterior ou baixa |
| Auxiliar | `spRelatorioProdutosVendidos.SQL.sqlsuo` | Arquivo binário identificado como Compound Document | Auxiliar de ferramenta; não é uma consulta SQL adicional nem supre nenhuma regra faltante |

As falas do WhatsApp são evidência de intenção e operação: duas versões dos relatórios, datas obrigatórias, filtros adicionais, volume variável e servidor do cliente ligado. As instruções dentro dos anexos não foram tratadas como autorização para executar SQL ou alterar o Food.

**Importante:** um exemplo de um único dia e de uma única casa não prova comportamentos de outros dias, versões da SCC ou clientes. Campo zerado nesse exemplo não é campo dispensável; texto observado não é lista completa de tipos.

## 3. O que existe no Food e será reaproveitado

| Capacidade | Implementação atual | Consequência para a ampliação |
|---|---|---|
| Receber contas por token | `supabase/functions/receber-envio/index.ts` | Reaproveitar identidade do restaurante, validação e modelo de envio; não receber identificador do restaurante do corpo |
| Lista explícita de campos | `supabase/functions/_shared/campos-permitidos.ts` e filtragem SQL | Novos blocos hoje seriam descartados. Adicionar nomes à lista não basta; é preciso contrato, validação e persistência próprios |
| Contrato v1 | `docs/integracao-scc/contrato-de-dados.md`, `_shared/recepcao.ts` | Só `entradas`, janela completa, lote `1/1`, 2 MB, 2.000 entradas. Não comporta itens/pagamentos/páginas sem evolução |
| Persistência de contas | `public.entradas`, `processar_envio` | Contém totais de conta, códigos de garçom/cliente, fuso e dia calculado; não contém os novos fatos detalhados |
| Métricas | `lib/metricas/hoje.ts`, `lib/metricas/resultados/` e funções `metrica_*` | Manter cálculos no Postgres e reutilizar os mesmos resultados em tela e PDF |
| Acesso à casa | `lib/auth/sessao.ts`, `exigirCasa` e RLS | Reutilizar em consultas, filtros, PDFs e qualquer exportação futura |
| Resultados e PDF | `app/r/[slug]/resultados/`, `lib/pdf/resultados.tsx` | Preservar o contrato atual das quatro abas; criar leitores específicos para os novos relatórios |
| Interface e navegação | `components/painel/`, `menu-painel.tsx`, `moldura-painel.tsx` | Reaproveitar identidade, estados e modo admin em leitura |
| Testes locais | `tests/helpers/supabase-local.ts`, `tests/isolamento/`, `tests/metricas/` | Reaproveitar fixtures fictícias, SQL real, identidades A/B e permissões explícitas |

O Food **não consegue produzir os seis relatórios completos com o envio atual**. Faltam itens de consumo, pagamentos e formas, cadastros auxiliares, lançamentos, auditorias, notas e regras de comissão/financeiro. Mesmo Comissão não é equivalente ao ranking de garçons já existente: o ranking usa o garçom da conta; a consulta SCC usa o operador de cada item e regras de elegibilidade.

## 4. Análise por relatório

### R01 — Resumo financeiro

**Blocos observados:** contagem de entradas por categorias e sexo; habilitados/reabilitados/encerrados/abertos; resumo financeiro projetado; recebimentos por meio; notas assinadas e descontos; discriminação de produtos, serviço, complemento, taxas de entrada, produto embutido e flyers; cartões discriminados por denominação.

**Dados necessários:** consultas completas e parâmetros; pagamentos por entrada/forma; cadastros de formas e classificações; componentes financeiros; categorias de entrada; eventuais parâmetros e contagens específicos da SCC. Totais atuais de `entradas` podem contribuir, mas não autorizam reconstruir as fórmulas faltantes.

**Não assumir:** que projetado significa a projeção mensal do Food; que recebido é faturamento; que notas assinadas são dinheiro recebido; que desconto de pagamento é igual ao desconto do item/conta; que as denominações de cartão distinguem crédito/débito de modo confiável pelo nome. O título de um bloco do PDF inclui crédito, mas as linhas também incluem débito: a classificação precisa vir da regra/cadastro.

**Privacidade específica — escopo confirmado:** incluir a matriz por sexo/categoria somente como **contagens agregadas por movimento**, calculadas na SCC antes do envio, sem identidade de pessoa ou vínculo com entrada individual. O Food não importa sexo individual nem busca esse campo em `extras`. Documentar o conjunto agregado no contrato v2 e testar a rejeição de dados individuais; fórmulas, categorias e regras das contagens ainda dependem de T01.

**Bloqueios:** P01, T01, T02, T05, T11. A igualdade entre componentes só pode virar teste depois de receber as fórmulas e as situações excepcionais.

### R02 — Produtos vendidos

**Saída SQL:** PDV, grupo, código/nome do produto, quantidade, total de venda e total de custos. **PDF:** agrupamento por PDV e grupo, subtotais por grupo, quantidade geral, total de vendas, custos e diferença entre vendas e custos.

**Fórmulas comprovadas pelo SQL:**

```text
total_item = (valor_unitario + acrescimo_unitario - desconto_unitario) * quantidade
total_vendas = soma(total_item)
total_custos = soma(preco_custo_do_cadastro_de_produto * quantidade)
```

O rodapé chamado de vendas líquidas no PDF corresponde, no exemplo, à diferença entre vendas e custos; não deve receber o rótulo de lucro líquido do negócio, pois não inclui as demais despesas. Validar a denominação com produto/SCC.

**Filtros históricos explícitos:** datas, PDV, grupo, garçom do item, cartão/mesa inicial e final. Os filtros de código usam `LIKE`. No Food, propor seletores de código exato e opção Todos; não aceitar padrão SQL arbitrário. Confirmar se o desktop usa padrões parciais que precisam ser reproduzidos.

**Regras que não podem ser perdidas:** excluir somente itens cancelados conforme o SQL; o SQL não exige conta paga neste relatório. Usa o PDV do consumo, não `tipo_ocupacao` da conta. O garçom é o do item, não necessariamente o da conta. Há `INNER JOIN` com produtos, grupo, entrada, PDV e operadores: cadastros ausentes podem excluir linhas; diagnosticar e confirmar a regra, sem inserir fallback silencioso.

**Precisão/histórico:** quantidade aparece com três casas; precisão real de quantidade, valores unitários, custo e escala de arredondamento dependem do DDL. O custo vem de `Produtos.PrecoCusto` atual, não de custo da venda comprovado. Nome/grupo também vêm do cadastro atual. Perguntar se o objetivo é reproduzir o SCC reexecutado hoje ou manter a fotografia histórica. Não inventar custo histórico nem usar custo ausente como zero real.

**On-line:** o ramo `@Tipo=0` não aplica datas, PDV, grupo, garçom nem intervalo de mesa; o filtro de garçom está comentado. É uma diferença real do SQL fornecido, não autorização para a interface ignorar filtros. O comportamento desejado precisa ser confirmado.

**Bloqueios:** T02, T03, T05, T08, T09, T10.

### R03 — Comissão

**PDF:** operador, função, vendas, comissão e totais; também lista operadores sem vendas. **SQL:** retorna nome, função derivada de nível e soma de vendas elegíveis; não retorna comissão, código do operador ou cadastro completo de operadores.

**Elegibilidade comprovada:** item não cancelado; conta paga; produto com `PagaComissao='Sim'`; excluir **a conta inteira** se existir qualquer pagamento cuja forma tenha `PagaComissao='Não'`. Não fazer rateio proporcional por meio de pagamento sem resposta da SCC. Filtrar operador no item e `EntradaFinal.DataMovimento` no histórico.

**Lacunas:** percentual, base, rateio, arredondamento, eventual teto e vigência; montagem da lista com operadores zerados; função de sistema exibida no PDF e não mapeada pelo `CASE` recebido; eventuais consultas complementares. Nome e nível são usados para agrupar no SQL, mas não servem como chave de identidade na nuvem. Pessoas homônimas precisam de códigos e regra de agrupamento confirmada.

**Não assumir:** comissão igual à taxa de serviço, nem uma porcentagem fixa das vendas, nem que a taxa possa ser inferida da divisão dos valores do PDF. O comportamento de pagamentos mistos precisa de caso fictício fornecido/confirmado pela SCC.

**Proposta de autoridade:** preferir calcular no Food quando a regra completa for documentada e homologada. Se o cálculo só existir no desktop, avaliar envio do resultado oficial de comissão pelo SCC, com movimento, operador, regra/versão e dimensões suficientes para os filtros. Nesse caso, marcar a origem do cálculo e testar a idempotência; não reconstruir comissão no navegador.

**Bloqueios:** T03, T04, T05, T09, T10.

### R04 — Lançamentos no caixa

**SQL histórico:** código do lançamento, data e hora civil, tipo, código e nome da categoria de crédito/débito, credor/devedor, descrição, valor. Filtra `DataMovimento`, tipo e categoria. Ordena por código do lançamento e credor/devedor.

**View:** une `TiposCredito` e `TiposDebito`; um mesmo código numérico pode existir em ambos. A identidade da categoria exige **tipo + código**, sempre dentro da casa.

**PDF:** também agrupa por operador e data civil, com total de créditos, débitos assinados e saldo por grupo/operador. A consulta fornecida não retorna o operador. Solicitar o vínculo e a montagem complementar. Movimento do dia anterior pode incluir eventos civis da madrugada seguinte; preservar ambos.

**Não assumir:** que lançamentos sejam os pagamentos de vendas; que valor de débito já venha negativo; que crédito menos débito seja saldo bancário ou fechamento integral do caixa. Esse relatório apresenta o saldo dos lançamentos filtrados, sujeito à regra oficial de sinal. Fundo, retiradas, estornos e lançamentos de valor zero precisam de casos próprios.

**Privacidade:** credor/devedor e descrição podem conter nomes ou outros dados pessoais; um campo de texto autorizado pode carregar dados indesejados. Definir quais campos e finalidade serão aceitos, sem copiar texto livre para logs.

**Bloqueios:** T02, T03, T05, T06, T09 e política P01.

### R05 — Auditoria

**Tipos explícitos no SQL:** cancelamento de produto, perda de cartão, alteração de limites, exclusão de taxa de serviço e transferência de produtos. Transferência só entra quando `Parametros.ExibirTransferenciasAuditoria=1`.

**Saída:** tipo, nome do operador, nome do cliente, cartão/mesa anterior e novo, produto/nome, valor unitário ajustado, quantidade, data/hora civil, motivo, total e limites mínimo/máximo anterior/novo. `LEFT JOIN` em produto preserva eventos sem produto. `ISNULL` define zero em alguns campos; não estender esse tratamento para toda ausência de dado no sistema.

**Fórmulas comprovadas:** valor ajustado = unitário + acréscimo − desconto; total = valor ajustado × quantidade, com os `ISNULL` originais. Precisão e momento de arredondamento precisam ser confirmados.

**Histórico:** filtra `DataMovimentacao` (nome diferente dos demais relatórios), operador e tipos. **On-line:** não filtra datas nem operador. Ordena por tipo, data e hora. Um evento não é dedutível do estado final da conta: é necessário receber o histórico de auditoria.

**Identidade:** consulta não retorna a chave da auditoria nem código do operador. Data/hora/tipo/produto não formam chave confiável: duas ocorrências iguais podem ser legítimas. Pedir a chave real e regras de correção/remoção.

**Totais:** apresentar contagens e somas pertinentes por tipo; não somar transferência, perda e exclusão de taxa como se todos representassem perda financeira. O exemplo só demonstra cancelamentos; não prova layout/cálculo de todos os outros tipos.

**Privacidade:** a avaliação de nomes em Notas assinadas não libera `Nomecliente` aqui. Proposta inicial mantém o campo descartado e usa cartão/código quando disponível. Motivo livre também exige política.

**Bloqueios:** T02, T03, T05, T07, T09 e P01.

### R06 — Notas assinadas

**SQL histórico:** nota → pagamento → entrada; código da nota, código da entrada, `EntradaFinal.DataMovimento`, código/nome do cliente, valor. Filtra datas e cliente; ordena por nome do cliente e entrada. Desempate estável pelo código da nota é necessário para paginação, sujeito à confirmação das chaves.

**Regras:** uma entrada pode ter mais de uma nota e pagamento. Agregar na granularidade da nota; evitar multiplicar valores ao juntar pagamentos, itens e contas. Confirmar se os códigos são permanentes e se o relatório inclui cortesia, canceladas ou baixadas.

**Limite de escopo:** o material demonstra **notas emitidas no período**, não contas a receber, vencimentos, inadimplência ou saldo atual. Não criar essas funcionalidades por inferência.

**Privacidade:** proposta de cadastro mínimo `código + nome de exibição`, limitado à casa e à finalidade de identificar a nota, somente após decisão final. Não importar a tabela `Clientes` inteira; nenhum RG, telefone, sexo ou endereço. Código de cliente também merece proteção: pseudonimização não transforma automaticamente o dado em anônimo.

**On-line:** parceiro afirma que há duas versões, mas só chegou a consulta de `NotasAssinadasFinal`. Exigir equivalente on-line antes de prometer essa modalidade.

**Bloqueios:** T02, T03, T05, T08, T09 e P01.

## 5. Decisão arquitetural proposta

| Alternativa | Vantagem | Limitação |
|---|---|---|
| A — SCC envia apenas resultados prontos por relatório | Menos regras reimplementadas e menor volume inicial | Totais prontos podem não permitir filtros novos, auditoria de diferenças ou recomposição por período; continua precisando sincronização/versionamento |
| B — Food recebe fatos e cadastros mínimos e calcula tudo | Flexibilidade e rastreabilidade; segue padrão atual | Depende de chaves/DDL e de conhecer integralmente fórmulas e semântica; maior armazenamento |
| C — Fatos mínimos + resultados oficiais só quando necessários | Reutiliza dados entre relatórios e preserva cálculo oficial onde ainda não pode ser reproduzido | Exige identificar claramente a autoridade, a versão e as dimensões de cada resultado oficial |

**Recomendação: C**, usando B como padrão para regras comprovadas. Não espelhar todo o banco SCC e não consultar o SQL Server do restaurante a cada abertura do painel. O servidor local ligado permite o envio contínuo; não garante conexão permanente nem substitui retry/reconciliação. Agregados oficiais que não suportem um filtro não podem ser rateados ou repartidos por estimativa.

O caminho continua **SCC → HTTPS → Supabase → funções de leitura → tela/PDF**, sem escrita do Food no banco SCC. A obtenção dos dados e eventual mudança do emissor Delphi são trabalho da SCC, com contrato conjunto; os procedimentos T-SQL anexos não são migrations executáveis no Postgres.

### 5.1 Dados mínimos candidatos, ainda sem DDL definitivo

| Conjunto proposto | Granularidade / informações necessárias | Chave e dependência a confirmar |
|---|---|---|
| Movimento SCC / cobertura | Data do movimento original, estado do movimento, geração da extração e cobertura | Identidade do movimento/caixa, se houver; não derivar só do relógio |
| Contas complementares | Entrada, `data_movimento_scc`, origem on-line/histórico, vínculo com conta existente | Permanência de `codEntrada` e vínculo na passagem para `EntradaFinal` |
| Itens de consumo | Item por entrada, produto, PDV, garçom, quantidade, preços, acréscimo/desconto, cancelamento | Chave real de `Consumo`/`ConsumoFinal`, relações e escala decimal |
| Produtos / grupos / PDVs | Códigos, nomes, grupo, custo usado no relatório e elegibilidade para comissão | Política de cadastro atual versus valor histórico, exclusões/inativos |
| Operadores | Código, nome de exibição, nível/função e atributos efetivamente usados | Lista completa de níveis; regra de operadores sem movimento |
| Pagamentos / formas | Pagamento por entrada, forma, valor, flags e classificações oficiais | Chave real, tratamento de estorno, pagamento misto e alterações |
| Lançamentos / categorias | Lançamento, movimento, momento civil, tipo/código, valor e operador | Operador ausente no SQL; categoria composta por tipo/código |
| Auditorias / parâmetros | Ocorrência, movimento, tipo, operador, produto, cartões, limites, quantidade/valores | Chave real, alterações e vigência de `ExibirTransferenciasAuditoria` |
| Notas assinadas | Nota, pagamento, entrada, movimento, código do cliente e valor | Ciclo de vida e consulta on-line |
| Clientes mínimos, se aprovados | Código e nome de exibição estritamente necessários à nota | Finalidade, acesso, retenção e atualização/exclusão de nomes |
| Financeiro / comissão oficial, se necessário | Resultado por movimento/dimensões com identificação da regra | SQL/fórmula faltante; não definir JSON ou chave com base no PDF |

Todos os conjuntos terão isolamento por `restaurante_id`. Códigos de dimensões e fatos não se tornam globais. Não usar nome como identidade. Se o SCC reutiliza números por caixa, período ou instalação, a chave deverá conter o namespace confirmado; não congelar uma chave artificial antes de T03.

### 5.2 Data do movimento, civil e dia do Food

Manter separadas: data de movimento original SCC; momento civil com fuso da casa; dia de operação calculado hoje pelo Food. Os novos relatórios filtram pelo critério oficial correspondente (`DataMovimento`/`DataMovimentacao`) após confirmação. Não alterar retroativamente o Hoje/Resultados e não substituir seu dia calculado sem uma decisão independente, homologada.

O filtro de datas precisa existir na UI **e ser validado no servidor e SQL**, com datas reais e ordem correta. Campos ausentes, duplicados, inválidos ou limites excedidos não podem virar consulta sem restrição ou trocar silenciosamente o período. Atalhos podem preencher as datas explicitamente. No on-line, confirmar como associar o movimento aberto às datas; não fingir que o ramo SQL atual já faz isso.

### 5.3 Sincronização v2 e continuidade on-line/histórico

O formato atual não basta. Contrato v2 deve preservar v1 para emissores antigos e definir capacidades por casa; ausência do conjunto não significa conjunto vazio. Inicialmente preferir endpoint separado para v2, com política de autenticação compartilhada, para limitar risco sobre o piloto existente. Essa escolha é proposta, não código implementado.

Requisitos do protocolo, qualquer que seja o JSON final:

1. Janela/escopo exatos por conjunto e fonte; emissão identificada por geração monotônica e versão do contrato. Chave de envio não substitui ordenação de gerações.
2. Extração consistente de itens/contas/pagamentos/cadastros envolvidos. Usar procedimento suportado pela SCC para não misturar antes e depois do fechamento. Não impor `NOLOCK` como solução de consistência.
3. Fragmentação por bytes e linhas **inclusive dentro de um único dia**. Precisará existir mesmo se dividir o período em dias ainda produzir mais de 2 MB. Contagem, limites, checksum e política de timeout explícitos.
4. Armazenamento temporário privado por geração e validação completa antes da publicação. Receber uma página não confirma o movimento inteiro. Respostas distinguem página recebida de geração publicada e cursor confirmado.
5. Publicação atômica do conjunto coerente necessário a cada relatório. Duplicatas e retry não duplicam fatos; páginas repetidas idênticas são aceitas; mesmo identificador com conteúdo conflitante é recusado.
6. Geração antiga fora de ordem não sobrescreve a nova. Lotes de duas gerações não se misturam; o escopo exato e a geração definem o que pode ser reconciliado.
7. Registro só é removido logicamente por ausência em **escopo completo publicado**, nunca pela chegada de página parcial, timeout, falha, queda de rede ou ausência de capacidade do emissor.
8. Transição temporário → permanente tem política oficial de chaves e precedência. Se a origem mudar o código, é obrigatório um vínculo de correspondência ou fonte canônica definida pela SCC. Não usar `UNION ALL` das duas fontes sem deduplicação comprovada.
9. Se um registro sair do temporário antes de chegar ao permanente, manter a última visão coerente e indicar transição/atraso, não apagar o movimento nem apresentar zero. Uma geração explicitamente completa e vazia é diferente de ausência de envio.
10. Capturar fechamento/reabertura, correções e exclusões históricas. Reenvio periódico de janela é proteção parcial; correções mais antigas precisam de pedido de reenvio por conjunto/período ou cursor de alteração confiável.
11. Histórico inicial não bloqueia a sincronização atual. Publicar cobertura por períodos/conjuntos, retomar carga por checkpoint e exibir incompletude em vez de total integral fictício.
12. Ritmo/limite precisam ser definidos para páginas v2, evitando que o limitador global v1 de 20 s impeça todos os blocos ou atrase o sinal de vida. Não desligar a proteção v1.
13. Sinal de vida atual não comprova frescor de pagamentos/auditorias. Mostrar atualização/cobertura dos conjuntos necessários; um relatório não fica em dia só porque chegaram contas.
14. Temporários de ingestão têm RLS sem leitura de cliente, `service_role` limitado no caminho de escrita e limpeza com retenção curta aprovada; não duplicar indefinidamente dados pessoais em payloads de erro.

Não escolher Change Tracking antes de saber se a SCC oferece chaves, permissões e comportamento de migração entre tabelas. Snapshots completos por escopo são a primeira opção a estudar; sua leitura/publicação precisa ser limitada, sem transação gigante de todo o histórico.

### 5.4 Privacidade e acesso

Para avaliar nomes em Notas assinadas: registrar a finalidade; aceitar apenas campos mínimos em lista explícita; definir retenção e atendimento de correção/exclusão; ajustar documentação/contrato com restaurante e responsabilidades antes da coleta. Consentimento ou outra base aplicável não é inferido do envio do PDF pelo parceiro.

Separar as decisões sobre nome de cliente, nome/função de funcionário, credor/devedor, descrição e motivo. Manter RG, telefone, sexo individual e endereço de cliente fora do contrato. Texto livre precisa de avaliação específica; truncar não o anonimiza. O banco, validação, logs, consultas e PDF devem aplicar a mesma política.

Reutilizar RLS e `exigirCasa`; funções novas nascem fechadas, consultas usam `security invoker` ou verificação explícita equivalente; escrita técnica não é exposta ao usuário. Filtros de clientes/operadores também são isolados. PDFs e respostas não entram em cache público ou service worker; nomes não vão em URL, logs ou arquivos de teste. Chaves de cache internas, se existirem, incluem casa, relatório, filtros e versão dos dados.

Admin continua no modo de leitura já existente, com ações de escrita bloqueadas. A decisão de acesso a nomes pelos admins precisa ficar explícita; não criar perfis por funcionário como parte deste escopo sem pedido próprio.

## 6. Experiência proposta e limites

Proposta de uma área **Relatórios** com seis entradas, em vez de carregar mais seis painéis junto das quatro abas de Resultados. Cada relatório terá rota, filtros pertinentes e carregamento próprio; o carregador atual faz nove consultas em paralelo e não deve crescer para buscar todos os novos fatos a cada navegação.

Manter Hoje, Resultados e Ajustes; a localização do acesso a Relatórios no menu é decisão de produto. Reutilizar as análises existentes por links quando útil, sem confundir Comissão com ranking nem Financeiro com faturamento. Marca e linguagem do Food; concordância de números/filtros com SCC, não necessariamente cópia das quebras de linha e limitações de impressão antigas.

| Relatório | Filtros mínimos demonstrados/propostos | Apresentação principal |
|---|---|---|
| Financeiro | Datas e fonte on-line/histórica; outros dependem do SQL | Blocos separados de consumo, serviço, pagamentos e demais componentes |
| Produtos | Datas, fonte, PDV, grupo, garçom, mesa/cartão de/até | Agrupar PDV/grupo; produto, quantidade, vendas, custos; subtotais e total |
| Comissão | Datas, fonte e operador | Operador/função, vendas elegíveis e comissão oficial; zerados conforme regra |
| Caixa | Datas, fonte quando consulta existir, tipo e categoria; operador a confirmar | Agrupamento oficial por operador/data; créditos/débitos/saldo |
| Auditoria | Datas, fonte e operador; filtro de tipo como proposta adicional | Ocorrências com detalhes próprios por tipo; parâmetro de transferências respeitado |
| Notas | Datas, fonte quando consulta existir, cliente por código | Nota/entrada/movimento/cliente conforme política/valor; total |

Filtros opcionais sem seleção significam Todos no escopo da casa, não em todas as casas. Dependências como tipo → categoria devem limpar seleção incompatível. Validar mesa inicial/final inclusive no banco. Listas de opções grandes usam busca paginada no servidor; não baixar todo o cadastro no navegador.

Tela e PDF mostram casa, datas, critério de data, filtros, fonte, horário da extração/geração e situação de cobertura. Estados diferentes: conjunto não suportado; histórico carregando; cobertura parcial; sem movimento confirmado; atualizado; atrasado; transição de fechamento; falha. Zero só quando for zero comprovado.

**Períodos grandes:** o limite atual de 90 dias pertence a Resultados, não prova um limite adequado para os novos relatórios. Proposta inicial: consultas detalhadas limitadas por período e tamanho, com paginação estável e resumo calculado sobre todo o filtro no banco. Intervalos anuais não podem ser prometidos só porque o SQL desktop os aceita. Validar volume e decidir consulta longa/relatório particionado ou geração assíncrona em fase própria; informar claramente um limite, nunca truncar silenciosamente ou somar só a página.

PDF de cada novo relatório deve incluir todas as linhas do filtro dentro do limite homologado. Acima do limite: explicar e solicitar recorte, ou usar mecanismo assíncrono previamente aprovado e testado. Não gerar um PDF aparentemente completo com as primeiras mil linhas do PostgREST. A aplicação não deve depender de um servidor Next.js permanente para tarefas longas na Vercel.

Uma consulta agregada não deve multiplicar valores ao juntar itens e pagamentos: agregar separadamente na granularidade correta e juntar os resultados. Um relatório/paginação/PDF usa uma versão coerente dos dados; atualizar entre páginas não pode duplicar, omitir ou trocar totais sem aviso.

## 7. Testes e evidências necessários antes de liberar

1. Concordância com SCC para o mesmo movimento, fonte e filtros; linhas, subtotais, totais, sinais e arredondamento. Preferir massa fictícia fornecida/confirmada pelo Pedro. Comparação de dados reais só em procedimento privado autorizado, sem commit ou logs com nomes/linhas.
2. Dois restaurantes com códigos iguais; dono de A não lê B em fatos, cadastros, filtros, totais, PDF e ingestão temporária. Sem login não lê; admin lê conforme política, sem alterar dados pelo painel do cliente.
3. Itens fracionários; cancelados; produto que não paga comissão; conta não paga; pagamento misto; homônimos; cadastros ausentes/inativos; custo zero versus ausente; custo/nome alterado depois da venda.
4. Crédito/débito/valor zero/estorno; categoria com mesmo código em tipos diferentes; operador correto; agrupamento civil na madrugada com movimento anterior.
5. Cada tipo de auditoria, inclusive sem produto e com transferência ligada/desligada; ocorrências idênticas com chaves distintas; ausência de dados pessoais descartados em persistência e logs.
6. Múltiplas notas/pagamentos/itens por conta sem multiplicação de valores; filtro de cliente da própria casa; nota emitida não tratada automaticamente como dívida em aberto.
7. Falta de datas, datas inválidas/duplicadas/invertidas, intervalos excessivos, códigos de outra casa, mesa invertida e URL direta/PDF sem filtro obrigatório.
8. Envio repetido, confirmação perdida, página faltante, páginas fora de ordem, checksum inválido, mesmo ID com conteúdo diferente, geração obsoleta, escopos concorrentes e expiração de lote. Nenhum parcial pode remover ou publicar fatos definitivos.
9. Fechamento, reabertura, migração temporário/permanente, chaves remapeadas, correção histórica fora da janela recente, queda durante carga inicial e continuidade do v1/Hoje.
10. Dia sem movimento confirmado versus conjunto ausente; dados de contas atuais com pagamentos atrasados; PDF de histórico parcial com aviso; total coerente entre páginas e versão do PDF.
11. Volume representativo, incluindo um único dia acima do limite de bytes, consulta paginada acima do limite padrão da API e PDF de várias páginas. Medir latência/memória/tamanho antes de definir metas e limites finais.
12. Celular de 390 px e computador, claro/escuro, textos longos fictícios, estados vazios/erro, filtros acessíveis, PWA e modo admin em leitura.

Depois das mudanças: tipos, `npm run check`, testes unitários e SQL/HTTP locais reais, build e inspeção de tela/PDF. O resultado de verificações anteriores ao desenvolvimento não homologa esta ampliação. O ambiente Supabase local esteve bloqueado por download na etapa anterior; isso é dependência de execução e não prova defeito de regra nos novos relatórios.

## 8. Condições para transformar a proposta em plano executável

**Com o usuário:** confirmar fonte on-line/histórica e a política delimitada de nomes/textos. A apresentação com identidade Food, a preservação dos relatórios atuais e as contagens agregadas por sexo/categoria, sem sexo individual, já foram confirmadas. A arquitetura e localização da nova área precisam de aprovação; não tratar recomendação deste documento como decisão já tomada.

**Com Pedro:** receber consultas/lógica faltantes (financeiro, comissão, operador do caixa, variantes on-line), DDL/chaves, significado de datas, ciclo temporário/permanente e escala decimal. Coletar volume e capacidades reais do emissor. Os [códigos T01–T11](../../integracao-scc/2026-10-28-perguntas-seis-relatorios.md) indicam o que cada resposta desbloqueia.

Depois dessas respostas: consolidar desenho aprovado, contrato v2 com exemplos fictícios e tipos exatos, e planos executáveis separados para integração, consultas e interface/PDF. Esses planos devem ter caminhos, assinaturas, exemplos de teste, comandos e critérios de conclusão suficientes para um modelo sem este histórico. Não começar a construir sobre chaves ou fórmulas presumidas.
