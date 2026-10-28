import { formatarQuantidade, formatarValor } from "@/lib/relatorios/formatacao";
import { describe, expect, it } from "vitest";

describe("formatação de valores do relatório", () => {
  it("não transforma campo oficial ausente em zero", () => {
    expect(formatarValor(null)).toBe("Não informado pela SCC");
    expect(formatarValor("0.00")).toBe("R$ 0,00");
  });

  it("formata quantidades com precisão decimal sem converter para number", () => {
    expect(formatarQuantidade("1.25")).toBe("1,250");
    expect(formatarQuantidade("1.234567")).toBe("1,234567");
    expect(formatarQuantidade("1234567890123456789012345678.5")).toBe(
      "1.234.567.890.123.456.789.012.345.678,500"
    );
    expect(formatarQuantidade(null)).toBe("Não informado pela SCC");
  });
});
