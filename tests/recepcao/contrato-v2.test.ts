import { describe, expect, it } from "vitest";
import { validarEnvioSccV2 } from "../../lib/validators/recepcao";
import {
  MAX_BYTES_CARGA,
  MAX_BYTES_PAGINA,
  MAX_CARGAS_ABERTAS,
  MAX_PAGINAS,
  MAX_REGISTROS_CARGA,
  MAX_REGISTROS_PAGINA,
  MAX_REQUISICOES_MINUTO,
  TIPOS_ENVIO,
} from "../../lib/validators/recepcao";
import { linhaProdutosSchema } from "../../supabase/functions/_shared/relatorios/schemas";
import { fixtures } from "./fixtures-v2";

describe("contrato SCC v2", () => {
  it.each(fixtures)("aceita $tipo_envio", (envio) => {
    expect(validarEnvioSccV2(envio).success).toBe(true);
  });
  it("recusa campos desconhecidos e dados de outro tipo", () => {
    expect(
      validarEnvioSccV2({ ...fixtures[0], restaurante_id: "1" }).success
    ).toBe(false);
    expect(
      validarEnvioSccV2({ ...fixtures[0], dados: fixtures[1].dados }).success
    ).toBe(false);
  });
  it("valida limites, correlações e escalares", () => {
    const entrada = fixtures[0];
    const foto = fixtures[2];
    for (const alteracao of [
      { versao_formato: 1 },
      { modo: "fotografia" },
      { sequencia: "9223372036854775808" },
      { sequencia: "0" },
      { id_envio: "inválido" },
      { enviado_em: "2026-11-01T10:00:00" },
      { pagina: { numero: 2, total: 1 } },
      { total_registros: 0 },
      { pagina: { numero: 1, total: 201 } },
      { pagina: { numero: 1, total: 1, extra: true } },
      { janela: { desde: "2026-02-30", ate: "2026-11-01" } },
      { dados: [{ ...entrada.dados[0], ValorItens: 1 }] },
      { dados: [{ ...entrada.dados[0], extra: true }] },
    ])
      expect(validarEnvioSccV2({ ...entrada, ...alteracao }).success).toBe(
        false
      );
    expect(
      validarEnvioSccV2({ ...entrada, sequencia: "9223372036854775807" })
        .success
    ).toBe(true);
    expect(
      validarEnvioSccV2({ ...entrada, total_registros: 0, dados: [] }).success
    ).toBe(true);
    expect(
      validarEnvioSccV2({ ...foto, recursos: ["pdv", "pdv"] }).success
    ).toBe(false);
    expect(
      validarEnvioSccV2({
        ...foto,
        dados: [{ ...foto.dados[0], codigo_produto: "inválido!" }],
      }).success
    ).toBe(false);
    expect(
      validarEnvioSccV2({
        ...foto,
        dados: [{ ...foto.dados[0], vendas: "1.1234567" }],
      }).success
    ).toBe(false);
  });
  it("aceita extras conhecidos da entrada e recusa valores compostos", () => {
    const envio = fixtures[0];
    expect(
      validarEnvioSccV2({
        ...envio,
        dados: [{ ...envio.dados[0], ECF: "1", Flyer: true }],
      }).success
    ).toBe(true);
    expect(
      validarEnvioSccV2({ ...envio, dados: [{ ...envio.dados[0], ECF: {} }] })
        .success
    ).toBe(false);
  });
  it("rejeita duplicatas e objetos desconhecidos no financeiro", () => {
    const financeiro = fixtures[7];
    const linha = financeiro.dados[0];
    const meio = { codigo: "1", rotulo: "Pix", classe: "pix", valor: "1" };
    const publico = { sexo: "masculino", categoria: "vip", quantidade: 1 };
    for (const dados of [
      [{ ...linha, meios: [meio, meio] }],
      [{ ...linha, publico: [publico, publico] }],
      [{ ...linha, componentes: { ...linha.componentes, extra: 1 } }],
      [linha, linha],
    ])
      expect(validarEnvioSccV2({ ...financeiro, dados }).success).toBe(false);
  });
});

