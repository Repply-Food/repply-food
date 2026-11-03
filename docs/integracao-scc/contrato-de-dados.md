# Contrato de dados SCC → repply food — v2

Contrato aprovado (D-71), ainda sujeito à homologação com a SCC. Este repositório descreve a implementação local; não implica publicação em produção. O envio é somente SCC → Food.

## Transporte e autenticação

`POST /functions/v1/receber-envio`, com `Authorization: Bearer <token-da-casa>` e `Content-Type: application/json; charset=utf-8`. Use HTTPS com validação TLS fora do ambiente local. O token identifica exclusivamente a casa: nunca envie identificador de restaurante no corpo, nem registre token ou corpo em logs. Não inclua tokens em argumentos de linha de comando ou arquivos versionados. A versão anterior sem `tipo_envio` não é aceita no v2.

## Envelope e escopos

Cada requisição tem um único tipo e os campos obrigatórios `versao_formato: 2`, `tipo_envio`, `versao_scc`, `enviado_em` (ISO 8601 com offset ou Z), `id_envio` (UUID estável nas retentativas), `sequencia` (inteiro positivo de 64 bits em texto), `natureza` (`scc` ou `simulacao`), `modo`, `pagina: {numero, total}`, `total_registros` e `dados`. `simulacao` só é aceita com `RF_PERMITIR_SIMULACAO=1` no ambiente local; produção não deve habilitá-la.

- `entradas`: `modo: janela`, com `janela: {desde, ate}` em datas civis. A sequência tem escopo restaurante + tipo; a janela reconcilia abertas e correções anteriores.
- `cadastro_produtos`: `modo: incremental`; sequência por restaurante + tipo. Ausência não remove cadastro; desativação é explícita (`ativo: false`).
- `itens_vendidos`, `comissoes`, `movimentos_caixa`, `eventos_auditoria`, `notas_assinadas` e `financeiro`: `modo: fotografia`, com `dia_movimento` (AAAA-MM-DD), `fonte` (`online` ou `historico`) e `recursos` (lista dos recursos disponíveis: `pdv`, `grupo`, `garcom`, `mesa`, `operador`, `tipo`, `categoria`, `cliente`). Sequência por restaurante + tipo + dia + fonte. A fotografia cobre todo o escopo; online e histórico são independentes. Não enviar não significa zero; fotografia completa vazia confirma zero.

## Páginas, publicação e cursor

As páginas são numeradas de 1 até `total`, com mesmo `id_envio`, envelope e `total_registros` para a carga; `dados` contém somente os registros daquela página. Podem chegar fora de ordem. São mantidas privadas até todas chegarem e a contagem bater; a última publica automaticamente em transação, sem requisição separada. Uma página única também publica automaticamente. A fotografia anterior permanece visível até a substituição completa.

Repita cada página com o mesmo ID e conteúdo quando necessário. Mesmo ID e conteúdo diferente ou sequência obsoleta gera conflito. **Nunca avance a sequência ou o cursor de um escopo sem receber `estado: publicada`**; `recebendo` confirma apenas armazenamento parcial. O sinal de vida principal é atualizado apenas por entradas publicadas.

## Campos por tipo

Os campos e tipos abaixo são obrigatórios conforme os exemplos e o schema versionado; `null` não equivale a zero. Campos desconhecidos são recusados. Dados pessoais de clientes não são recebidos; nas entradas, nome, RG, telefone e sexo são descartados antes da validação e persistência. Consulte também o [desenho aprovado](../superpowers/specs/2026-11-01-webhook-unico-tipado-design.md) e o schema em `supabase/functions/_shared/scc/schemas.ts`.

### 4.1 Entradas

Mantém os campos já confirmados para conta/mesa, renomeando a coleção de `entradas` para `dados`:

- código da entrada;
- datas e horas de entrada e saída;
- valores de itens, descontos, acréscimos, taxa, complemento e consumido;
- pago;
- códigos de mesa/cartão, garçom, operadores e cliente;
- ocupantes, tipo de ocupação e tipo de cartão;
- extras conhecidos da D-51.

Nome, RG, telefone e sexo de cliente continuam descartados antes da validação e da persistência.

### 4.2 Cadastro de produtos

