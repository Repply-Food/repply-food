// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ALFABETO_DA_SENHA,
  TAMANHO_DA_SENHA,
  gerarSenhaProvisoria,
} from "../../lib/admin/senha-provisoria";
import { SENHA_MINIMA } from "../../lib/auth/senha";

describe("senha provisória (D-55)", () => {
  it("o alfabeto não tem os caracteres que se confundem", () => {
    for (const ambiguo of ["0", "O", "1", "l", "I"]) {
      expect(ALFABETO_DA_SENHA).not.toContain(ambiguo);
    }
  });

  it("tem 12 caracteres do alfabeto, letra e número, e passa a regra de senha", () => {
    for (let i = 0; i < 300; i++) {
      const senha = gerarSenhaProvisoria();
      expect(senha).toHaveLength(TAMANHO_DA_SENHA);
      expect([...senha].every((c) => ALFABETO_DA_SENHA.includes(c))).toBe(true);
      expect(senha).toMatch(/[A-Za-z]/);
      expect(senha).toMatch(/[0-9]/);
      expect(senha.length).toBeGreaterThanOrEqual(SENHA_MINIMA);
    }
  });

  it("não se repete", () => {
    expect(
      new Set(Array.from({ length: 500 }, () => gerarSenhaProvisoria())).size
    ).toBe(500);
  });
});
