# Contrato de relatórios SCC → Food, versão 1

**Contrato definido para implementação agora.** É um endpoint novo; não substitui a versão 1 do recebimento de entradas. Dados/exemplos são fictícios. A SCC adaptará a extração ao contrato; não é necessário copiar as chaves físicas das tabelas para o Food.

## 1. Transporte e operações

`POST /functions/v1/receber-relatorios`, `Authorization: Bearer <token da casa>`, JSON UTF-8, TLS verificado. O restaurante vem do token já existente. A função usa os mesmos critérios de token válido da recepção atual, sem atualizar o sinal de vida das contas.

```ts
type Relatorio = 'financeiro'|'produtos'|'comissao'|'caixa'|'auditoria'|'notas-assinadas';
type Fonte = 'historico'|'online';
type Recurso = 'pdv'|'grupo'|'garcom'|'mesa'|'operador'|'tipo'|'categoria'|'cliente';
type Decimal = string; // ^-?\d{1,14}(\.\d{1,6})?$; numeric(20,6), sem expoente
type Codigo = string;  // 1..80, letras/dígitos/_/./-; preservar zeros à esquerda
type Manifesto = {
  versao_formato: 1;
  carga_id: string; // UUID; mesmo UUID em retries
  relatorio: Relatorio;
  dia_movimento: string; // AAAA-MM-DD real; não derivado da data civil do evento
  fonte: Fonte;
  sequencia: string; // inteiro 1..9223372036854775807, crescente por escopo
  capturado_em: string; // ISO8601, ano 0001..9999, offset entre -15:59 e +15:59 ou Z
  natureza: 'scc'|'simulacao';
  recursos: Recurso[];
  total_paginas: number; // 1..200
  total_linhas: number; // 0..100000
};
type Pedido =
  | {acao:'pagina'; manifesto:Manifesto; numero:number; linhas:unknown[]}
  | {acao:'publicar'; carga_id:string};
```

`linhas` é validado pela união discriminada por `manifesto.relatorio`; não armazenar `unknown` sem schema. `Manifesto` é idêntico em todas as páginas. Uma carga representa exatamente um dia/fonte/relatório. `sequencia` é mantida pelo emissor para cada escopo; gerações antigas não sobrescrevem novas. Não usar nome do cliente ou ID de restaurante no manifesto.

Publicação vazia: `total_paginas=1`, `total_linhas=0`, página 1 com `[]` e depois publicar. Ausência de envio nunca significa zero. Todas as linhas precisam pertencer ao dia do manifesto, mesmo que o evento civil seja na madrugada seguinte.

`capturado_em` precisa ser representável como `timestamptz`: ano entre 0001 e 9999 e offset entre -15:59 e +15:59. O manifesto preserva o texto original para conferir retries. `momento` das linhas de Caixa e Auditoria também precisa ficar nesse intervalo do PostgreSQL; o texto ISO8601 original continua no JSON e só é convertido durante a consulta. A validação rejeita ano 0000 e offsets fora de -15:59..+15:59 antes de qualquer cast. Caixa retorna ainda `diaCivil`, calculado no fuso da casa a partir do instante real; o filtro de data continua usando `dia_movimento` do manifesto.

## 2. Linhas normalizadas

Todos os schemas são `.strict()`: campo inesperado recebe 422 com nomes de campos, sem valor ou corpo bruto no log. Campos opcionais abaixo devem vir como `null`, salvo indicado. Códigos são identificadores do relatório/dimensão, não exigência de conhecer PK de Consumo/Auditoria. O número ordinal distingue ocorrências repetidas legítimas dentro da fotografia.

### Produtos

```ts
type LinhaProdutos = {
  codigo_produto: Codigo; produto: string; // rótulos 1..120
  codigo_pdv: Codigo|null; pdv: string|null;
  codigo_grupo: Codigo|null; grupo: string|null;
  codigo_garcom: Codigo|null; garcom: string|null;
  mesa: number|null; // inteiro >=0, <=2147483647
  quantidade: Decimal; vendas: Decimal; custos: Decimal|null;
};
```

A SCC agrega por produto+PDV+grupo+garçom+mesa dentro do dia, excluindo cancelados. `vendas=sum((unitario+acrescimo-desconto)*quantidade)`; `custos=sum(Produtos.PrecoCusto*quantidade)` quando disponível. Não acrescentar condição de conta paga, ausente no SQL enviado. Se a extração usar somente o agrupamento original, declarar recursos ausentes; não afirmar suporte a filtros cujas dimensões foram perdidas. Para oferecer todos os filtros, acrescentar à seleção e ao agrupamento os códigos de PDV/grupo/garçom e `Entrada[Final].codCartaoMesa`. Não multiplicar totais por join de pagamentos.

### Comissão