```ts
type CadastroProduto = {
  codigo_produto: Codigo;
  produto: string;
  codigo_grupo: Codigo | null;
  grupo: string | null;
  preco_custo_atual: Decimal | null;
  ativo: boolean;
  alterado_em: string; // ISO 8601 com offset ou Z
};
```

- Chave: restaurante + `codigo_produto`.
- Código não muda; correção de nome, grupo ou custo é `upsert`.
- Produto desativado chega com `ativo: false`; não é apagado.
- Esse cadastro não prova venda e não alimenta sozinho o relatório Produtos.

### 4.3 Itens vendidos

```ts
type ItemVendido = {
  codigo_entrada: Codigo;
  ordinal: number;
  codigo_produto: Codigo;
  produto: string;
  codigo_pdv: Codigo | null;
  pdv: string | null;
  codigo_grupo: Codigo | null;
  grupo: string | null;
  codigo_garcom: Codigo | null;
  garcom: string | null;
  mesa: number | null;
  quantidade: Decimal;
  vendas: Decimal;
  custos: Decimal | null;
};
```

`ordinal` distingue ocorrências repetidas da mesma entrada. Nome, grupo, PDV, garçom, vendas e custo são a fotografia histórica: mudanças futuras no cadastro não reescrevem um relatório antigo. Cancelamentos e estornos são refletidos pela fotografia completa corrigida, não por exclusão física.

O relatório Produtos agrega esses itens por dimensões e usa o cadastro apenas como referência atual. Não inclui produto nunca vendido nos totais.

### 4.4 Comissões

```ts
type Comissao = {
  codigo_operador: Codigo;
  operador: string | null;
  funcao: string | null;
  vendas_elegiveis: Decimal;
  comissao_oficial: Decimal | null;
};
```

Uma linha por operador e dia. A SCC é a fonte oficial da elegibilidade e da comissão. O Food soma e filtra sem derivar comissão da taxa de serviço.

### 4.5 Movimentos de caixa

```ts
type MovimentoCaixa = {
  codigo_lancamento: Codigo;
  momento: string;
  codigo_operador: Codigo | null;
  operador: string | null;
  tipo: 'credito' | 'debito';
  codigo_categoria: Codigo;
  categoria: string;
  valor: Decimal; // magnitude não negativa
};
```

Direção fica em `tipo`; o Food não interpreta valor negativo silenciosamente.

### 4.6 Eventos de auditoria

```ts
type TipoAuditoria =
  | 'cancelamento_produto'
  | 'perda_cartao'
  | 'alteracao_limites'
  | 'exclusao_taxa_servico'
  | 'transferencia_produtos';
```

Cada evento transporta tipo, momento, operador, cartões anterior/novo, produto, quantidade, valor unitário, total e limites anterior/novo, usando `null` quando o campo não se aplica. Não transporta motivo livre nem dado pessoal.

### 4.7 Notas assinadas

```ts
type NotaAssinada = {
  codigo_nota: Codigo;
  codigo_entrada: Codigo;
  codigo_cliente: Codigo;
  valor: Decimal;
};
```

Não transporta nome do cliente. Nota não vira afirmação de dívida atual ou vencimento.

### 4.8 Financeiro

```ts
type Financeiro = {
  componentes: {
    consumo: Decimal | null;
    servico: Decimal | null;
    complemento: Decimal | null;
    taxas_entrada: Decimal | null;
    produto_embutido: Decimal | null;
    flyers: Decimal | null;
  };
  totais_oficiais: {
    projetado: Decimal | null;
    recebido: Decimal | null;
    notas_assinadas: Decimal | null;
    descontos: Decimal | null;
  };
  entradas: {
    habilitados: number | null;
    reabilitados: number | null;
    encerrados: number | null;
    abertos: number | null;
  };
  meios: Array<{
    codigo: Codigo;
    rotulo: string;
    classe: 'dinheiro' | 'credito' | 'debito' | 'pix' | 'nota_assinada' | 'desconto' | 'outro';
    valor: Decimal;
  }>;
  publico: Array<{
    sexo: 'masculino' | 'feminino' | 'nao_informado';
    categoria: 'pagante' | 'convidado' | 'lista' | 'camarote' | 'vip' | 'servico' | 'outro';
    quantidade: number;
  }>;
};
```

