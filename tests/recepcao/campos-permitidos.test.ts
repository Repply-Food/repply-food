import { describe, expect, it } from "vitest";
import { filtrarEnvelope } from "../../supabase/functions/_shared/campos-permitidos";

function entradaCompleta(parcial: Record<string, unknown> = {}) {
  return {
    codEntrada: 1,
    DataEntrada: "2026-10-09",
    HoraEntrada: "12:10:00",
    DataSaida: null,
    HoraSaida: null,
    ValorItens: 100,
    ValorDescontos: 0,
    ValorAcrescimos: 0,
    TaxaServico: 10,
    Complemento: 0,
    ValorConsumido: 110,
    Pago: "Não",
    codCartaoMesa: 15,
    CodGarcon: 27,
    codOperadorHab: 99,
    codOperadorDesab: null,
    codCliente: 1,
    NumeroOcupantes: 2,
    TipoOcupacao: "Mesa",
    TipoCartao: "Normal",
    ...parcial,
  };
}

function envelopeCompleto(entradas: unknown[], parcial = {}) {
  return {
    versao_formato: 1,
    versao_scc: "5.2.1",
    enviado_em: "2026-10-09T21:15:00",
    modo: "janela",
    janela: { desde: "2026-10-08", ate: "2026-10-09" },
    lote: { numero: 1, total: 1 },
    entradas,
    ...parcial,
  };
}

describe("lista do que a nuvem aceita guardar", () => {
  it("deixa passar intacto o envelope que só tem campos do contrato", () => {
    const extras = {
      Reabilitado: null,
      Flyer: null,
      ConferenciaDeMesa: null,
      HabilitacaoAutomatica: null,
      DesabilitacaoAutomatica: null,
      LimiteMinimo: 0,
      LimiteMaximo: 10000,
      ECF: 123456,
      CER: 123456,
      COO: 1,
    };
    const bruto = envelopeCompleto([entradaCompleta(extras)]);
    expect(filtrarEnvelope(bruto)).toEqual({
      envelope: bruto,
      camposDesconhecidos: [],
    });
  });

  it("descarta os dados pessoais em silêncio", () => {
    const resultado = filtrarEnvelope(
      envelopeCompleto([
        entradaCompleta({
          NomeCliente: "Pessoa de teste",
          RG: "000.000.000-00",
          FoneCliente: "(85) 99999-9999",
          Sexo: "X",
        }),
      ])
    );
    expect(resultado.camposDesconhecidos).toEqual([]);
    expect(resultado.envelope).toEqual(envelopeCompleto([entradaCompleta()]));
  });

  it("descarta o campo novo e guarda só o nome dele", () => {
    const resultado = filtrarEnvelope(
      envelopeCompleto([
        entradaCompleta({ CPF: "111.222.333-44" }),
        entradaCompleta({ EmailCliente: "pessoa@teste.repply.local" }),
      ])
    );
    expect(resultado.camposDesconhecidos).toEqual(["CPF", "EmailCliente"]);
    expect(JSON.stringify(resultado)).not.toContain("111.222.333-44");
    expect(JSON.stringify(resultado)).not.toContain("pessoa@teste");
  });

  it("um extra conhecido só passa se for valor simples", () => {
    const resultado = filtrarEnvelope(
      envelopeCompleto([
        entradaCompleta({ Flyer: { indicado_por: "Fulano de Tal" }, COO: 7 }),
      ])
    );
    expect(resultado.camposDesconhecidos).toEqual(["Flyer"]);
    expect(resultado.envelope).toEqual(
      envelopeCompleto([entradaCompleta({ COO: 7 })])
    );
  });

  it("campo novo fora das entradas aparece com o lugar de onde veio", () => {
    const resultado = filtrarEnvelope(
      envelopeCompleto([], {
        tenant_name: "Casa que não deveria vir",
        janela: { desde: "2026-10-08", ate: "2026-10-09", turno: "noite" },
        lote: { numero: 1, total: 1, origem: "caixa 2" },
      })
    );
    expect(resultado.camposDesconhecidos).toEqual([
      "envelope.tenant_name",
      "janela.turno",
      "lote.origem",
    ]);
    expect(resultado.envelope).toEqual(envelopeCompleto([]));
  });

  it("o que não é um envelope não é guardado", () => {
    for (const bruto of [null, "texto", 7, [entradaCompleta({ CPF: "1" })]]) {
      expect(filtrarEnvelope(bruto)).toEqual({
        envelope: null,
        camposDesconhecidos: [],
      });
    }
  });

  it("entrada que não é objeto vira null e não derruba o filtro", () => {
    const resultado = filtrarEnvelope(envelopeCompleto(["texto solto", 7]));
    expect(resultado.envelope).toEqual(envelopeCompleto([null, null]));
  });

  it("nome estranho de campo não é guardado como veio, e a lista tem limite", () => {
    const muitos = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [
        `Campo${String(i).padStart(2, "0")}`,
        i,
      ])
    );
    const resultado = filtrarEnvelope(
      envelopeCompleto([
        entradaCompleta({ "Maria da Silva 85 99999-9999": 1, ...muitos }),
      ])
    );
    expect(resultado.camposDesconhecidos).toHaveLength(20);
    expect(resultado.camposDesconhecidos[0]).toBe("(nome fora do padrão)");
    expect(JSON.stringify(resultado)).not.toContain("Maria da Silva");
  });
});
