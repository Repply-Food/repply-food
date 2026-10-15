import { describe, expect, it } from "vitest";
import { slugDoNome, slugLivre } from "../../lib/admin/slug";

describe("endereço da casa (slug)", () => {
  it.each([
    ["Bar do Zé", "bar-do-ze"],
    ["Ação & Companhia — Pão", "acao-companhia-pao"],
    ["  Cantina   da Praça!! ", "cantina-da-praca"],
    ["Forno 2 Lenha", "forno-2-lenha"],
    ["!!!", "restaurante"],
  ])("%j vira %j", (nome, slug) => {
    expect(slugDoNome(nome)).toBe(slug);
  });

  it("corta em 60 caracteres sem deixar hífen no fim", () => {
    const slug = slugDoNome(`${"a".repeat(59)} bcd`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("põe número no fim quando o endereço já existe", () => {
    expect(slugLivre("bar-do-ze", [])).toBe("bar-do-ze");
    expect(slugLivre("bar-do-ze", ["bar-do-ze"])).toBe("bar-do-ze-2");
    expect(
      slugLivre("bar-do-ze", ["bar-do-ze", "bar-do-ze-2", "bar-do-zebra"])
    ).toBe("bar-do-ze-3");
  });
});
