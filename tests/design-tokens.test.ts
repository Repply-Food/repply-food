import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function canalLinear(valor: number): number {
  const nc = valor / 255;
  return nc <= 0.03928 ? nc / 12.92 : ((nc + 0.055) / 1.055) ** 2.4;
}

function luminancia([r, g, b]: readonly number[]): number {
  return (
    0.2126 * canalLinear(r ?? 0) +
    0.7152 * canalLinear(g ?? 0) +
    0.0722 * canalLinear(b ?? 0)
  );
}

function razaoDeContraste(a: readonly number[], b: readonly number[]): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const clara = Math.max(la, lb);
  const escura = Math.min(la, lb);
  return (clara + 0.05) / (escura + 0.05);
}

function hexParaRgb(hex: string): [number, number, number] | null {
  const limpo = hex.trim().replace("#", "");
  const completo =
    limpo.length === 3
      ? limpo
          .split("")
          .map((c) => c + c)
          .join("")
      : limpo;
  if (completo.length !== 6) return null;
  const r = Number.parseInt(completo.slice(0, 2), 16);
  const g = Number.parseInt(completo.slice(2, 4), 16);
  const b = Number.parseInt(completo.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return [r, g, b];
}

function extrairVariavel(css: string, nome: string): string | null {
  const regex = new RegExp(`--${nome}:\\s*([^;]+);`, "i");
  const match = css.match(regex);
  if (!match) return null;
  const valor = match[1];
  if (valor === undefined || valor.trim() === "") return null;
  return valor.trim();
}

describe("tokens de marca", () => {
  it("tokens.css existe e tem as variáveis básicas", () => {
    const css = readFileSync(
      resolve(__dirname, "../app/styles/tokens.css"),
      "utf-8"
    );
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain("--bg");
    expect(css).toContain("--fg");
    expect(css).toContain("--brand-orange");
  });

  it("brand.css existe", () => {
    const css = readFileSync(
      resolve(__dirname, "../app/styles/brand.css"),
      "utf-8"
    );
    expect(css.length).toBeGreaterThan(0);
  });

  it("o texto sobre o fundo passa no contraste mínimo (4.5:1)", () => {
    const css = readFileSync(
      resolve(__dirname, "../app/styles/tokens.css"),
      "utf-8"
    );
    const fundo = hexParaRgb(extrairVariavel(css, "bg") ?? "#ffffff");
    const texto = hexParaRgb(extrairVariavel(css, "fg") ?? "#0a0a0a");
    expect(fundo).not.toBeNull();
    expect(texto).not.toBeNull();
    const razao = razaoDeContraste(
      texto ?? [0, 0, 0],
      fundo ?? [255, 255, 255]
    );
    expect(razao).toBeGreaterThanOrEqual(4.5);
  });
});