Zero ou uma linha financeira por fotografia. Os valores são oficiais da SCC; o Food não afirma equação desconhecida entre os blocos. Público é somente contagem agregada.

### 4.9 Tipos escalares

```ts
type Codigo = string;  // 1..80, letras/dígitos/_/./-, preserva zeros à esquerda
type Decimal = string; // ^-?\d{1,14}(\.\d{1,6})?$
```

Dinheiro não usa `number` no transporte ou na soma do Food.

## Limites

Por página: 1 MiB e 500 registros. Por carga: 200 páginas, 100.000 registros declarados e 32 MiB acumulados. Até 10 cargas incompletas por casa e 120 requisições por token por minuto. Rótulos de produto, grupo, PDV, operador, categoria e meio têm 1–120 caracteres; função até 80. Financeiro aceita até 100 meios e 21 células únicas de público. Um novo ciclo de entradas só publica 20 segundos após o anterior; páginas e retentativas do mesmo ID não reiniciam o relógio, e outros tipos/escopos não compartilham esse bloqueio.

## Respostas e retentativas

| HTTP | Significado |
|---|---|
| 200 | `ok: true`, `estado: recebendo` ou `publicada`, tipo, ID, página, repetição, sequência e, conforme escopo, dia, fonte e revisão. |
| 400 | JSON inválido. |
| 401 | Token ausente, desconhecido, revogado ou expirado. |
| 405 | Método diferente de POST. |
| 409 | Envelope/página divergente ou sequência obsoleta. |
| 413 | Corpo ou limites de página/carga excedidos. |
| 422 | Schema, contagem ou fotografia inválida; simulação não liberada. |
| 429 | Limite de ritmo ou cargas incompletas. |
| 500 | Falha interna, sem corpo, token ou SQL expostos. |

Retente sem avançar o cursor em qualquer erro ou interrupção. Uma falha de um tipo não desfaz outro. Use nova sequência e novo ID para correções.

## Exemplos fictícios completos

Cada exemplo é uma página única independente. `natureza: simulacao` serve apenas para ambiente local preparado. Para dados reais use `scc`, UUID novo por carga e a sequência do respectivo escopo. Veja também a [coleção Insomnia](insomnia-webhook-v2.json) e o [roteiro local](smoke-webhook-v2-local.md).

### entradas

```json
{
  "versao_formato": 2,
  "versao_scc": "smoke-v2",
  "enviado_em": "2026-11-01T15:00:00-03:00",
  "id_envio": "123e4567-e89b-42d3-a456-426614174001",
  "sequencia": "1",
  "natureza": "simulacao",
  "pagina": {
    "numero": 1,
    "total": 1
  },
  "tipo_envio": "entradas",
  "modo": "janela",
  "janela": {
    "desde": "2026-11-01",
    "ate": "2026-11-01"
  },
  "total_registros": 2,
  "dados": [
    {
      "DataEntrada": "2026-11-01",
      "HoraEntrada": "12:00:00",
      "DataSaida": "2026-11-01",
      "HoraSaida": "14:00:00",
      "ValorAcrescimos": "0.00",
      "Complemento": "0.00",
      "Pago": true,
      "NumeroOcupantes": 2,
      "TipoOcupacao": "Mesa",
      "TipoCartao": "Mesa",
      "codEntrada": 1,
      "ValorItens": "66.00",
      "ValorDescontos": "0.00",
      "TaxaServico": "6.60",
      "ValorConsumido": "72.60",
      "codCartaoMesa": 1,
      "CodGarcon": 1,
      "codOperadorHab": 1,
      "codOperadorDesab": 1,
      "codCliente": null
    },
    {
      "DataEntrada": "2026-11-01",
      "HoraEntrada": "12:00:00",
      "DataSaida": "2026-11-01",
      "HoraSaida": "14:00:00",
      "ValorAcrescimos": "0.00",
      "Complemento": "0.00",
      "Pago": true,
      "NumeroOcupantes": 2,
      "TipoOcupacao": "Mesa",
      "TipoCartao": "Mesa",
      "codEntrada": 2,
      "ValorItens": "43.00",
      "ValorDescontos": "3.00",
      "TaxaServico": "4.00",
      "ValorConsumido": "44.00",
      "codCartaoMesa": 2,
      "CodGarcon": 2,
      "codOperadorHab": 2,
      "codOperadorDesab": 2,
      "codCliente": 1
    }
  ]
}
```

