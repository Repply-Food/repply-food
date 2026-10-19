// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { montarCsp } from "@/lib/seguranca/csp";

/** Quebra a política em mapa diretiva -> valor, para afirmar cada uma. */
function diretivas(politica: string): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const parte of politica.split(";")) {
    const texto = parte.trim();
    if (!texto) continue;
    const espaco = texto.indexOf(" ");
    if (espaco === -1) {
      mapa[texto] = "";
      continue;
    }
    mapa[texto.slice(0, espaco)] = texto.slice(espaco + 1).trim();
  }
  return mapa;
}

describe("montar a CSP com senha de uso único (nonce)", () => {
  it("fecha o essencial e amarra os scripts ao nonce (produção)", () => {
    const { nonce, politica } = montarCsp(false);
    const d = diretivas(politica);

    expect(d["default-src"]).toBe("'self'");
    expect(d["base-uri"]).toBe("'self'");
    expect(d["frame-ancestors"]).toBe("'none'");
    expect(d["form-action"]).toBe("'self'");
    expect(d["object-src"]).toBe("'none'");
    expect(d["img-src"]).toBe("'self' data:");
    expect(d["font-src"]).toBe("'self'");

    // O script só roda com o nonce (ou se for do próprio site). Sem o nonce,
    // script injetado em linha não executa.
    expect(d["script-src"]).toBe(`'self' 'nonce-${nonce}'`);
    // Em produção o Next não usa eval; a brecha fica fechada.
    expect(d["script-src"]).not.toContain("'unsafe-eval'");
    // E nunca a brecha que mataria a proteção contra injeção de script.
    expect(d["script-src"]).not.toContain("'unsafe-inline'");
  });

  it("o estilo em linha do Next continua permitido, mas só o estilo", () => {
    const { politica } = montarCsp(false);
    const d = diretivas(politica);
    // O Next injeta estilo em linha; sem isto as telas quebram. Estilo em linha
    // não executa JavaScript, então a brecha fica só no estilo.
    expect(d["style-src"]).toBe("'self' 'unsafe-inline'");
  });

  it("no desenvolvimento libera o eval que o Turbopack usa para recarregar", () => {
    const { nonce, politica } = montarCsp(true);
    const d = diretivas(politica);
    expect(d["script-src"]).toBe(`'self' 'nonce-${nonce}' 'unsafe-eval'`);
  });

  it("nunca é o cabeçalho que só observa (Report-Only é decidido por quem envia)", () => {
    const { politica } = montarCsp(false);
    expect(politica.toLowerCase()).not.toContain("report-only");
  });

  it("gera um nonce novo a cada carregamento", () => {
    const a = montarCsp(false);
    const b = montarCsp(false);
    expect(a.nonce).toBeTruthy();
    expect(b.nonce).toBeTruthy();
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.politica).toContain(`'nonce-${a.nonce}'`);
  });
});
