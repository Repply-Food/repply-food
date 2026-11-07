import { MODULOS_OPCIONAIS, casaTemModulo } from "@/lib/painel/modulos";
import { describe, expect, it } from "vitest";

describe("módulos opcionais da casa", () => {
  it("o mentor é um módulo opcional conhecido", () => {
    expect(MODULOS_OPCIONAIS).toContain("mentor");
  });
  it("casa sem o módulo: falso", () => {
    expect(casaTemModulo([], "mentor")).toBe(false);
  });
  it("casa com o módulo: verdadeiro", () => {
    expect(casaTemModulo(["mentor"], "mentor")).toBe(true);
  });
  it("texto desconhecido na lista não vira módulo", () => {
    expect(casaTemModulo(["outro"], "mentor")).toBe(false);
  });
});
