// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fim de linha do repositório", () => {
  it("o .gitattributes obriga LF em todo arquivo de texto", () => {
    const regras = readFileSync(".gitattributes", "utf8");
    expect(regras).toMatch(/^\* text=auto eol=lf$/m);
  });

  it("nenhum arquivo de texto versionado está com CRLF na pasta de trabalho", () => {
    const saida = execFileSync("git", ["ls-files", "--eol"], {
      encoding: "utf8",
    });
    const comCrlf = saida
      .split("\n")
      .filter((linha) => /\bw\/(crlf|mixed)\b/.test(linha))
      .map((linha) => linha.split("\t")[1]);
    expect(comCrlf).toEqual([]);
  });
});