### cadastro_produtos

```json
{
  "versao_formato": 2,
  "versao_scc": "smoke-v2",
  "enviado_em": "2026-11-01T15:00:00-03:00",
  "id_envio": "123e4567-e89b-42d3-a456-426614174002",
  "sequencia": "1",
  "natureza": "simulacao",
  "pagina": {
    "numero": 1,
    "total": 1
  },
  "tipo_envio": "cadastro_produtos",
  "modo": "incremental",
  "total_registros": 3,
  "dados": [
    {
      "codigo_produto": "P100",
      "produto": "Prato",
      "codigo_grupo": "G1",
      "grupo": "Produtos",
      "preco_custo_atual": "10.00",
      "ativo": true,
      "alterado_em": "2026-11-01T10:00:00-03:00"
    },
    {
      "codigo_produto": "P200",
      "produto": "Bebida",
      "codigo_grupo": "G1",
      "grupo": "Produtos",
      "preco_custo_atual": "3.00",
      "ativo": true,
      "alterado_em": "2026-11-01T10:00:00-03:00"
    },
    {
      "codigo_produto": "P300",
      "produto": "Sobremesa",
      "codigo_grupo": "G1",
      "grupo": "Produtos",
      "preco_custo_atual": "5.00",
      "ativo": true,
      "alterado_em": "2026-11-01T10:00:00-03:00"
    }
  ]
}
```

### itens_vendidos

```json
{
  "versao_formato": 2,
  "versao_scc": "smoke-v2",
  "enviado_em": "2026-11-01T15:00:00-03:00",
  "id_envio": "123e4567-e89b-42d3-a456-426614174003",
  "sequencia": "1",
  "natureza": "simulacao",
  "pagina": {
    "numero": 1,
    "total": 1
  },
  "modo": "fotografia",
  "dia_movimento": "2026-11-01",
  "fonte": "online",
  "recursos": [],
  "tipo_envio": "itens_vendidos",
  "total_registros": 4,
  "dados": [
    {
      "codigo_entrada": "1",
      "ordinal": 1,
      "codigo_produto": "P100",
      "produto": "Prato",
      "quantidade": "2",
      "vendas": "49.00",
      "custos": "20.00",
      "codigo_pdv": "PDV1",
      "pdv": "Salão",
      "codigo_grupo": "G1",
      "grupo": "Produtos",
      "codigo_garcom": "1",
      "garcom": "Operador 1",
      "mesa": 1
    },
    {
      "codigo_entrada": "1",
      "ordinal": 2,
      "codigo_produto": "P300",
      "produto": "Sobremesa",
      "quantidade": "1",
      "vendas": "17.00",
      "custos": "5.00",
      "codigo_pdv": "PDV1",
      "pdv": "Salão",
      "codigo_grupo": "G1",
      "grupo": "Produtos",
      "codigo_garcom": "1",
      "garcom": "Operador 1",
      "mesa": 1
    },
    {
      "codigo_entrada": "2",
      "ordinal": 1,
      "codigo_produto": "P100",
      "produto": "Prato",
      "quantidade": "1",
      "vendas": "24.00",
      "custos": "10.00",
      "codigo_pdv": "PDV1",
      "pdv": "Salão",
      "codigo_grupo": "G1",
      "grupo": "Produtos",
      "codigo_garcom": "2",
      "garcom": "Operador 2",
      "mesa": 2
    },
    {
      "codigo_entrada": "2",
      "ordinal": 2,
      "codigo_produto": "P200",
      "produto": "Bebida",
      "quantidade": "2",
      "vendas": "16.00",
      "custos": "6.00",
      "codigo_pdv": "PDV1",
      "pdv": "Salão",
      "codigo_grupo": "G1",
      "grupo": "Produtos",
      "codigo_garcom": "2",
      "garcom": "Operador 2",
      "mesa": 2
    }
  ]
}
```

### comissoes

