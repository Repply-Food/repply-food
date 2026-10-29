# Seis relatórios — plano 2: consultas e regras

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para executar tarefa por tarefa. Steps use checkbox (`- [ ]`) syntax for tracking. Executar após o plano 1; não esperar respostas da SCC para trabalhar com o contrato normalizado.

**Goal:** consultar e conferir os seis relatórios no Postgres, com filtros, totais completos, cobertura e resultados tipados para tela/PDF.

**Architecture:** funções SQL estáveis/invoker sobre o cache por dia/fonte; helpers em schema não exposto na API; leitor Node usa cliente de sessão e valida o JSON retornado. Valores oficiais ausentes continuam ausentes.

**Tech Stack:** PostgreSQL 17, TypeScript, Zod, Vitest, `pg` e clientes Supabase existentes.

**Spec:** [desenho](../specs/2026-10-28-seis-relatorios-design.md), [contrato](../../integracao-scc/contrato-relatorios-v1.md). **Pré-requisito:** [plano 1](2026-10-28-seis-relatorios-01-integracao.md).

## Global Constraints

- Não modificar envelope, reconciliador, ritmo nem sinal de vida da integração existente de `entradas`.
- Sem dependência nova.
- Dados fictícios são marcados visivelmente em tela e PDF.
- Dinheiro/quantidade são textos decimais exatos; cálculos no Postgres.
- Datas sempre pelo movimento SCC do manifesto, fonte explícita; sem fallback entre histórico/on-line.
- UI e PDF compartilham o leitor; cliente de sessão, nunca service_role para leitura.
- Não transformar campo desconhecido ou dia não recebido em zero.

## Tarefa 1 — filtros e tipos públicos definitivos

**Files:** criar `lib/relatorios/{registro,filtros,tipos,schemas-saida}.ts`; `tests/relatorios/{filtros,schemas-saida}.test.ts`. Consumir schemas canônicos/reexportados do plano 1 para enums/linhas.

**Produz interfaces:**

```ts
type FiltrosRelatorio = {
  inicio:string; fim:string; fonte:'historico'|'online';
  pdv?:string; grupo?:string; garcom?:string;
  mesaDe?:number; mesaAte?:number;
  operador?:string; tipo?:string; categoria?:string; cliente?:string;
};
type ConsultaRelatorio = { filtros:FiltrosRelatorio; pagina:number; revisao?:string };
type Cobertura = { esperados:number; recebidos:number; ausentes:string[];
  capturadoEm:string|null; simulacao:boolean; recursos:string[] };
type ResultadoRelatorio<L,R> = {
  situacao:'sem_dados'|'parcial'|'completo'; revisao:string;
  cobertura:Cobertura; linhas:L[]; resumo:R;
  paginacao:{pagina:number; tamanho:number; totalLinhas:number};
};
```

Tipos de linha/resumo concretos por relatório:

| Tipo | Linha de saída | Resumo |
|---|---|---|
| Produtos | `codigoProduto, produto, codigoPdv, pdv, codigoGrupo, grupo, quantidade, vendas, custos, diferenca` | `quantidade,vendas,custos,diferenca` |
| Comissão | `codigoOperador,operador,funcao,vendasElegiveis,comissaoOficial` | `vendasElegiveis,comissaoOficial,operadoresSemComissao` |
| Caixa | `codigoLancamento,diaMovimento,momento,codigoOperador,operador,tipo,codigoCategoria,categoria,valor` | `creditos,debitos,saldo` (débitos como magnitude positiva; UI sinaliza saída) |
| Auditoria | campos do contrato em camelCase + `diaMovimento` | `ocorrencias,porTipo` (`tipo,ocorrencias,quantidade,total`); soma financeira apenas para cancelamento, demais `total:null` |
| Notas | `codigoNota,codigoEntrada,diaMovimento,codigoCliente,valor` | `notas,valor` |
| Financeiro | linha do contrato em camelCase + `diaMovimento` | mesmos componentes/totais/entradas, `meios` agregados por código+classe, `publico` por sexo+categoria |

Todos os decimais de saída são `string`; custos/diferença/comissão/componentes podem ser null. Códigos/rótulos anuláveis mantêm nulidade. Contagens inteiras dos resumos devem ser seguras: enviar contagens do SQL como texto quando exceder `Number.MAX_SAFE_INTEGER`; para esta entrega limitar contagens aceitas em cada carga a 32 bits e validar soma na saída, falhando em excesso em vez de perder precisão. `resumoSchema` deve ser união discriminada por tipo de relatório no leitor; não usar `any`.

