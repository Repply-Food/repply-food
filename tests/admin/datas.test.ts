import { describe, expect, it } from "vitest";
import {
  dataBr,
  dataCurtaNaCasa,
  dataEHoraNaCasa,
  diaCurto,
  diaValido,
  hojeNaCasa,
  horaNaCasa,
  momentoNaCasa,
  somarDias,
} from "../../lib/admin/datas";

const fuso = "America/Fortaleza";
// Quarta 14/10/2026, 21:40 em Fortaleza (UTC−3); no servidor já é dia 15.
const agora = new Date("2026-10-15T00:40:00Z");

describe("datas no fuso da casa", () => {
  it("o dia de hoje é o da casa, não o do servidor", () => {
    expect(hojeNaCasa(agora, fuso)).toBe("2026-10-14");
  });

  it.each([
    ["2026-10-15T00:30:00Z", "hoje 21:30"],
    ["2026-10-14T03:10:00Z", "hoje 00:10"],
    ["2026-10-14T02:59:00Z", "ontem 23:59"],
    ["2026-10-02T15:00:00Z", "02/10 12:00"],
    ["2025-12-31T15:00:00Z", "31/12/2025 12:00"],
    [null, "—"],
    ["não é data", "—"],
  ])("%j aparece como %j", (iso, texto) => {
    expect(momentoNaCasa(iso, agora, fuso)).toBe(texto);
  });

  it("hora, data curta e data com hora", () => {
    expect(horaNaCasa("2026-10-15T00:30:00Z", fuso)).toBe("21:30");
    expect(dataCurtaNaCasa("2026-10-15T00:30:00Z", fuso)).toBe("14/10");
    expect(dataEHoraNaCasa("2026-10-15T00:03:00Z", fuso)).toBe("14/10 21:03");
  });

  it("fuso que não existe não derruba a tela (cai no fuso padrão)", () => {
    expect(horaNaCasa("2026-10-15T00:30:00Z", "Fuso/Inexistente")).toBe(
      "21:30"
    );
  });

  it("dias no formato do banco", () => {
    expect(dataBr("2026-10-01")).toBe("01/10/2026");
    expect(diaCurto("2026-10-01")).toBe("01/10");
    expect(diaValido("2026-02-28")).toBe(true);
    expect(diaValido("2026-02-30")).toBe(false);
    expect(diaValido("2026-2-28")).toBe(false);
    expect(somarDias("2026-10-14", -120)).toBe("2026-06-16");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
  });
});
