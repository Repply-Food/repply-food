import { mesAtualNoFuso } from "@/lib/painel/mes";
import { describe, expect, it } from "vitest";

describe("mesAtualNoFuso", () => {
  it("devolve o dia 1 do mês no fuso da casa", () => {
    expect(
      mesAtualNoFuso(new Date("2026-10-20T12:00:00Z"), "America/Fortaleza")
    ).toBe("2026-10-01");
  });
  it("respeita o fuso ao virar o mês", () => {
    // 2026-11-01 00:30 UTC ainda é 31/10 21:30 em Fortaleza (UTC-3)
    expect(
      mesAtualNoFuso(new Date("2026-11-01T00:30:00Z"), "America/Fortaleza")
    ).toBe("2026-10-01");
  });
  it("fuso inválido cai no padrão do Brasil (não UTC)", () => {
    // 2026-11-01 01:00 UTC já é novembro no UTC, mas 31/10 22:00 no Brasil (UTC-3).
    expect(
      mesAtualNoFuso(new Date("2026-11-01T01:00:00Z"), "Zona/Inexistente")
    ).toBe("2026-10-01");
  });
});