- [ ] Teste vermelho de datas incompletas, validação em fonte on-line e filtros indevidos:

```ts
expect(() => parseConsulta('produtos',new URLSearchParams('fim=2026-02-14'))).toThrow();
expect(() => parseConsulta('notas-assinadas',new URLSearchParams(
  'inicio=2026-02-14&fim=2026-02-15&fonte=online'))).toThrow();
expect(() => parseConsulta('financeiro',new URLSearchParams(
  'inicio=2026-02-14&fim=2026-02-14&fonte=historico&garcom=O1'))).toThrow();
```

- [ ] Implementar `parseConsulta(relatorio:Relatorio,entrada:URLSearchParams):ConsultaRelatorio` e `serializarConsulta(c:ConsultaRelatorio):string`. Rejeitar valores repetidos/desconhecidos, datas inexistentes, >366 dias inclusivos, fonte ausente/inválida, intervalo online >1 dia, mesa invertida, pagina <=0 e código fora do padrão do contrato. `tipo` só enum pertinente; categoria de caixa no formato `credito:COD`/`debito:COD`, compatível com tipo se selecionado. Data/UI default não entra nesta função.
- [ ] `registro.ts` contém lista fechada com slugs, títulos, descrição curta e filtros permitidos; não importar componentes nesse arquivo puro. `schemas-saida.ts` define cada linha/resumo da tabela com Zod e preserva texto decimal, sem recalcular valores.
- [ ] Rodar `npm run test -- tests/relatorios/filtros.test.ts tests/relatorios/schemas-saida.test.ts`, tipos e commit `Define filtros e resultados tipados dos relatórios`.

## Tarefa 2 — cobertura, autorização e opções de filtros

**Files:** migrations novas `*_relatorios_consulta_base.sql`; testes `tests/relatorios/cobertura-sql.test.ts`, `opcoes-sql.test.ts`. Criar schema `relatorios_privados` fora de `api.schemas`, sem alterar lista de schemas públicos da API.

**Produz:**

```text
relatorios_privados.validar_consulta(p_casa uuid,p_relatorio text,p_filtros jsonb,
  p_pagina int,p_tamanho int) returns void
relatorios_privados.cobertura(p_casa uuid,p_relatorio text,p_filtros jsonb) returns jsonb
public.opcoes_relatorio(p_restaurante_id uuid,p_relatorio text,p_filtros jsonb,
  p_dimensao text,p_busca text default '',p_pagina int default 1) returns jsonb
```

Todas STABLE, SECURITY INVOKER, search_path fixo. Revogar EXECUTE padrão e conceder `authenticated` deliberadamente, incluindo USAGE no schema privado; helpers validam autorização e limites mesmo se chamados diretamente por SQL. Testar/revisar grants públicos e privados; anônimo nenhum. `tem_acesso`/admin + RLS nas tabelas; ausência de permissão gera código curto, sem retornar cobertura da outra casa.

- [ ] Testes: dia recebido vazio conta como recebido; dia ausente não conta como zero; intervalo de dois dias com um recebido = parcial; todos ausentes = sem_dados; fonte oposta não satisfaz cobertura; recursos = interseção entre dias publicados; atualização é o menor `capturado_em` entre os dias recebidos, não o maior; qualquer simulação marca relatório inteiro.
- [ ] Implementar cobertura com `generate_series(inicio,fim,'1 day')` LEFT JOIN em publicações filtradas pela casa/relatório/fonte, retornando `ausentes` ordenados. Fazer aritmética de datas no SQL, não no fuso do host.
- [ ] Opções só retornam dimensões permitidas e disponíveis, 25 por página, `mais:boolean`, com códigos/rótulos distintos da casa/filtro/fonte. Busca literal com `position(lower(p_busca) in lower(rotulo)) > 0`, sem SQL dinâmico ou LIKE arbitrário. Categoria usa tipo+código. Cliente retorna rótulo `Cliente <código>`, sem nome. Campos de data e recurso também são validados antes de opções; termo max80.
- [ ] Acrescentar teste A/B com mesmos códigos e teste de dimensão não suportada, que devolve `filtro_indisponivel` em vez de lista vazia simulando filtro válido. Rodar testes focados reais, atualizar grants e commit `Consulta cobertura e opções isoladas por restaurante`.

## Tarefa 3 — Produtos e Notas, com totais antes de paginar

