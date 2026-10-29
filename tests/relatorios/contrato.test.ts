import { expect, it } from "vitest";
import {
  fotografiaSchema,
  pedidoRelatoriosSchema,
  validarPedidoRelatorios,
} from "../../lib/validators/relatorios";
import { envelopeSchema } from "../../supabase/functions/_shared/recepcao";
import {
  MAX_BYTES_CARGA,
  MAX_BYTES_PAGINA,
  MAX_CARGAS_ABERTAS,
  MAX_LINHAS_CARGA,
  MAX_LINHAS_PAGINA,
  MAX_PAGINAS,
} from "../../supabase/functions/_shared/relatorios/limites";
import {
  casosLinhasInvalidas,
  casosLinhasValidas,
  linhasRelatorios,
  pagina,
  paginaProdutos,
} from "./fixtures";

it("aceita fotografia fictícia e recusa dados pessoais inesperados", () => {
  const pedido = paginaProdutos();
  expect(pedidoRelatoriosSchema.safeParse(pedido).success).toBe(true);
  expect(
    pedidoRelatoriosSchema.safeParse({
      ...pedido,
      linhas: [{ ...pedido.linhas[0], NomeCliente: "Pessoa fictícia" }],
    }).success
  ).toBe(false);
});

it("valida fotografia sem campos de paginação para o importador", () => {
  const pedido = paginaProdutos();
  const {
    total_paginas: _totalPaginas,
    total_linhas: _totalLinhas,
    ...manifesto
  } = pedido.manifesto;
  expect(
    fotografiaSchema.safeParse({ manifesto, linhas: pedido.linhas }).success
  ).toBe(true);
  expect(
    fotografiaSchema.safeParse({
      manifesto,
      linhas: [{ ...pedido.linhas[0], NomeCliente: "Pessoa fictícia" }],
    }).success
  ).toBe(false);
});

it.each(casosLinhasValidas)("valida o formato %s", (relatorio, linha) => {
  expect(validarPedidoRelatorios(pagina(relatorio, linha)).success).toBe(true);
});

it("recusa dias impossíveis, dinheiro impreciso e sequências fora de bigint", () => {
  const pedido = paginaProdutos();
  expect(
    validarPedidoRelatorios({
      ...pedido,
      manifesto: { ...pedido.manifesto, dia_movimento: "2026-02-30" },
    }).success
  ).toBe(false);
  expect(
    validarPedidoRelatorios(
      pagina("notas-assinadas", {
        ...linhasRelatorios["notas-assinadas"],
        valor: "1e2",
      })
    ).success
  ).toBe(false);
  expect(
    validarPedidoRelatorios(
      pagina("notas-assinadas", {
        ...linhasRelatorios["notas-assinadas"],
        valor: "1.1234567",
      })
    ).success
  ).toBe(false);
  expect(
    validarPedidoRelatorios({
      ...pedido,
      manifesto: { ...pedido.manifesto, sequencia: "9223372036854775808" },
    }).success
  ).toBe(false);
});

it("retorna erro de validação para sequência que não é decimal", () => {
  const pedido = paginaProdutos();
  expect(
    validarPedidoRelatorios({
      ...pedido,
      manifesto: { ...pedido.manifesto, sequencia: "abc" },
    }).success
  ).toBe(false);
});

it("aceita e preserva a sequência bigint máxima como texto", () => {
  const pedido = paginaProdutos();
  const sequencia = "9223372036854775807";
  const resultado = validarPedidoRelatorios({
    ...pedido,
    manifesto: { ...pedido.manifesto, sequencia },
  });

  expect(resultado.success).toBe(true);
  if (resultado.success && resultado.data.acao === "pagina") {
    expect(resultado.data.manifesto.sequencia).toBe(sequencia);
  }
});

it("mantém a faixa completa de capturado_em independente dos limites de momento", () => {
  const pedido = paginaProdutos();
  for (const capturado_em of [
    "0001-01-01T00:00:00+15:59",
    "9999-12-31T23:59:59-15:59",
  ]) {
    const resultado = validarPedidoRelatorios({
      ...pedido,
      manifesto: { ...pedido.manifesto, capturado_em },
    });
    expect(resultado.success).toBe(true);
    if (resultado.success && resultado.data.acao === "pagina") {
      expect(resultado.data.manifesto.capturado_em).toBe(capturado_em);
    }
  }
});

