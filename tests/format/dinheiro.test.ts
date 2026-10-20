import { analisarBRL } from "@/lib/format/dinheiro";
import { describe, expect, it } from "vitest";

describe("analisarBRL", () => {
  it("número simples em reais", () => {
    expect(analisarBRL("30000")).toBe("30000.00");
    expect(analisarBRL("150000")).toBe("150000.00");
  });
  it("pontos de milhar em grupos de 3", () => {
    expect(analisarBRL("30.000")).toBe("30000.00");
    expect(analisarBRL("1.250.000")).toBe("1250000.00");
  });
  it("vírgula decimal, pontos de milhar", () => {
    expect(analisarBRL("30.000,50")).toBe("30000.50");
    expect(analisarBRL("1250,5")).toBe("1250.50");
  });
  it("ponto solto com 1–2 dígitos é decimal (teclado de celular)", () => {
    expect(analisarBRL("30.5")).toBe("30.50");
    expect(analisarBRL("30.00")).toBe("30.00");
  });
  it("ignora R$ e espaços", () => {
    expect(analisarBRL(" R$ 1.250,00 ")).toBe("1250.00");
  });
  it("vazio vira null", () => {
    expect(analisarBRL("")).toBeNull();
    expect(analisarBRL("   ")).toBeNull();
  });
  it("rejeita estrutura malformada (sem leitura silenciosa errada)", () => {
    expect(analisarBRL("abc")).toBeNull();
    expect(analisarBRL("1,2,3")).toBeNull();
    expect(analisarBRL("1.2.3")).toBeNull();
    expect(analisarBRL("30.000.50")).toBeNull();
    expect(analisarBRL(".5")).toBeNull();
    expect(analisarBRL("1.5000")).toBeNull();
    expect(analisarBRL("1.5,50")).toBeNull();
    expect(analisarBRL("1.2.3,00")).toBeNull();
  });
  it("com vírgula, a parte inteira precisa ser dígitos ou milhar de 3", () => {
    expect(analisarBRL("150000,00")).toBe("150000.00");
    expect(analisarBRL("1.250.000,50")).toBe("1250000.50");
  });
});