**Files:** migration `*_relatorios_produtos_notas.sql`; testes `tests/relatorios/produtos-sql.test.ts`, `notas-sql.test.ts`.

**Interfaces:** `relatorios_privados.produtos(p_casa uuid,p_filtros jsonb,p_pagina int,p_tamanho int) returns jsonb` e `relatorios_privados.notas_assinadas(...) returns jsonb`. Retornam `{linhas,resumo,paginacao}`, sem duplicar cobertura/versão que o dispatcher anexará. Cada helper chama `validar_consulta`, usa RLS e tem grants privados explícitos.

- [ ] Produtos: teste com amostra `16.25` custo `4.00`, linha extra `5.00` custo null. Página tamanho1 tem uma linha, total `21.25`, custo/diferença total null, não `4.00`. Filtro de grupo só G1 retorna o grupo escolhido; filtro de garçom usa dimensão da linha e não código da conta.
- [ ] Produtos: filtrar raw rows da casa/período/fonte e dimensões primeiro. Agregar por códigos produto+PDV+grupo; não agrupar por nome de garçom/mesa, que são filtros e já foram aplicados. Rótulos de um mesmo código usam maior texto lexical para uma escolha determinística nesta versão; conservar código como identidade. Ordenação PDV, grupo, produto, código com desempate de códigos e `NULLS LAST`. Resumo é soma da CTE agregada completa; só então aplicar OFFSET/LIMIT. Cálculo de nulidade:

```sql
case when count(*) filter (where dados->>'custos' is null) > 0 then null
     else round(sum((dados->>'custos')::numeric(20,6)),2)::text end
```

Quantidades são `sum(...numeric(20,6))::text`; vendas `round(sum(...),2)::text`; diferença só quando custos completos. A origem já aplicou cancelados/fórmula; Food não subtrai desconto outra vez.
- [ ] Notas: teste duas notas da mesma entrada `12.25` e `7.75` → `20.00` e duas linhas, mesmo que a fotografia também exista em outro dia/fonte. Sem JOIN com produtos/pagamentos. Ordenar códigoCliente, diaMovimento, codigoEntrada, codigoNota e posição como último desempate, mantendo duas ocorrências idênticas legítimas do conjunto recebido. Filtro cliente por código exato.
- [ ] Testar custo zero completo vs null, quantidade fracionária, rótulos repetidos com códigos diferentes, filtro/SQL injection literal, paginação e período de 366 dias. Teste interno de funções invoker sem permissão não revela linhas. Rodar e commit `Calcula produtos e notas a partir das fotografias`.

## Tarefa 4 — Caixa e Auditoria

**Files:** migration `*_relatorios_caixa_auditoria.sql`; testes `tests/relatorios/caixa-sql.test.ts`, `auditoria-sql.test.ts`.

**Interfaces:** `relatorios_privados.caixa(...)` e `relatorios_privados.auditoria(...)` com os mesmos quatro argumentos e retorno da tarefa 3.

- [ ] Caixa: teste crédito `50.00` e débito `12.50` → créditos `50.00`, débitos `12.50`, saldo `37.50`; categoria código `1` nos dois tipos não se confunde. Movimento fictício de 14/02 contém evento civil 15/02 na madrugada, que continua no filtro de movimento de 14/02.
- [ ] Caixa: preservar cada lançamento; agrupar visualmente operador/data civil no frontend usando o dia civil explicitamente retornado no fuso da casa. SQL retorna `diaCivil` adicional na linha; acrescentar ao tipo/schema da tarefa 1. Calcular com `momento at time zone restaurantes.fuso`, não com string slice de timestamp UTC. Ordenar operador (código null no fim), dia civil, momento, código, posição. Saldo no SQL `sum(case tipo when 'credito' then valor else -valor end)`; resumo sobre todo filtro. Operador não enviado não é inferido do emissor, credor ou usuário logado.
- [ ] Auditoria: testar cinco tipos e duas ocorrências idênticas que continuam distintas. Sem deduplicar por timestamp. Ordenar tipo, momento, códigoOperador, posição/dia. Quantidade/valores nulos mantidos. Resumo apresenta contagens por tipo e soma quantidade/total apenas de cancelamento_produto; outros tipos `quantidade:null,total:null`, sem chamar soma de prejuízo. Parâmetro de transferência já aplicado no produtor; não reconstruir evento omitido.
- [ ] As duas consultas aplicam filtros por igualdade de código/tipo e validam recurso do conjunto. Testar paginação preservando totais, usuário B, campos pessoais ausentes e datas inválidas. Rodar e commit `Calcula caixa e auditoria sem misturar movimentos`.

