import { describe, expect, it } from "vitest";
import { cnpjValido, formatarCnpj, limparCnpj } from "../../lib/admin/cnpj";

describe("CNPJ (D-60)", () => {
  it.each([
    ["12.345.678/0001-95", "12345678000195"],
    ["12.abc.345/01de-35", "12ABC34501DE35"],
    [" 98765432000198 ", "98765432000198"],
  ])("limpa %j para %j", (texto, limpo) => {
    expect(limparCnpj(texto)).toBe(limpo);
  });

  it.each(["12345678000195", "98765432000198", "12ABC34501DE35"])(
    "%s é válido (o último é o exemplo alfanumérico da Receita)",
    (cnpj) => {
      expect(cnpjValido(cnpj)).toBe(true);
    }
  );

  it.each([
    "12345678000190",
    "11111111111111",
    "00000000000000",
    "1234567800019",
    "1234567800019A",
    "12abc34501de35",
    "12.345.678/0001-95",
    "",
  ])("%j é inválido", (cnpj) => {
    expect(cnpjValido(cnpj)).toBe(false);
  });

  it("formata com a pontuação de sempre", () => {
    expect(formatarCnpj("12345678000195")).toBe("12.345.678/0001-95");
    expect(formatarCnpj("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
    expect(formatarCnpj("123")).toBe("123");
  });
});