```json
{
  "versao_formato": 2,
  "versao_scc": "smoke-v2",
  "enviado_em": "2026-11-01T15:00:00-03:00",
  "id_envio": "123e4567-e89b-42d3-a456-426614174004",
  "sequencia": "1",
  "natureza": "simulacao",
  "pagina": {
    "numero": 1,
    "total": 1
  },
  "modo": "fotografia",
  "dia_movimento": "2026-11-01",
  "fonte": "online",
  "recursos": [],
  "tipo_envio": "comissoes",
  "total_registros": 2,
  "dados": [
    {
      "codigo_operador": "1",
      "operador": "Operador 1",
      "funcao": "Garçom",
      "vendas_elegiveis": "66.00",
      "comissao_oficial": "6.60"
    },
    {
      "codigo_operador": "2",
      "operador": "Operador 2",
      "funcao": "Garçom",
      "vendas_elegiveis": "40.00",
      "comissao_oficial": "4.00"
    }
  ]
}
```

### movimentos_caixa

```json
{
  "versao_formato": 2,
  "versao_scc": "smoke-v2",
  "enviado_em": "2026-11-01T15:00:00-03:00",
  "id_envio": "123e4567-e89b-42d3-a456-426614174005",
  "sequencia": "1",
  "natureza": "simulacao",
  "pagina": {
    "numero": 1,
    "total": 1
  },
  "modo": "fotografia",
  "dia_movimento": "2026-11-01",
  "fonte": "online",
  "recursos": [],
  "tipo_envio": "movimentos_caixa",
  "total_registros": 2,
  "dados": [
    {
      "codigo_lancamento": "C1",
      "momento": "2026-11-01T14:00:00-03:00",
      "codigo_operador": "1",
      "operador": "Operador 1",
      "tipo": "credito",
      "codigo_categoria": "VENDA",
      "categoria": "Venda",
      "valor": "106.00"
    },
    {
      "codigo_lancamento": "D1",
      "momento": "2026-11-01T14:10:00-03:00",
      "codigo_operador": "2",
      "operador": "Operador 2",
      "tipo": "debito",
      "codigo_categoria": "DESPESA",
      "categoria": "Despesa",
      "valor": "12.50"
    }
  ]
}
```

### eventos_auditoria

```json
{
  "versao_formato": 2,
  "versao_scc": "smoke-v2",
  "enviado_em": "2026-11-01T15:00:00-03:00",
  "id_envio": "123e4567-e89b-42d3-a456-426614174006",
  "sequencia": "1",
  "natureza": "simulacao",
  "pagina": {
    "numero": 1,
    "total": 1
  },
  "modo": "fotografia",
  "dia_movimento": "2026-11-01",
  "fonte": "online",
  "recursos": [],
  "tipo_envio": "eventos_auditoria",
  "total_registros": 6,
  "dados": [
    {
      "tipo": "cancelamento_produto",
      "momento": "2026-11-01T13:00:00-03:00",
      "codigo_operador": "1",
      "operador": "Operador 1",
      "cartao_anterior": "1",
      "cartao_novo": null,
      "codigo_produto": "P100",
      "produto": "Prato",
      "quantidade": "1",
      "valor_unitario": "25.00",
      "total": "25.00",
      "limite_minimo_anterior": null,
      "limite_minimo_novo": null,
      "limite_maximo_anterior": null,
      "limite_maximo_novo": null
    },
    {
      "tipo": "cancelamento_produto",
      "momento": "2026-11-01T13:00:00-03:00",
      "codigo_operador": "1",
      "operador": "Operador 1",
      "cartao_anterior": "1",
      "cartao_novo": null,
      "codigo_produto": "P100",
      "produto": "Prato",
      "quantidade": "1",
      "valor_unitario": "25.00",
      "total": "25.00",
      "limite_minimo_anterior": null,
      "limite_minimo_novo": null,
      "limite_maximo_anterior": null,
      "limite_maximo_novo": null
    },
    {
      "tipo": "perda_cartao",
      "momento": "2026-11-01T13:00:00-03:00",
      "codigo_operador": "1",
      "operador": "Operador 1",
      "cartao_anterior": "1",
      "cartao_novo": null,
      "codigo_produto": null,
      "produto": null,
      "quantidade": null,
      "valor_unitario": null,
      "total": null,
      "limite_minimo_anterior": null,
      "limite_minimo_novo": null,
      "limite_maximo_anterior": null,
      "limite_maximo_novo": null
    },
    {
      "tipo": "alteracao_limites",
      "momento": "2026-11-01T13:00:00-03:00",
      "codigo_operador": "1",
      "operador": "Operador 1",
      "cartao_anterior": "1",
      "cartao_novo": null,
      "codigo_produto": "P100",
      "produto": "Prato",
      "quantidade": "1",
      "valor_unitario": "25.00",
      "total": "25.00",
      "limite_minimo_anterior": "0.00",
      "limite_minimo_novo": "5.00",
      "limite_maximo_anterior": null,
      "limite_maximo_novo": null
    },
    {
      "tipo": "exclusao_taxa_servico",
      "momento": "2026-11-01T13:00:00-03:00",
      "codigo_operador": "1",
      "operador": "Operador 1",
      "cartao_anterior": "1",
      "cartao_novo": null,
      "codigo_produto": "P100",
      "produto": "Prato",
      "quantidade": "1",
      "valor_unitario": "25.00",
      "total": "25.00",
      "limite_minimo_anterior": null,
      "limite_minimo_novo": null,
      "limite_maximo_anterior": null,
      "limite_maximo_novo": null
    },
    {
      "tipo": "transferencia_produtos",
      "momento": "2026-11-01T13:00:00-03:00",
      "codigo_operador": "1",
      "operador": "Operador 1",
      "cartao_anterior": "1",
      "cartao_novo": "2",
      "codigo_produto": "P100",
      "produto": "Prato",
      "quantidade": "1",
      "valor_unitario": "25.00",
      "total": "25.00",
      "limite_minimo_anterior": null,
      "limite_minimo_novo": null,
      "limite_maximo_anterior": null,
      "limite_maximo_novo": null
    }
  ]
}
```