## Tarefa 5 — Comissão e Financeiro com valores oficiais parciais

**Files:** migration `*_relatorios_comissao_financeiro.sql`; testes `tests/relatorios/comissao-sql.test.ts`, `financeiro-sql.test.ts`.

**Interfaces:** `relatorios_privados.comissao(...)`, `relatorios_privados.financeiro(...)`, mesmos argumentos/retorno das outras consultas.

- [ ] Comissão: fixture A `80.00/6.40`, B `20.00/null`. Resultado vendas `100.00`, comissão null e `operadoresSemComissao=1`; filtro A devolve comissão `6.40`. Não usar divisão ou taxa de serviço. Agregar códigoOperador entre dias, nome/função determinísticos, manter operadores zerados. Null em qualquer contribuição torna o total de comissão daquele operador e global null, com contagem de operadores afetados. Paginação não reduz totais.
- [ ] Financeiro: um registro por dia; agregar separadamente cada componente, total oficial e contador, com `null` contagioso somente na coluna afetada. Campos ausentes não anulam todo o relatório nem viram zero. `meios` agrega por código+classe, rótulo determinístico; `publico` agrega sexo+categoria. Retornar resumo completo e linhas diárias para detalhe; não multiplicar por CROSS JOIN entre meios e público. Usar subconsultas/CTEs independentes. Snapshot de movimento vazio confirmado contribui zero a somas, enquanto dia não recebido só entra na cobertura parcial.
- [ ] Teste financeiro fictício de um dia: consumo `100.00`, serviço `8.00`, complemento null, projetado oficial `108.00`, recebido oficial `93.00`, notas `10.00`, descontos `5.00`; soma das células de público `3+2=5`. Não exigir que consumo/recebido coincidam nem deduzir fórmula por esses números. Segundo dia com componente desconhecido torna apenas essa coluna null. Simulação marcada pelo dispatcher.
- [ ] Rodar testes, inspecionar saída JSON sem nomes reais e commit `Apresenta valores oficiais de comissão e financeiro`.

## Tarefa 6 — dispatcher público e leitor único de sessão

**Files:** migration `*_relatorios_dispatcher.sql`; `lib/relatorios/{leitura,opcoes}.ts`; testes `tests/relatorios/dispatcher-sql.test.ts`, `leitura.test.ts`.

**Interfaces públicas SQL:** as duas RPCs do desenho, com p_tamanho 1..100. O dispatcher chama helper com CASE fechado, cobertura e versão no mesmo comando STABLE. Se `p_revisao` não nulo divergir da versão, lançar `dados_alterados` antes de retornar linhas. Casa sem versão válida usa revisão `'0'`, mas ainda valida acesso. Revisão do SQL retorna como texto.

**Interfaces TypeScript:**

```ts
obterRelatorio<R extends Relatorio>(casaId:string,relatorio:R,
  consulta:ConsultaRelatorio, tamanho?:number):Promise<ResultadoDoRelatorio<R>>
obterOpcoes(casaId:string,relatorio:Relatorio,filtros:FiltrosRelatorio,
  dimensao:string,busca:string,pagina:number):Promise<OpcoesRelatorio>
```

Ambos `server-only`, `createClient` de sessão, validação de filtros/resultado com schemas fechados e `logError` apenas com código. Tipo `ResultadoDoRelatorio<R>` é mapa discriminado das seis linhas/resumos da tarefa 1, não `Record<string,any>`.

- [ ] Testar leitor com mock só para contrato e erros: passa casaId do guarda e filtros; nunca chama serviceClient, não soma valores; resultado inválido falha em vez de estado vazio; `dados_alterados` e `filtro_indisponivel` são erros reconhecíveis para a UI, outros são falha genérica. Complementar com dispatcher SQL real.
- [ ] Testar revisão: consultar página1, publicar novo snapshot, pedir página2 com revisão antiga → erro, sem misturar linhas. Fonte oposta não duplica totais; nova publicação em outra casa não muda versão de A. Permissão do dispatcher/helpers corresponde aos grants intencionais.
- [ ] Criar teste de matriz dos seis slugs; cada um retorna formato esperado com a amostra do plano1. Tipos, testes SQL/leitor, commit `Unifica leitura autorizada e consistente dos relatórios`.
- [ ] Seguir automaticamente para o [plano 3](2026-10-28-seis-relatorios-03-interface.md).
