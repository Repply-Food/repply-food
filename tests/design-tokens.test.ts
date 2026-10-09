import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function getLuminance(r: number, g: number, b: number): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const rs = rn <= 0.03928 ? rn / 12.92 : ((rn + 0.055) / 1.055) ** 2.4;
  const gs = gn <= 0.03928 ? gn / 12.92 : ((gn + 0.055) / 1.055) ** 2.4;
  const bs = bn <= 0.03928 ? bn / 12.92 : ((bn + 0.055) / 1.055) ** 2.4;
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(c1: [number, number, number], c2: [number, number, number]): number {
  const l1 = getLuminance(c1[0], c1[1], c1[2]);
  const l2 = getLuminance(c2[0], c2[1], c2[2]);
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (brightest + 0.05) / (darkest + 0.05);
}

function hexToRgb(hex: string): [number, number, number] | null {
  const cleaned = hex.replace("#", "");
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return [r, g, b];
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return [r, g, b];
  }
  return null;
}

function extractVar(css: string, name: string): string | null {
  const regex = new RegExp(`--${name}:\\s*([^;]+);`, "i");
  const match = css.match(regex);
  if (!match) return null;
  const m1 = match[1];
  if (m1 === undefined || m1 === "") return null;
  return m1.trim();
}

describe("design tokens", () => {
  it("tokens.css deve existir e ter variáveis básicas", () => {
    const cssPath = resolve(__dirname, "../app/styles/tokens.css");
    const css = readFileSync(cssPath, "utf-8");
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain("--bg");
    expect(css).toContain("--fg");
    expect(css).toContain("--brand-orange");
  });

  it("brand.css deve existir", () => {
    const cssPath = resolve(__dirname, "../app/styles/brand.css");
    const css = readFileSync(cssPath, "utf-8");
    expect(css.length).toBeGreaterThan(0);
  });

  it("contraste mínimo entre texto e fundo", () => {
    const tokens = readFileSync(resolve(__dirname, "../app/styles/tokens.css"), "utf-8");
    const bg = extractVar(tokens, "bg") || "#ffffff";
    const fg = extractVar(tokens, "fg") || "#0a0a0a";
    const rgbBg = hexToRgb(bg);
    const rgbFg = hexToRgb(fg);
    expect(rgbBg).not.toBeNull();
    expect(rgbFg).not.toBeNull();
    const bgArr = rgbBg as [number, number, number];
    const fgArr = rgbFg as [number, number, number];
    const ratio = contrastRatio(fgArr, bgArr);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
