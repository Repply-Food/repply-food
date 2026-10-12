import { describe, expect, it } from "vitest";
import { formatDataCivil } from "../../lib/format/data";
import { validarEnvelope } from "../../lib/validators/recepcao";
import { entrada, envelope } from "../helpers/supabase-local";

describe("contrato SCC canônico", () => {
  const camposEnvelope = [
    "versao_formato",
    "versao_scc",
    "enviado_em",
    "modo",
    "janela",
    "lote",
    "entradas",
  ] as const;
  const camposJanela = ["desde", "ate"] as const;
  const camposLote = ["numero", "total"] as const;

  it.each(camposEnvelope)(
    "rejeita ausência do envelope obrigatório %s",
    (campo) => {
      const corpo = envelope([]) as Record<string, unknown>;
      delete corpo[campo];
      expect(validarEnvelope(corpo).success).toBe(false);
    }
  );

  it.each(camposJanela)("rejeita ausência de janela.%s", (campo) => {
    const corpo = envelope([]);
    delete (corpo.janela as Record<string, unknown>)[campo];
    expect(validarEnvelope(corpo).success).toBe(false);
  });

  it.each(camposLote)("rejeita ausência de lote.%s", (campo) => {
    const corpo = envelope([]);
    delete (corpo.lote as Record<string, unknown>)[campo];
    expect(validarEnvelope(corpo).success).toBe(false);
  });

  const camposObrigatorios = [
    "codEntrada",
    "DataEntrada",
    "HoraEntrada",
    "DataSaida",
    "HoraSaida",
    "ValorItens",
    "ValorDescontos",
    "ValorAcrescimos",
    "TaxaServico",
    "Complemento",
    "ValorConsumido",
    "Pago",
    "codCartaoMesa",
    "CodGarcon",
    "codOperadorHab",
    "codOperadorDesab",
    "codCliente",
    "NumeroOcupantes",
    "TipoOcupacao",
    "TipoCartao",
  ] as const;

  it.each(camposObrigatorios)("rejeita a ausência de %s", (campo) => {
    const semCampo = entrada(1);
    delete (semCampo as Record<string, unknown>)[campo];
    expect(validarEnvelope(envelope([semCampo])).success).toBe(false);
  });

  it("aceita null somente nos campos que o contrato permite", () => {
    expect(
      validarEnvelope(
        envelope([
          entrada(1, {
            DataSaida: null,
            HoraSaida: null,
            codCartaoMesa: null,
            CodGarcon: null,
            codOperadorHab: null,
            codOperadorDesab: null,
            codCliente: null,
          }),
        ])
      ).success
    ).toBe(true);
    expect(
      validarEnvelope(envelope([entrada(2, { TipoCartao: null })])).success
    ).toBe(false);
  });

  it("rejeita fechamento incompleto", () => {
    expect(
      validarEnvelope(
        envelope([entrada(2, { DataSaida: "2026-10-09", HoraSaida: null })])
      ).success
    ).toBe(false);
  });
});

describe("formatação de data civil", () => {
  it("não aceita parâmetro de virada que não implementa", () => {
    expect(formatDataCivil("America/Fortaleza", "2026-10-10T05:00:00Z")).toBe(
      "2026-10-10"
    );
  });
});
