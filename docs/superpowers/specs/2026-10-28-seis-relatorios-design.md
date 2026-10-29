# Seis relatórios SCC — desenho para execução agora

**Estado:** pronto para orientar a execução local. O usuário determinou seguir com os materiais disponíveis e deixar refinamentos para depois. Esta versão substitui as travas de planejamento da análise preliminar e do roteiro anterior. Não autoriza publicação nem afirma que fórmulas ausentes foram descobertas.

**Objetivo:** entregar seis relatórios navegáveis e exportáveis, recebimento de dados, importador local, demonstração fictícia reproduzível e testes. Construir agora; conferir com o emissor real da SCC depois, sem bloquear toda a entrega pelas perguntas T01–T11.

## 1. Decisões fechadas para esta execução

1. Criar **Relatórios** como quarta entrada do menu, entre Resultados e Ajustes. No celular, quatro colunas; no computador, mesma lateral atual. Não alterar os quatro painéis nem o PDF de Resultados.
2. Criar seis relatórios próprios: `financeiro`, `produtos`, `comissao`, `caixa`, `auditoria`, `notas-assinadas`. Rotas `/r/[slug]/relatorios` e `/r/[slug]/relatorios/[relatorio]`, com PDF em `/pdf`.
3. Apresentação Food, com as informações/filtros demonstrados nos materiais. Datas obrigatórias no servidor/SQL; fonte `historico` ou `online` explícita. Nunca juntar as duas fontes automaticamente.
4. Receber **fotografias completas de cada relatório por data de movimento e fonte**, já normalizadas pela SCC. Cada fotografia é um conjunto de linhas com as dimensões necessárias aos filtros, não um PDF nem um total sem dimensões. Assim, o Food não depende das chaves internas de Consumo/Auditoria para começar: posições das linhas só identificam uma fotografia, sem fingir identidade permanente.
5. As consultas Food agregam e filtram essas linhas no Postgres. Comissão e componentes financeiros sem fórmula comprovada chegam como valores oficiais opcionais; `null` significa não informado. Não substituir `null` por zero nem derivar comissão da taxa.
6. A nova integração chama-se **receber-relatorios**, contrato próprio versão 1. Não modificar envelope, reconciliador, ritmo nem sinal de vida da integração existente de `entradas`.
7. Implementar ambos os modos no mesmo contrato. Na ausência de fotografia on-line/histórica, mostrar ausência de dados daquela fonte. Não duplicar histórico como se fosse on-line.
8. Contagens por sexo/categoria são aceitas **somente agregadas pela SCC por movimento**, sem identificação ou referência a entrada/pessoa.
9. Manter por ora clientes por código, pois o usuário pediu avaliar nomes e depois adiou refinamentos. Não coletar `Nomecliente`, RG, telefone, sexo individual, endereço, credor/devedor ou motivo/descrição livres nesta versão. Seus lugares no relatório mostram “Não enviado nesta versão”. Nomes profissionais de operadores e descrições de produtos/categorias são campos de finalidade explícita, sem cadastro pessoal completo. A futura inclusão de nome de cliente é pequena extensão deliberada, não pré-condição da execução.
10. Sem dependência nova. Next/React/TypeScript, Zod, Postgres, Vitest, React PDF e Decimal já existentes.

## 2. Resultado palpável exigido

- Catálogo com seis cartões, explicação curta e estado dos dados.
- Cada relatório abre no celular/computador, filtra, pagina, apresenta totais completos e exporta PDF multipágina na marca Food.
- Um comando local gera/importa massa fictícia dos seis relatórios para uma casa de teste existente, sem depender dos anexos reais ou do Pedro.
- Um comando importa arquivo JSON no contrato documentado; o endpoint recebe páginas pelo token de envio já existente.
- Dados fictícios são marcados visivelmente em tela e PDF. Não existe fallback automático para dados fictícios quando o banco real está vazio.
- Nenhum relatório mostra zero para período não recebido; dias ausentes são identificados na cobertura.
- A suíte testa recepção completa, conflito/retry, RLS e contas dos relatórios. Integração só é declarada validada se os testes SQL/HTTP realmente executarem.

## 3. Escopo realista de cada relatório