it("aplica os limites de linhas e páginas por carga", () => {
  const pedido = paginaProdutos();
  expect(
    validarPedidoRelatorios({
      ...pedido,
      manifesto: { ...pedido.manifesto, total_paginas: 201 },
    }).success
  ).toBe(false);
  expect(
    validarPedidoRelatorios({
      ...pedido,
      manifesto: { ...pedido.manifesto, total_linhas: 100001 },
    }).success
  ).toBe(false);
  expect(validarPedidoRelatorios({ ...pedido, numero: 2 }).success).toBe(false);
  expect(
    validarPedidoRelatorios({
      ...pedido,
      linhas: Array.from({ length: 501 }, () => pedido.linhas[0]),
    }).success
  ).toBe(false);
  expect({
    MAX_BYTES_PAGINA,
    MAX_LINHAS_PAGINA,
    MAX_PAGINAS,
    MAX_LINHAS_CARGA,
    MAX_BYTES_CARGA,
    MAX_CARGAS_ABERTAS,
  }).toEqual({
    MAX_BYTES_PAGINA: 1048576,
    MAX_LINHAS_PAGINA: 500,
    MAX_PAGINAS: 200,
    MAX_LINHAS_CARGA: 100000,
    MAX_BYTES_CARGA: 33554432,
    MAX_CARGAS_ABERTAS: 10,
  });
});

it("restringe recursos ao relatório e rejeita recursos duplicados", () => {
  const pedido = paginaProdutos();
  expect(
    validarPedidoRelatorios({
      ...pedido,
      manifesto: { ...pedido.manifesto, recursos: ["operador"] },
    }).success
  ).toBe(false);
  expect(
    validarPedidoRelatorios({
      ...pedido,
      manifesto: { ...pedido.manifesto, recursos: ["pdv", "pdv"] },
    }).success
  ).toBe(false);
  const financeiro = pagina("financeiro", linhasRelatorios.financeiro, [
    "cliente",
  ]);
  expect(validarPedidoRelatorios(financeiro).success).toBe(false);
});

it("confere a contagem da página única e o resumo financeiro com zero ou uma linha", () => {
  const pedidoProdutos = paginaProdutos();
  const financeiros = pagina("financeiro", linhasRelatorios.financeiro);
  expect(
    validarPedidoRelatorios({
      ...pedidoProdutos,
      manifesto: { ...pedidoProdutos.manifesto, total_linhas: 2 },
    }).success
  ).toBe(false);
  expect(
    validarPedidoRelatorios({
      ...financeiros,
      linhas: [linhasRelatorios.financeiro, linhasRelatorios.financeiro],
      manifesto: { ...financeiros.manifesto, total_linhas: 2 },
    }).success
  ).toBe(false);
});

it("aceita fotografia financeira explicitamente vazia no pedido e no importador", () => {
  const pedido = pagina("financeiro", linhasRelatorios.financeiro);
  expect(
    validarPedidoRelatorios({
      ...pedido,
      manifesto: { ...pedido.manifesto, total_linhas: 0 },
      linhas: [],
    }).success
  ).toBe(true);
  const {
    total_linhas: _linhas,
    total_paginas: _paginas,
    ...manifesto
  } = pedido.manifesto;
  expect(fotografiaSchema.safeParse({ manifesto, linhas: [] }).success).toBe(
    true
  );
});

it.each([
  "0000-02-29T12:00:00Z",
  "2026-02-14T12:00:00+16:00",
  "2026-02-14T12:00:00-23:59",
])("recusa captura fora do domínio timestamptz: %s", (capturado_em) => {
  const pedido = paginaProdutos();
  expect(
    validarPedidoRelatorios({
      ...pedido,
      manifesto: { ...pedido.manifesto, capturado_em },
    }).success
  ).toBe(false);
});

it("não aceita público individual nem células agregadas repetidas", () => {
  const financeiro = linhasRelatorios.financeiro;
  const individual = {
    ...financeiro,
    publico: [
      {
        sexo: "masculino",
        categoria: "pagante",
        quantidade: 1,
        codigo_cliente: "CL1",
      },
    ],
  };
  const duplicado = {
    ...financeiro,
    publico: [financeiro.publico[0], financeiro.publico[0]],
  };
  expect(
    validarPedidoRelatorios(pagina("financeiro", individual)).success
  ).toBe(false);
  expect(validarPedidoRelatorios(pagina("financeiro", duplicado)).success).toBe(
    false
  );
});

it("mantém compatibilidade com o schema antigo de entradas", () => {
  const envelope = {
    versao_formato: 1,
    versao_scc: "ficticia",
    enviado_em: "2026-02-15T08:00:00",
    modo: "janela",
    janela: { desde: "2026-02-14", ate: "2026-02-14" },
    lote: { numero: 1, total: 1 },
    entradas: [],
  };
  expect(envelopeSchema.safeParse(envelope).success).toBe(true);
});

it.each(casosLinhasInvalidas)(
  "recusa a linha inválida compartilhada de %s",
  (relatorio, linha) => {
    expect(validarPedidoRelatorios(pagina(relatorio, linha)).success).toBe(
      false
    );
  }
);
