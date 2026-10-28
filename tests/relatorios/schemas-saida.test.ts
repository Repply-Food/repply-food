import { resultadoSchemas, resumoSchema } from "@/lib/relatorios/schemas-saida";
import { describe, expect, it } from "vitest";

const componentes = {
  consumo: "100.00",
  servico: "8.00",
  complemento: null,
  taxasEntrada: null,
  produtoEmbutido: null,
  flyers: null,
};
const totaisOficiais = {
  projetado: "108.00",
  recebido: "93.00",
  notasAssinadas: "10.00",
  descontos: "5.00",
};
const entradas = {
  habilitados: 5,
  reabilitados: null,
  encerrados: 3,
  abertos: 2,
};
const financeiro = {
  componentes,
  totaisOficiais,
  entradas,
  meios: [
    { codigo: "M1", rotulo: "Dinheiro", classe: "dinheiro", valor: "93.00" },
  ],
  publico: [{ sexo: "nao_informado", categoria: "pagante", quantidade: 5 }],
};
const auditoria = {
  tipo: "cancelamento_produto",
  momento: "2026-02-15T01:00:00-03:00",
  codigoOperador: null,
  operador: null,
  cartaoAnterior: null,
  cartaoNovo: null,
  codigoProduto: "P1",
  produto: "Produto fictício",
  quantidade: "1.500000",
  valorUnitario: "10.00",
  total: "15.00",
  limiteMinimoAnterior: null,
  limiteMinimoNovo: null,
  limiteMaximoAnterior: null,
  limiteMaximoNovo: null,
  diaMovimento: "2026-02-14",
};
const envelope = {
  situacao: "completo",
  revisao: "123",
  cobertura: {
    esperados: 1,
    recebidos: 1,
    ausentes: [],
    capturadoEm: "2026-02-15T03:00:00Z",
    simulacao: true,
    recursos: [],
  },
  paginacao: { pagina: 1, tamanho: 25, totalLinhas: 1 },
};

const amostras = {
  produtos: {
    linhas: [
      {
        codigoProduto: "P1",
        produto: "Produto fictício",
        codigoPdv: null,
        pdv: null,
        codigoGrupo: null,
        grupo: null,
        quantidade: "1.500000",
        vendas: "9007199254740993.01",
        custos: null,
        diferenca: null,
      },
    ],
    resumo: {
      quantidade: "1.500000",
      vendas: "9007199254740993.01",
      custos: null,
      diferenca: null,
    },
  },
  comissao: {
    linhas: [
      {
        codigoOperador: "O1",
        operador: null,
        funcao: null,
        vendasElegiveis: "80.00",
        comissaoOficial: null,
      },
    ],
    resumo: {
      vendasElegiveis: "80.00",
      comissaoOficial: null,
      operadoresSemComissao: 1,
    },
  },
  caixa: {
    linhas: [
      {
        codigoLancamento: "L1",
        diaMovimento: "2026-02-14",
        diaCivil: "2026-02-15",
        momento: "2026-02-15T01:00:00-03:00",
        codigoOperador: null,
        operador: null,
        tipo: "debito",
        codigoCategoria: "C1",
        categoria: "Categoria fictícia",
        valor: "12.50",
      },
    ],
    resumo: { creditos: "50.00", debitos: "12.50", saldo: "37.50" },
  },
  auditoria: {
    linhas: [auditoria],
    resumo: {
      ocorrencias: 1,
      porTipo: [
        {
          tipo: "cancelamento_produto",
          ocorrencias: 1,
          quantidade: "1.500000",
          total: "15.00",
        },
      ],
    },
  },
  "notas-assinadas": {
    linhas: [
      {
        codigoNota: "N1",
        codigoEntrada: "E1",
        diaMovimento: "2026-02-14",
        codigoCliente: "C1",
        valor: "20.00",
      },
    ],
    resumo: { notas: 1, valor: "20.00" },
  },
  financeiro: {
    linhas: [{ ...financeiro, diaMovimento: "2026-02-14" }],
    resumo: financeiro,
  },
};