| Relatório | Entrega agora | O que continua dependente de envio real, sem bloquear a construção |
|---|---|---|
| Produtos | Quantidade/vendas/custo por PDV, grupo e produto; filtros de garçom e mesa; total e diferença vendas−custos | SCC exportar agrupamento com dimensões adicionais; custo segue valor informado, sem inventar custo histórico |
| Comissão | Operador/função, vendas elegíveis e comissão oficial; total de cada coluna com completude independente | Fórmula/coluna de comissão: se ausente, vendas continuam disponíveis e comissão mostra não informado |
| Caixa | Crédito/débito/categoria/data/valor; operador quando enviado; saldo dos lançamentos | Operador ausente fica em grupo “Não informado pela SCC”; filtro é desabilitado se a fonte não oferece a dimensão |
| Auditoria | Tipos conhecidos, operador, cartões, produto, limites, quantidade e valores; transferência parametrizada | Eventos/parametrização reais; texto pessoal livre não é importado |
| Notas | Nota, entrada, movimento, código de cliente e valor; filtro por código | Nome e ciclo de baixa são refinamentos; relatório inicial significa notas informadas para o movimento, não dívida atual |
| Financeiro | Blocos de componentes, meios, cartões, contagens e totais oficiais, com campos ausentes explicitados | SCC fornecer os componentes e totais oficiais; não reconstruir a fórmula ausente pelos PDFs |

## 4. Recepção e persistência

Contrato completo em [contrato-relatorios-v1.md](../../integracao-scc/contrato-relatorios-v1.md). Uma carga corresponde a **casa do token + relatório + dia de movimento SCC + fonte + sequência**. A sequência é inteiro crescente do emissor por escopo; o UUID de carga permite retry. Página repetida idêntica é aceita; mesmo número com conteúdo diferente recebe conflito. Um único dia pode ter várias páginas.

Cinco tabelas, separando preparação privada de informação publicada:

- `relatorio_cargas`: manifesto, estado e metadados; acesso somente técnico.
- `relatorio_paginas`: páginas validadas e hash calculado no banco; acesso somente técnico.
- `relatorio_versoes`: contador por casa usado para detectar alteração entre páginas/tela/PDF; leitura da própria casa.
- `relatorio_publicacoes`: uma linha por casa/relatório/dia/fonte, inclusive para movimento vazio, com captura, natureza, recursos e sequência; leitura da própria casa. Permite distinguir zero confirmado de dia não recebido.
- `relatorio_linhas`: última fotografia publicada por escopo, com dados normalizados e posição; leitura por RLS, escrita técnica.

Publicação em uma transação: travar a casa → confirmar quantidade de páginas/linhas/bytes e identidade do manifesto → rejeitar sequência obsoleta → substituir **somente o cache derivado daquele escopo** → incrementar versão → marcar publicada. Não tocar em `entradas`, dados SCC originais, outros relatórios, dias ou fontes. Fotografias parciais nunca substituem a atual. Fotografia vazia explícita confirma movimento zero.

Substituição do cache novo é uma operação técnica reversível por reimportação; documentá-la na migration. Nenhuma exclusão de dado de produção será executada durante o planejamento. Na implementação, aplicação em produção continua exigindo autorização específica.

Após publicar, retirar o conteúdo das páginas da carga e manter hash/metadados por sete dias para retries. Cargas incompletas expiram após 24 h; limpeza só das novas tabelas técnicas. Implementar limpeza como função SQL explícita, testada, e cron local/padrão do projeto se já disponível; não criar serviço Next permanente. O cache ativo permanece até substituição explícita.

## 5. Consulta e consistência

RPCs de consulta, `security invoker`, com grants intencionais:

```text
metrica_relatorio(p_restaurante_id uuid, p_relatorio text,
  p_filtros jsonb, p_pagina integer default 1,
  p_tamanho integer default 50, p_revisao text default null) returns jsonb
opcoes_relatorio(p_restaurante_id uuid, p_relatorio text,
  p_filtros jsonb, p_dimensao text, p_busca text default '',
  p_pagina integer default 1) returns jsonb
```

`metrica_relatorio` valida relatório/datas/filtros e chama um dos seis agregadores SQL internos com nomes fechados, sem montar SQL de nome recebido. Verificação explícita `tem_acesso`/admin além de RLS; desconhecido ou sem acesso não revela existência da casa. Agregadores e seletor permanecem invoker; não usar chave de serviço na tela. Agregadores ficam no schema `relatorios_privados`, não exposto na API; conceder `USAGE`/`EXECUTE` a `authenticated` explicitamente para permitir a chamada pelo invoker e aplicar a mesma validação/RLS em cada helper. Não confundir schema fora da API com dispensa de autorização.

Cada chamada lê linhas/versão dentro da mesma fotografia transacional do Postgres. A versão solicitada pelo cliente precisa coincidir; caso contrário devolver `dados_alterados`, e o leitor reinicia a página ou orienta atualizar. PDF fixa a versão da primeira página e aborta se ela mudar. Não prometer retenção de versões imutáveis: aqui a garantia é detectar mudança e recusar documento misturado.

Agregação primeiro; paginação depois. Quantidade, vendas, comissão, créditos/débitos e total de notas são calculados sobre **todo o filtro**. Ausência em qualquer dia selecionado aparece como cobertura parcial, e o total é rotulado como parcial. Recursos/filtros só são habilitados quando todos os dias recebidos do escopo relevante os suportam; filtro solicitado sem recurso retorna `filtro_indisponivel`, nunca um zero enganoso.