describe("restrições do contrato v2", () => {
  const valido = (envio: unknown) => validarEnvioSccV2(envio).success;

  it("expõe os oito tipos e os limites de transporte", () => {
    expect(TIPOS_ENVIO).toEqual([
      "entradas",
      "cadastro_produtos",
      "itens_vendidos",
      "comissoes",
      "movimentos_caixa",
      "eventos_auditoria",
      "notas_assinadas",
      "financeiro",
    ]);
    expect([
      MAX_BYTES_PAGINA,
      MAX_REGISTROS_PAGINA,
      MAX_PAGINAS,
      MAX_REGISTROS_CARGA,
      MAX_BYTES_CARGA,
      MAX_CARGAS_ABERTAS,
      MAX_REQUISICOES_MINUTO,
    ]).toEqual([1048576, 500, 200, 100000, 33554432, 10, 120]);
  });

  it.each(fixtures)(
    "rejeita campos extras no envelope e na linha de $tipo_envio",
    (envio) => {
      expect(valido({ ...envio, extra: true })).toBe(false);
      expect(
        valido({ ...envio, dados: [{ ...envio.dados[0], extra: true }] })
      ).toBe(false);
      expect(valido({ ...envio, restaurante_id: "outra-casa" })).toBe(false);
    }
  );

  it("rejeita campos extras em todos os objetos internos", () => {
    const entrada = fixtures[0];
    expect(
      valido({ ...entrada, janela: { ...entrada.janela, extra: true } })
    ).toBe(false);
    expect(
      valido({ ...entrada, pagina: { ...entrada.pagina, extra: true } })
    ).toBe(false);
    const financeiro = fixtures[7];
    const linha = financeiro.dados[0];
    for (const campo of [
      "componentes",
      "totais_oficiais",
      "entradas",
    ] as const) {
      expect(
        valido({
          ...financeiro,
          dados: [{ ...linha, [campo]: { ...linha[campo], extra: true } }],
        })
      ).toBe(false);
    }
    const meio = {
      codigo: "1",
      rotulo: "Pix",
      classe: "pix",
      valor: "1",
      extra: true,
    };
    const publico = {
      sexo: "masculino",
      categoria: "vip",
      quantidade: 1,
      extra: true,
    };
    expect(
      valido({ ...financeiro, dados: [{ ...linha, meios: [meio] }] })
    ).toBe(false);
    expect(
      valido({ ...financeiro, dados: [{ ...linha, publico: [publico] }] })
    ).toBe(false);
  });

  it.each(fixtures)("exige modo correspondente para $tipo_envio", (envio) => {
    for (const modo of ["janela", "incremental", "fotografia"]) {
      expect(valido({ ...envio, modo })).toBe(modo === envio.modo);
    }
  });

  it.each([fixtures[0], fixtures[1]])(
    "proíbe campos de fotografia em $tipo_envio",
    (envio) => {
      for (const campo of [
        { dia_movimento: "2026-11-01" },
        { fonte: "online" },
        { recursos: [] },
      ]) {
        expect(valido({ ...envio, ...campo })).toBe(false);
      }
    }
  );

  it("rejeita dados de outro tipo, mesmo em união misturada", () => {
    const entrada = fixtures[0];
    expect(
      valido({
        ...entrada,
        total_registros: 2,
        dados: [entrada.dados[0], fixtures[1].dados[0]],
      })
    ).toBe(false);
    expect(
      valido({ ...entrada, versao_formato: 1, tipo_envio: undefined })
    ).toBe(false);
  });

  it.each(fixtures)("rejeita mistura de linhas em $tipo_envio", (envio) => {
    const outra =
      envio.tipo_envio === "entradas"
        ? fixtures[1].dados[0]
        : fixtures[0].dados[0];
    expect(
      valido({ ...envio, total_registros: 2, dados: [envio.dados[0], outra] })
    ).toBe(false);
  });

  it("valida datas civis e intervalo da janela", () => {
    const envio = fixtures[0];
    for (const data of [
      "2026-02-29",
      "2026-04-31",
      "0000-01-01",
      "2026-13-01",
      "2026-1-01",
    ]) {
      expect(
        valido({ ...envio, janela: { desde: data, ate: "2026-12-31" } })
      ).toBe(false);
    }
    expect(
      valido({ ...envio, janela: { desde: "2024-02-29", ate: "2026-12-31" } })
    ).toBe(true);
    expect(
      valido({ ...envio, janela: { desde: "2026-11-02", ate: "2026-11-01" } })
    ).toBe(false);
    expect(valido({ ...fixtures[2], dia_movimento: "2025-02-29" })).toBe(false);
  });

  it("exige instante com offset, UUID e sequência bigint positiva", () => {
    const envio = fixtures[1];
    for (const enviado_em of [
      "2026-11-01T10:00:00",
      "2026-13-01T10:00:00Z",
      "2026-02-30T10:00:00Z",
      "2026-11-01T10:00:00+16:00",
    ]) {
      expect(valido({ ...envio, enviado_em })).toBe(false);
    }
    for (const enviado_em of [
      "2026-11-01T10:00:00Z",
      "2026-11-01T10:00:00+05:30",
    ]) {
      expect(valido({ ...envio, enviado_em })).toBe(true);
    }
    for (const id_envio of ["", "123", "123e4567-e89b-42d3-a456-42661417400z"])
      expect(valido({ ...envio, id_envio })).toBe(false);
    for (const sequencia of [
      "0",
      "01",
      "-1",
      "9223372036854775808",
      "99999999999999999999",
      1,
    ])
      expect(valido({ ...envio, sequencia })).toBe(false);
    for (const sequencia of ["1", "9223372036854775807"])
      expect(valido({ ...envio, sequencia })).toBe(true);
  });

  it("valida códigos, rótulos, função e decimais nos limites", () => {
    const envio = fixtures[1];
    const linha = envio.dados[0];
    for (const codigo_produto of ["", "x".repeat(81), "á", "a b", "a/b"])
      expect(valido({ ...envio, dados: [{ ...linha, codigo_produto }] })).toBe(
        false
      );
    for (const codigo_produto of ["0", "a".repeat(80), "00_A.-"])
      expect(valido({ ...envio, dados: [{ ...linha, codigo_produto }] })).toBe(
        true
      );
    for (const produto of ["", "a".repeat(121), "a\nb"])
      expect(valido({ ...envio, dados: [{ ...linha, produto }] })).toBe(false);
    for (const produto of ["a", "a".repeat(120)])
      expect(valido({ ...envio, dados: [{ ...linha, produto }] })).toBe(true);
    for (const preco_custo_atual of [
      "",
      "1e2",
      "+1",
      "1.",
      "123456789012345",
      "1.1234567",
      1,
    ])
      expect(
        valido({ ...envio, dados: [{ ...linha, preco_custo_atual }] })
      ).toBe(false);
    for (const preco_custo_atual of ["0", "-12345678901234.123456", null])
      expect(
        valido({ ...envio, dados: [{ ...linha, preco_custo_atual }] })
      ).toBe(true);
    const comissao = fixtures[3];
    expect(
      valido({
        ...comissao,
        dados: [{ ...comissao.dados[0], funcao: "x".repeat(80) }],
      })
    ).toBe(true);
    expect(
      valido({
        ...comissao,
        dados: [{ ...comissao.dados[0], funcao: "x".repeat(81) }],
      })
    ).toBe(false);
  });

  it("valida os 20 campos de entrada e exige dinheiro textual em cada um", () => {
    const envio = fixtures[0];
    const linha = envio.dados[0];
    expect(Object.keys(linha)).toHaveLength(20);
    for (const campo of Object.keys(linha)) {
      const incompleta: Record<string, unknown> = { ...linha };
      delete incompleta[campo];
      expect(valido({ ...envio, dados: [incompleta] }), campo).toBe(false);
    }
    for (const campo of [
      "ValorItens",
      "ValorDescontos",
      "ValorAcrescimos",
      "TaxaServico",
      "Complemento",
      "ValorConsumido",
    ]) {
      expect(
        valido({ ...envio, dados: [{ ...linha, [campo]: 1 }] }),
        campo
      ).toBe(false);
    }
    expect(
      valido({ ...envio, dados: [{ ...linha, DataSaida: "2026-11-01" }] })
    ).toBe(false);
    const extras = {
      Reabilitado: true,
      Flyer: "sim",
      ConferenciaDeMesa: null,
      HabilitacaoAutomatica: false,
      DesabilitacaoAutomatica: 1,
      LimiteMinimo: "0.00",
      LimiteMaximo: 50,
      ECF: "1",
      CER: null,
      COO: 2,
    };
    expect(valido({ ...envio, dados: [{ ...linha, ...extras }] })).toBe(true);
    for (const campo of Object.keys(extras)) {
      expect(
        valido({ ...envio, dados: [{ ...linha, [campo]: [] }] }),
        campo
      ).toBe(false);
    }
  });

  it("valida recursos e não repete dimensões", () => {
    const envio = fixtures[2];
    expect(
      valido({
        ...envio,
        recursos: [
          "pdv",
          "grupo",
          "garcom",
          "mesa",
          "operador",
          "tipo",
          "categoria",
          "cliente",
        ],
      })
    ).toBe(true);
    expect(valido({ ...envio, recursos: ["pdv", "pdv"] })).toBe(false);
    expect(valido({ ...envio, recursos: ["desconhecido"] })).toBe(false);
  });

  it("verifica páginas e contagem inclusive quando as outras páginas estão no limite", () => {
    const envio = fixtures[1];
    const linha = envio.dados[0];
    const dados500 = Array.from({ length: 500 }, () => linha);
    expect(
      valido({
        ...envio,
        pagina: { numero: 1, total: 1 },
        total_registros: 500,
        dados: dados500,
      })
    ).toBe(true);
    expect(
      valido({
        ...envio,
        pagina: { numero: 1, total: 2 },
        total_registros: 501,
        dados: [...dados500, linha],
      })
    ).toBe(false);
    expect(
      valido({
        ...envio,
        pagina: { numero: 200, total: 200 },
        total_registros: 100000,
        dados: dados500,
      })
    ).toBe(true);
    expect(
      valido({
        ...envio,
        pagina: { numero: 200, total: 200 },
        total_registros: 100001,
        dados: dados500,
      })
    ).toBe(false);
    expect(valido({ ...envio, pagina: { numero: 0, total: 1 } })).toBe(false);
    expect(valido({ ...envio, pagina: { numero: 2, total: 1 } })).toBe(false);
    expect(valido({ ...envio, pagina: { numero: 1, total: 201 } })).toBe(false);
    expect(valido({ ...envio, total_registros: 2 })).toBe(false);
    expect(valido({ ...envio, total_registros: 0, dados: [] })).toBe(true);
    expect(
      valido({
        ...envio,
        pagina: { numero: 1, total: 2 },
        total_registros: 0,
        dados: [],
      })
    ).toBe(false);
    expect(
      valido({ ...envio, pagina: { numero: 1, total: 2 }, total_registros: 0 })
    ).toBe(false);
    expect(
      valido({
        ...envio,
        pagina: { numero: 1, total: 2 },
        total_registros: 501,
        dados: [linha],
      })
    ).toBe(true);
    expect(
      valido({
        ...envio,
        pagina: { numero: 2, total: 2 },
        total_registros: 501,
        dados: [linha],
      })
    ).toBe(true);
    expect(
      valido({
        ...envio,
        pagina: { numero: 1, total: 2 },
        total_registros: 502,
        dados: [linha],
      })
    ).toBe(false);
  });

  it.each(fixtures.slice(0, 7))(
    "limita a página de $tipo_envio a 500 linhas",
    (envio) => {
      const linhas = Array.from({ length: 500 }, () => envio.dados[0]);
      expect(valido({ ...envio, total_registros: 500, dados: linhas })).toBe(
        true
      );
      expect(
        valido({
          ...envio,
          pagina: { numero: 1, total: 2 },
          total_registros: 501,
          dados: [...linhas, envio.dados[0]],
        })
      ).toBe(false);
    }
  );

  it("financeiro aceita zero ou uma linha, meios e público distintos", () => {
    const envio = fixtures[7];
    const linha = envio.dados[0];
    const meios = Array.from({ length: 100 }, (_, i) => ({
      codigo: `${i}`,
      rotulo: "Pix",
      classe: "pix",
      valor: "1",
    }));
    const publico = ["masculino", "feminino", "nao_informado"].flatMap((sexo) =>
      [
        "pagante",
        "convidado",
        "lista",
        "camarote",
        "vip",
        "servico",
        "outro",
      ].map((categoria) => ({ sexo, categoria, quantidade: 1 }))
    );
    expect(valido({ ...envio, total_registros: 0, dados: [] })).toBe(true);
    expect(valido({ ...envio, dados: [{ ...linha, meios, publico }] })).toBe(
      true
    );
    expect(
      valido({
        ...envio,
        dados: [
          { ...linha, meios: [...meios, { ...meios[0], codigo: "100" }] },
        ],
      })
    ).toBe(false);
    expect(
      valido({
        ...envio,
        dados: [{ ...linha, publico: [...publico, publico[0]] }],
      })
    ).toBe(false);
    expect(
      valido({ ...envio, pagina: { numero: 1, total: 2 }, total_registros: 1 })
    ).toBe(false);
    expect(
      valido({ ...envio, total_registros: 2, dados: [linha, linha] })
    ).toBe(false);
  });

  it("exige identificadores apenas nos itens vendidos v2, sem alterar o legado", () => {
    const envio = fixtures[2];
    const { codigo_entrada, ordinal, ...legado } = envio.dados[0];
    expect(linhaProdutosSchema.safeParse(legado).success).toBe(true);
    expect(linhaProdutosSchema.safeParse(envio.dados[0]).success).toBe(false);
    expect(valido({ ...envio, dados: [legado] })).toBe(false);
    expect(
      valido({ ...envio, dados: [{ ...legado, codigo_entrada, ordinal }] })
    ).toBe(true);
    expect(
      valido({ ...envio, dados: [{ ...legado, codigo_entrada, ordinal: -1 }] })
    ).toBe(false);
  });
});
