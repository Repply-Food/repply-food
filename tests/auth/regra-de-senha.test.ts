// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SENHA_MINIMA } from "../../lib/auth/senha";

const toml = readFileSync("supabase/config.toml", "utf8");

/** Corpo de uma seção do config.toml, até a próxima seção. */
function secao(nome: string): string {
  const linhas = toml.split(/\r?\n/);
  const inicio = linhas.indexOf(`[${nome}]`);
  if (inicio < 0) throw new Error(`seção [${nome}] não encontrada`);
  const fim = linhas.findIndex(
    (linha, indice) => indice > inicio && linha.startsWith("[")
  );
  return linhas.slice(inicio + 1, fim < 0 ? undefined : fim).join("\n");
}

function valor(corpo: string, chave: string): string | undefined {
  return new RegExp(`^${chave}\\s*=\\s*(.+)$`, "m").exec(corpo)?.[1]?.trim();
}

describe("regra de senha e de cadastro", () => {
  it("a senha mínima é 8 (D-46)", () => {
    expect(SENHA_MINIMA).toBe(8);
  });

  it("o Supabase Auth usa a mesma senha mínima do código", () => {
    expect(valor(secao("auth"), "minimum_password_length")).toBe(
      String(SENHA_MINIMA)
    );
  });

  it("o cadastro público está desligado: a conta é criada pelo admin (D-11)", () => {
    expect(valor(secao("auth"), "enable_signup")).toBe("false");
  });

  it("o login por e-mail continua ligado", () => {
    expect(valor(secao("auth.email"), "enable_signup")).toBe("true");
  });
});