describe("saídas concretas e fechadas", () => {
  it.each(Object.entries(amostras))(
    "valida %s preservando decimais e nulos",
    (tipo, dados) => {
      const resultado = resultadoSchemas[
        tipo as keyof typeof resultadoSchemas
      ].parse({ ...envelope, ...dados });
      expect(resultado).toEqual({ ...envelope, ...dados });
      expect(resumoSchema.parse({ tipo, resumo: dados.resumo })).toEqual({
        tipo,
        resumo: dados.resumo,
      });
    }
  );

  it("recusa resumo de outro relatório, decimal numérico e campos desconhecidos", () => {
    expect(
      resumoSchema.safeParse({
        tipo: "produtos",
        resumo: amostras.caixa.resumo,
      }).success
    ).toBe(false);
    expect(
      resultadoSchemas.produtos.safeParse({
        ...envelope,
        ...amostras.produtos,
        resumo: { ...amostras.produtos.resumo, vendas: 10 },
      }).success
    ).toBe(false);
    expect(
      resultadoSchemas.produtos.safeParse({
        ...envelope,
        ...amostras.produtos,
        segredo: "x",
      }).success
    ).toBe(false);
    expect(
      resultadoSchemas.financeiro.safeParse({
        ...envelope,
        ...amostras.financeiro,
        resumo: {
          ...financeiro,
          componentes: { ...componentes, outro: "1.00" },
        },
      }).success
    ).toBe(false);
    expect(
      resultadoSchemas["notas-assinadas"].safeParse({
        ...envelope,
        ...amostras["notas-assinadas"],
        linhas: [
          { ...amostras["notas-assinadas"].linhas[0], nomeCliente: "x" },
        ],
      }).success
    ).toBe(false);
  });

  it("recusa contagens agregadas inseguras sem limitar somas válidas a 32 bits", () => {
    expect(
      resultadoSchemas.financeiro.safeParse({
        ...envelope,
        ...amostras.financeiro,
        resumo: {
          ...financeiro,
          entradas: { ...entradas, habilitados: 4294967294 },
        },
      }).success
    ).toBe(true);
    for (const quantidade of [Number.MAX_SAFE_INTEGER + 1, -1, 1.5]) {
      expect(
        resultadoSchemas.financeiro.safeParse({
          ...envelope,
          ...amostras.financeiro,
          resumo: {
            ...financeiro,
            publico: [{ sexo: "masculino", categoria: "pagante", quantidade }],
          },
        }).success
      ).toBe(false);
      expect(
        resultadoSchemas.comissao.safeParse({
          ...envelope,
          ...amostras.comissao,
          resumo: {
            ...amostras.comissao.resumo,
            operadoresSemComissao: quantidade,
          },
        }).success
      ).toBe(false);
    }
    expect(
      resultadoSchemas.financeiro.safeParse({
        ...envelope,
        ...amostras.financeiro,
        linhas: [
          {
            ...financeiro,
            entradas: { ...entradas, habilitados: 2147483648 },
            diaMovimento: "2026-02-14",
          },
        ],
      }).success
    ).toBe(false);
  });

  it("recusa somas de contagens inseguras mesmo com células seguras", () => {
    expect(
      resultadoSchemas.financeiro.safeParse({
        ...envelope,
        ...amostras.financeiro,
        resumo: {
          ...financeiro,
          publico: [
            {
              sexo: "masculino",
              categoria: "pagante",
              quantidade: Number.MAX_SAFE_INTEGER,
            },
            { sexo: "feminino", categoria: "pagante", quantidade: 1 },
          ],
        },
      }).success
    ).toBe(false);
    expect(
      resultadoSchemas.auditoria.safeParse({
        ...envelope,
        ...amostras.auditoria,
        resumo: {
          ocorrencias: 1,
          porTipo: [
            {
              tipo: "perda_cartao",
              ocorrencias: Number.MAX_SAFE_INTEGER,
              quantidade: null,
              total: null,
            },
            {
              tipo: "alteracao_limites",
              ocorrencias: 1,
              quantidade: null,
              total: null,
            },
          ],
        },
      }).success
    ).toBe(false);
  });

  it("valida datas reais e ausência explícita de valores", () => {
    expect(
      resultadoSchemas.caixa.safeParse({
        ...envelope,
        ...amostras.caixa,
        linhas: [{ ...amostras.caixa.linhas[0], diaCivil: "2026-02-30" }],
      }).success
    ).toBe(false);
    expect(
      resultadoSchemas.produtos.safeParse({
        ...envelope,
        ...amostras.produtos,
        linhas: [{ ...amostras.produtos.linhas[0], custos: undefined }],
      }).success
    ).toBe(false);
    expect(
      resultadoSchemas.produtos.safeParse({
        ...envelope,
        ...amostras.produtos,
        resumo: { ...amostras.produtos.resumo, quantidade: "1e3" },
      }).success
    ).toBe(false);
    expect(
      resultadoSchemas.financeiro.safeParse({
        ...envelope,
        ...amostras.financeiro,
        resumo: {
          ...financeiro,
          meios: [...financeiro.meios, ...financeiro.meios],
        },
      }).success
    ).toBe(false);
  });

  it("não aceita total financeiro nem quantidade para outros eventos de auditoria", () => {
    for (const celula of [
      {
        tipo: "perda_cartao",
        ocorrencias: 1,
        quantidade: null,
        total: "10.00",
      },
      {
        tipo: "alteracao_limites",
        ocorrencias: 1,
        quantidade: "1",
        total: null,
      },
    ]) {
      expect(
        resultadoSchemas.auditoria.safeParse({
          ...envelope,
          ...amostras.auditoria,
          resumo: { ocorrencias: 1, porTipo: [celula] },
        }).success
      ).toBe(false);
    }
  });

  it("preserva revisão textual e recusa timestamps/data, recursos e paginação inválidos", () => {
    expect(
      resultadoSchemas.caixa.safeParse({
        ...envelope,
        ...amostras.caixa,
        revisao: "9223372036854775807",
      }).success
    ).toBe(true);
    for (const extra of [
      { revisao: 1 },
      { paginacao: { pagina: 0, tamanho: 25, totalLinhas: 1 } },
      { cobertura: { ...envelope.cobertura, capturadoEm: "2026-02-15" } },
      { cobertura: { ...envelope.cobertura, recursos: ["cliente"] } },
    ]) {
      expect(
        resultadoSchemas.produtos.safeParse({
          ...envelope,
          ...amostras.produtos,
          ...extra,
        }).success
      ).toBe(false);
    }
    expect(
      resultadoSchemas.caixa.safeParse({
        ...envelope,
        ...amostras.caixa,
        linhas: [{ ...amostras.caixa.linhas[0], valor: "-1.00" }],
      }).success
    ).toBe(false);
  });
});