```ts
type LinhaComissao = {
  codigo_operador: Codigo; operador: string|null; funcao: string|null;
  vendas_elegiveis: Decimal; comissao_oficial: Decimal|null;
};
```

Uma linha por operador/dia. A consulta recebida fornece as vendas: item não cancelado, conta paga, produto comissionável e nenhuma forma de pagamento não comissionável na conta. A comissão vem da regra oficial se existir no emissor; caso contrário `null`. Lista completa de operadores pode acrescentar vendas zero; não fabricar funcionários inexistentes. Os níveis de função não conhecidos são rótulo informado ou “Não informada”, sem inventar equivalência com perfil do Food.

### Caixa

```ts
type LinhaCaixa = {
  codigo_lancamento: Codigo;
  momento: string; // ISO8601, ano 0001..9999 e offset -15:59..+15:59 ou Z
  codigo_operador: Codigo|null; operador: string|null;
  tipo: 'credito'|'debito'; codigo_categoria: Codigo; categoria: string;
  valor: Decimal; // >=0; direção está em tipo
};
```

A SCC normaliza direção e magnitude; valor negativo sem regra de estorno explícita não é aceito silenciosamente. Se o SQL recebido não oferecer operador, usar `null` e não declarar recurso `operador`. A chave da categoria no filtro é `credito:<codigo>` ou `debito:<codigo>`. Não transportar `CredorDevedor`/`Descricao` livres nesta versão. A linha representa lançamento, não pagamento de venda.

### Auditoria

```ts
type TipoAuditoria = 'cancelamento_produto'|'perda_cartao'|'alteracao_limites'
  | 'exclusao_taxa_servico'|'transferencia_produtos';
type LinhaAuditoria = {
  tipo: TipoAuditoria; momento: string; // Mesmo intervalo PostgreSQL de Caixa
  codigo_operador: Codigo|null; operador: string|null;
  cartao_anterior: Codigo|null; cartao_novo: Codigo|null;
  codigo_produto: Codigo|null; produto: string|null;
  quantidade: Decimal|null; valor_unitario: Decimal|null; total: Decimal|null;
  limite_minimo_anterior: Decimal|null; limite_minimo_novo: Decimal|null;
  limite_maximo_anterior: Decimal|null; limite_maximo_novo: Decimal|null;
};
```

Aplicar `ExibirTransferenciasAuditoria` antes de exportar. `total` segue o SQL oficial com `ISNULL`, não uma estimativa de prejuízo. Preservar eventos sem produto e duas ocorrências iguais em posições distintas. Não transportar nome de cliente nem motivo livre. Momento mantém o fuso; data de movimento é do manifesto, não a data civil.

### Notas assinadas

```ts
type LinhaNota = {
  codigo_nota: Codigo; codigo_entrada: Codigo; codigo_cliente: Codigo;
  valor: Decimal;
};
```

Cada nota uma vez na fotografia; notas da mesma entrada não são unificadas. Exportar resultado da relação nota→pagamento→entrada do SQL fornecido, sem join de itens. Nome de cliente não é aceito nesta versão. O filtro mostra “Cliente <código>”. Não adicionar situação de dívida ou vencimento inexistente nos materiais.

### Financeiro

```ts
type ValorOpcional = Decimal|null;
type LinhaFinanceiro = {
  componentes: {
    consumo: ValorOpcional; servico: ValorOpcional; complemento: ValorOpcional;
    taxas_entrada: ValorOpcional; produto_embutido: ValorOpcional; flyers: ValorOpcional;
  };
  totais_oficiais: {
    projetado: ValorOpcional; recebido: ValorOpcional;
    notas_assinadas: ValorOpcional; descontos: ValorOpcional;
  };
  entradas: {
    habilitados: number|null; reabilitados: number|null;
    encerrados: number|null; abertos: number|null;
  };
  meios: Array<{
    codigo: Codigo; rotulo: string;
    classe: 'dinheiro'|'credito'|'debito'|'pix'|'nota_assinada'|'desconto'|'outro';
    valor: Decimal;
  }>;
  publico: Array<{
    sexo: 'masculino'|'feminino'|'nao_informado';
    categoria: 'pagante'|'convidado'|'lista'|'camarote'|'vip'|'servico'|'outro';
    quantidade: number; // inteiro 0..2147483647; somente agregado por dia
  }>;
};
```

Zero ou uma linha por fotografia financeira: uma linha contém o resumo informado pela SCC; fotografia explicitamente vazia confirma ausência de movimento, sem fornecer componentes desconhecidos. Não aceitar categoria/sexo com identidade de pessoa ou entrada. Contagens de `entradas` são inteiros não negativos ou `null`. Limitar `meios` a 100 e `publico` a 21 células únicas. Fonte oficial de cada total é a SCC; o Food soma valores oficiais de dias recebidos, e apresenta subtotal dos meios por classe sem afirmar uma equação não documentada entre descontos, consumo e recebido.

