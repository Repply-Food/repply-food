import { safeNext } from "@/lib/auth/safe-next";
import { avisoDaEntrada, textoDoParametro } from "@/lib/entrada/parametros";
import { describe, expect, it } from "vitest";

describe("textoDoParametro", () => {
  it("devolve o texto quando o parâmetro aparece uma vez", () => {
    expect(textoDoParametro("/r/casa/hoje")).toBe("/r/casa/hoje");
  });

  it("devolve null quando o parâmetro não veio", () => {
    expect(textoDoParametro(undefined)).toBeNull();
  });

  it("devolve null quando o parâmetro se repete (a URL entrega uma lista)", () => {
    expect(textoDoParametro(["/a", "/b"])).toBeNull();
    expect(textoDoParametro([])).toBeNull();
  });

  it("deixa o safeNext tratar `?next=a&next=b` sem estourar", () => {
    const repetido = textoDoParametro(["/a", "/b"]);
    expect(() => safeNext(repetido, "https://painel.invalid")).not.toThrow();
    expect(safeNext(repetido, "https://painel.invalid")).toBeNull();
  });
});

describe("avisoDaEntrada", () => {
  it("devolve a frase do link que não vale mais", () => {
    expect(avisoDaEntrada("link_invalido")).toBe(
      "Este link não vale mais. Peça um novo em “Esqueci a senha”."
    );
  });

  it("não devolve aviso para código desconhecido ou ausente", () => {
    expect(avisoDaEntrada("qualquer_coisa")).toBeUndefined();
    expect(avisoDaEntrada(null)).toBeUndefined();
    expect(avisoDaEntrada("")).toBeUndefined();
  });

  it("não deixa nome herdado do Object.prototype virar aviso", () => {
    for (const nome of [
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
      "valueOf",
    ]) {
      expect(avisoDaEntrada(nome)).toBeUndefined();
    }
  });
});
