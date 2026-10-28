import type { Relatorio } from "../../supabase/functions/_shared/relatorios/schemas";

export function paginaProdutos() {
  return {
    acao: "pagina",
    manifesto: {
      versao_formato: 1,
      carga_id: "314d4909-5276-436d-b925-66d27ee3f509",
      relatorio: "produtos",
      dia_movimento: "2026-02-14",
      fonte: "historico",
      sequencia: "1",
      capturado_em: "2026-02-15T08:00:00-03:00",
      natureza: "simulacao",
      recursos: ["pdv", "grupo", "garcom", "mesa"],
      total_paginas: 1,
      total_linhas: 1,
    },
    numero: 1,
    linhas: [
      {
        codigo_produto: "P1",
        produto: "Produto fictício",
        codigo_pdv: "D1",
        pdv: "PDV fictício",
        codigo_grupo: "G1",
        grupo: "Grupo fictício",
        codigo_garcom: "O1",
        garcom: "Operador fictício",
        mesa: 7,
        quantidade: "1.250",
        vendas: "16.25",
        custos: "4.00",
      },
    ],
  } as const;
}

export function pagina(
  relatorio: Relatorio,
  linha: unknown,
  recursos: string[] = []
) {
  return {
    acao: "pagina" as const,
    manifesto: {
      versao_formato: 1 as const,
      carga_id: "314d4909-5276-436d-b925-66d27ee3f509",
      relatorio,
      dia_movimento: "2026-02-14",
      fonte: "historico" as const,
      sequencia: "1",
      capturado_em: "2026-02-15T08:00:00-03:00",
      natureza: "simulacao" as const,
      recursos,
      total_paginas: 1,
      total_linhas: 1,
    },
    numero: 1,
    linhas: [linha],
  };
}

export const linhasRelatorios = {
  produtos: {
    codigo_produto: "P1",
    produto: "Produto fictício",
    codigo_pdv: null,
    pdv: null,
    codigo_grupo: null,
    grupo: null,
    codigo_garcom: null,
    garcom: null,
    mesa: null,
    quantidade: "-1.2",
    vendas: "-16.25",
    custos: null,
  },
  comissao: {
    codigo_operador: "O1",
    operador: "Operadora fictícia",
    funcao: null,
    vendas_elegiveis: "80.00",
    comissao_oficial: null,
  },
  caixa: {
    codigo_lancamento: "L1",
    momento: "2026-02-14T23:30:00-03:00",
    codigo_operador: null,
    operador: null,
    tipo: "credito",
    codigo_categoria: "C1",
    categoria: "Categoria fictícia",
    valor: "12.50",
  },
  auditoria: {
    tipo: "cancelamento_produto",
    momento: "2026-02-14T23:30:00-03:00",
    codigo_operador: null,
    operador: null,
    cartao_anterior: null,
    cartao_novo: null,
    codigo_produto: null,
    produto: null,
    quantidade: "-1",
    valor_unitario: "2.00",
    total: "-2.00",
    limite_minimo_anterior: null,
    limite_minimo_novo: null,
    limite_maximo_anterior: null,
    limite_maximo_novo: null,
  },
  "notas-assinadas": {
    codigo_nota: "N1",
    codigo_entrada: "E1",
    codigo_cliente: "CL1",
    valor: "0.00",
  },
  financeiro: {
    componentes: {
      consumo: "100.00",
      servico: "8.00",
      complemento: null,
      taxas_entrada: null,
      produto_embutido: null,
      flyers: null,
    },
    totais_oficiais: {
      projetado: "108.00",
      recebido: "93.00",
      notas_assinadas: "10.00",
      descontos: "5.00",
    },
    entradas: { habilitados: 5, reabilitados: 0, encerrados: 2, abertos: null },
    meios: [
      { codigo: "DIN", rotulo: "Dinheiro", classe: "dinheiro", valor: "93.00" },
    ],
    publico: [{ sexo: "nao_informado", categoria: "pagante", quantidade: 5 }],
  },
} satisfies Record<Relatorio, unknown>;

// Os mesmos casos exercitam o validador de entrada e a defesa SQL.
export const casosLinhasInvalidas: [Relatorio, unknown][] = [
  ["notas-assinadas", { ...linhasRelatorios["notas-assinadas"], valor: "1e2" }],
  [
    "notas-assinadas",
    { ...linhasRelatorios["notas-assinadas"], valor: "1.1234567" },
  ],
  ["notas-assinadas", { ...linhasRelatorios["notas-assinadas"], valor: "-0" }],
  ["notas-assinadas", { ...linhasRelatorios["notas-assinadas"], valor: 10 }],
  [
    "financeiro",
    {
      ...linhasRelatorios.financeiro,
      componentes: {
        ...linhasRelatorios.financeiro.componentes,
        telefone: "fictício",
      },
    },
  ],
  [
    "financeiro",
    {
      ...linhasRelatorios.financeiro,
      publico: [
        linhasRelatorios.financeiro.publico[0],
        linhasRelatorios.financeiro.publico[0],
      ],
    },
  ],
  [
    "financeiro",
    {
      ...linhasRelatorios.financeiro,
      entradas: {
        ...linhasRelatorios.financeiro.entradas,
        abertos: 2147483648,
      },
    },
  ],
  ["produtos", { ...linhasRelatorios.produtos, produto: "Produto\ninválido" }],
  [
    "produtos",
    { ...linhasRelatorios.produtos, codigo_produto: "Código com espaço" },
  ],
  ["comissao", { ...linhasRelatorios.comissao, funcao: "X".repeat(81) }],
  ["caixa", { ...linhasRelatorios.caixa, momento: "2026-02-30T12:00:00Z" }],
  ["caixa", { ...linhasRelatorios.caixa, tipo: "outro" }],
  ["auditoria", { ...linhasRelatorios.auditoria, tipo: "outro" }],
];

export const casosLinhasValidas: [Relatorio, unknown][] = [
  ...Object.entries(linhasRelatorios).map(
    ([relatorio, linha]) =>
      [relatorio as Relatorio, linha] as [Relatorio, unknown]
  ),
  [
    "caixa",
    { ...linhasRelatorios.caixa, momento: "2026-02-14T12:00:00+23:00" },
  ],
  ["caixa", { ...linhasRelatorios.caixa, momento: "0000-02-29T12:00:00Z" }],
];