## 3. Capacidades e privacidade

`recursos` anuncia filtros realmente preservados na fotografia; o servidor verifica que recurso pertence ao relatório e que as chaves necessárias existem no schema. Campo `null` pode representar registro sem atribuição; não significa capacidade ausente por si só. A SCC é responsável por anunciar a capacidade corretamente; a interface não inventa códigos por nome.

Rótulos têm limite 120; função 80. Recusar controles de texto, HTML não precisa ser interpretado e não vai em SQL dinâmico. JSON desconhecido ou que contenha campos pessoais não aceitos é recusado sem persistência do conteúdo. Não guardar payloads brutos de erro como faz outra integração; registrar apenas código/etapa/carga e nomes de campos seguros.

`natureza=simulacao` é permitido no endpoint somente se `RF_PERMITIR_SIMULACAO=1` no ambiente local de funções. Em produção essa variável permanece ausente. Gerador/importador recusam destino não loopback nesta entrega. Consultas/PDF sempre mostram a natureza; não esconder simulação.

## 4. Respostas e idempotência

```text
200 pagina: {ok:true, estado:'recebendo'|'publicada', carga_id, pagina, repetida:boolean}
200 publicar: {ok:true, estado:'publicada', carga_id, revisao:string}
400 JSON inválido
401 token inválido, sem revelar casa
409 manifesto divergente, página conflitante, sequência obsoleta ou dados alterados
413 limite de corpo/linha/páginas/bytes acumulados excedido
422 schema inválido ou publicação incompleta
429 mais de dez cargas incompletas / limite técnico documentado
500 falha interna sem SQL/valores nos logs
```

O hash da página é calculado no banco sobre `jsonb` normalizado e comparado em retries; não exigir que Delphi e JavaScript serializem JSON em ordem idêntica. Além do hash comparar igualdade `jsonb`; colisão não autoriza divergência. Publicar só após todas as páginas 1..N e total de linhas idêntico ao manifesto. Página não confirma cursor; só `estado=publicada` autoriza o emissor avançar a fotografia.

Publicar novamente a carga já publicada retorna a revisão original; carga já substituída retorna o recibo original sem reativá-la. Nova sequência menor/igual à ativa com outro ID recebe 409. O conteúdo de páginas publicadas pode ser descartado mantendo hashes/recibo. O retry da página após descarte compara hash e manifesto, nunca republica.

## 5. Exemplo fictício mínimo

```json
{
  "acao": "pagina",
  "manifesto": {
    "versao_formato": 1,
    "carga_id": "314d4909-5276-436d-b925-66d27ee3f509",
    "relatorio": "produtos",
    "dia_movimento": "2026-02-14",
    "fonte": "historico",
    "sequencia": "1",
    "capturado_em": "2026-02-15T08:00:00-03:00",
    "natureza": "simulacao",
    "recursos": ["pdv", "grupo", "garcom", "mesa"],
    "total_paginas": 1,
    "total_linhas": 1
  },
  "numero": 1,
  "linhas": [{
    "codigo_produto": "P1", "produto": "Produto fictício",
    "codigo_pdv": "D1", "pdv": "PDV fictício",
    "codigo_grupo": "G1", "grupo": "Grupo fictício",
    "codigo_garcom": "O1", "garcom": "Operador fictício",
    "mesa": 7, "quantidade": "1.250", "vendas": "16.25", "custos": "4.00"
  }]
}
```

Enviar depois `{"acao":"publicar","carga_id":"314d4909-5276-436d-b925-66d27ee3f509"}`. O importador local aceita uma lista de fotografias não paginadas, monta este manifesto, divide em partes e publica cada escopo. Retomar usando os mesmos IDs; nova alteração de fotografia usa nova sequência/ID.

## 6. Adaptação dos SQLs recebidos

Produtos e Comissão podem alimentar as linhas agregadas acrescentando códigos/dimensões à seleção e ao `GROUP BY`. Caixa/Auditoria/Notas exportam linhas da consulta, acrescentando códigos de operador quando disponíveis. `DataMovimento`/`DataMovimentacao` do SCC determinam o manifesto; se a consulta não retorna a coluna, executar com datas iguais e usar esse dia do filtro. Para a variante on-line, o produtor declara explicitamente o dia do movimento; não derivá-lo do horário da importação.

Financeiro e comissão oficial: preencher apenas valores que o exportador realmente obtiver. Sua ausência não bloqueia os outros blocos ou o recebimento. Filtros perdidos por agregação não são reconstruídos por estimativa. Nenhum script do Food executa os SQLs anexos no cliente nesta entrega; a documentação é o contrato para o emissor do parceiro.