## 6. Limites iniciais definidos

- Período de consulta: 1 a **366 dias inclusivos**. Todo histórico pode ser armazenado; consultas maiores são divididas em intervalos explícitos.
- Tela: 50 linhas, máximo 100; opções: 25 por página, busca até 80 caracteres.
- PDF: até **2.000 linhas agregadas**, carregadas em páginas de 100 com versão fixa. Buscar uma linha adicional para detectar excesso; se exceder, responder 422 com orientação de recorte. Nunca gerar só as primeiras linhas.
- Recepção: 1 MiB por página, até 500 linhas, 200 páginas, 100.000 linhas e 32 MiB por carga; dez cargas incompletas por casa. Limites são constantes server-side testadas, não parâmetros livres do navegador.
- Uma página de importação local com mais de 500 registros é fragmentada pelo importador; um registro individual maior que o limite é recusado.
- Decimais de transporte: texto exato com até seis casas e até 14 dígitos inteiros, preservado em `numeric(20,6)` ao calcular. Rejeitar excesso, sem arredondar ingestão. Dinheiro exibido com duas casas, quantidade com até seis (mínimo três). O contrato não afirma que essa escala veio do DDL SCC; é a capacidade escolhida para o Food, adaptável no exportador.
- O servidor recebe corpo com leitura limitada por bytes; não usar `req.text()` sem limite e só verificar depois.

## 7. Interface fechada

Datas e fonte vão na URL. Ao abrir uma página sem filtros, preencher ontem no fuso da casa e redirecionar para URL explícita; “Hoje”, “7 dias” e “Mês” preenchem datas. Esta é conveniência de interface; SQL/rota de PDF sempre recusam filtro incompleto/inválido. O rótulo informa “Data do movimento SCC”.

Fonte histórica é o padrão. On-line exige uma única data, qualquer data de movimento explicitamente escolhida; sem fotografia nessa data, mostrar “Movimento on-line não recebido”. Sem tentar adivinhar o fechamento pela hora do host. Nunca dar ao on-line dados históricos como fallback.

Filtros adicionais: Produtos (`pdv`, `grupo`, `garcom`, `mesaDe`, `mesaAte`); Comissão (`operador`); Caixa (`operador`, `tipo`, `categoria`); Auditoria (`operador`, `tipo`); Notas (`cliente`); Financeiro (nenhum adicional inicial). Seleções usam códigos, Todos é ausência; códigos de outras casas não são resolvidos. Tipo de crédito/débito faz parte da identidade da categoria.

Telas têm um resumo de totais, filtros, aviso de cobertura/atualização e tabela/cards com conteúdo equivalente. Caixa agrupa operador/data civil; auditoria por tipo com totais pertinentes (sem somar todos os eventos como prejuízo); produtos por PDV/grupo. PDF usa os mesmos resultados do leitor e explicita os mesmos campos ausentes.

## 8. Demonstração e critérios de conclusão

Criar `scripts/gerar-relatorios-ficticios.ts` que escreve arquivos locais e opcionalmente importa em Supabase local. Criar `scripts/importar-relatorios.ts` com `--arquivo` e `--dry-run`; envio real apenas para loopback nesta entrega. Token vem de arquivo/env ignorado, sem impressão. Não adicionar botão de carga ou dado fictício no painel do cliente.

Massa fictícia: dois dias, duas casas com códigos iguais, os seis relatórios; movimento completo, dia vazio explícito, falta de comissão, custo ausente, operador ausente, madrugada, pagamentos/financeiro oficial, todos os tipos de auditoria e público agregado. Nomes inventados sem relação com PDFs. Incluir exemplos com/sem dimensão disponível.

**Pronto para desenvolvimento local:** importação e consultas SQL reais, seis telas, seis PDFs e testes executados, preservando v1. **Pronto para cliente real:** depende adicionalmente de exportação SCC e homologação; não confundir os dois estados. Perguntas T01–T11 alimentam essa homologação e refinamentos, não a primeira tarefa do executor.

## 9. Planos de execução em ordem

1. [Integração, banco e importador](../plans/2026-10-28-seis-relatorios-01-integracao.md).
2. [Consultas e regras dos seis relatórios](../plans/2026-10-28-seis-relatorios-02-consultas.md).
3. [Telas, PDFs e verificação integrada](../plans/2026-10-28-seis-relatorios-03-interface.md).

Executar as três entregas no checkout atual, sem interromper para perguntar preferências já decididas aqui. Se faltar infraestrutura, concluir tarefas independentes e reportar apenas a dependência concreta; não substituir teste SQL por mock para declarar conclusão.
