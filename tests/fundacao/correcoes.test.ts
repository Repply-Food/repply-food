import { describe, expect, it } from "vitest";
import { formatDataCivil } from "../../lib/format/data";
import { validarEnvelope } from "../../lib/validators/recepcao";
import { entrada, envelope } from "../helpers/supabase-local";

describe("contrato SCC canônico", () => {
  it("rejeita campos obrigatórios ausentes e fechamento incompleto", () => {
    const semCampos = entrada(1);
    (semCampos as Record<string, unknown>).ValorItens = undefined;
    expect(validarEnvelope(envelope([semCampos])).success).toBe(false);
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