### notas_assinadas

```json
{
  "versao_formato": 2,
  "versao_scc": "smoke-v2",
  "enviado_em": "2026-11-01T15:00:00-03:00",
  "id_envio": "123e4567-e89b-42d3-a456-426614174007",
  "sequencia": "1",
  "natureza": "simulacao",
  "pagina": {
    "numero": 1,
    "total": 1
  },
  "modo": "fotografia",
  "dia_movimento": "2026-11-01",
  "fonte": "online",
  "recursos": [],
  "tipo_envio": "notas_assinadas",
  "total_registros": 1,
  "dados": [
    {
      "codigo_nota": "N1",
      "codigo_entrada": "2",
      "codigo_cliente": "1",
      "valor": "20.00"
    }
  ]
}
```

### financeiro

```json
{
  "versao_formato": 2,
  "versao_scc": "smoke-v2",
  "enviado_em": "2026-11-01T15:00:00-03:00",
  "id_envio": "123e4567-e89b-42d3-a456-426614174008",
  "sequencia": "1",
  "natureza": "simulacao",
  "pagina": {
    "numero": 1,
    "total": 1
  },
  "modo": "fotografia",
  "dia_movimento": "2026-11-01",
  "fonte": "online",
  "recursos": [],
  "tipo_envio": "financeiro",
  "total_registros": 1,
  "dados": [
    {
      "componentes": {
        "consumo": "106.00",
        "servico": "10.60",
        "complemento": "0.00",
        "taxas_entrada": "0.00",
        "produto_embutido": "0.00",
        "flyers": "0.00"
      },
      "totais_oficiais": {
        "projetado": "116.60",
        "recebido": "96.60",
        "notas_assinadas": "20.00",
        "descontos": "3.00"
      },
      "entradas": {
        "habilitados": 2,
        "reabilitados": 0,
        "encerrados": 2,
        "abertos": 0
      },
      "meios": [
        {
          "codigo": "DIN",
          "rotulo": "Dinheiro",
          "classe": "dinheiro",
          "valor": "50.00"
        },
        {
          "codigo": "PIX",
          "rotulo": "Pix",
          "classe": "pix",
          "valor": "46.60"
        },
        {
          "codigo": "NOTA",
          "rotulo": "Nota assinada",
          "classe": "nota_assinada",
          "valor": "20.00"
        }
      ],
      "publico": [
        {
          "sexo": "nao_informado",
          "categoria": "pagante",
          "quantidade": 4
        }
      ]
    }
  ]
}
```
