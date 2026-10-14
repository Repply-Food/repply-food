import { describe, expect, it } from "vitest";
import {
  entrarSchema,
  esqueciSchema,
  novaSenhaSchema,
  trocarSenhaSchema,
} from "../../lib/auth/schemas";

describe("regras dos formulários", () => {
  it("e-mail é limpo e minúsculo", () => {
    expect(
      entrarSchema.parse({ email: "  Dono@Bar.COM ", senha: "x" }).email
    ).toBe("dono@bar.com");
  });
  it("e-mail inválido é recusado", () => {
    expect(esqueciSchema.safeParse({ email: "dono" }).success).toBe(false);
  });
  it("senha nova precisa de 8 caracteres", () => {
    expect(
      novaSenhaSchema.safeParse({ senha: "1234567", confirmacao: "1234567" })
        .success
    ).toBe(false);
    expect(
      novaSenhaSchema.safeParse({ senha: "12345678", confirmacao: "12345678" })
        .success
    ).toBe(true);
  });
  it("as duas senhas precisam ser iguais", () => {
    const r = novaSenhaSchema.safeParse({
      senha: "12345678",
      confirmacao: "12345679",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["confirmacao"]);
  });
  it("na troca, a senha atual pode vir vazia (primeiro acesso)", () => {
    expect(
      trocarSenhaSchema.safeParse({
        senhaAtual: "",
        senha: "senha-nova-1",
        confirmacao: "senha-nova-1",
      }).success
    ).toBe(true);
  });
});
