import { datasIniciaisRelatorio } from "@/lib/relatorios/datas-iniciais";
import { describe, expect, it } from "vitest";

describe("datas iniciais dos relatórios", () => {
  it("usa ontem no fuso da casa, inclusive perto da virada de data UTC", () => {
    expect(
      datasIniciaisRelatorio(
        new Date("2026-10-28T02:30:00.000Z"),
        "America/Fortaleza"
      )
    ).toEqual({ inicio: "2026-10-26", fim: "2026-10-26", fonte: "historico" });
  });
});
