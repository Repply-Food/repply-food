import { safeNext, safeNextOr } from "@/lib/auth/safe-next";
import { describe, expect, it } from "vitest";

const ORIGEM = "https://imob.repplyhub.com.br";

describe("safeNext — bloqueio de redirecionamento malicioso", () => {
  it("aceita caminho relativo simples", () => {
    expect(safeNext("/onboarding", ORIGEM)).toBe("/onboarding");
  });

  it("preserva query string — é o que carrega o token do convite", () => {
    expect(safeNext("/aceitar-convite?token=abc-123", ORIGEM)).toBe(
      "/aceitar-convite?token=abc-123"
    );
  });

  it("recusa URL absoluta de outro site", () => {
    expect(safeNext("https://site-malicioso.com", ORIGEM)).toBeNull();
    expect(safeNext("http://site-malicioso.com/roubo", ORIGEM)).toBeNull();
  });

  it("recusa URL relativa a protocolo — o navegador trata como absoluta", () => {
    // `//site.com` num href leva pra https://site.com. É o disfarce mais comum.
    expect(safeNext("//site-malicioso.com", ORIGEM)).toBeNull();
  });

  it("recusa a variante com barra invertida que alguns navegadores normalizam", () => {
    expect(safeNext("/\\site-malicioso.com", ORIGEM)).toBeNull();
  });

  it("recusa esquemas perigosos", () => {
    expect(safeNext("javascript:alert(1)", ORIGEM)).toBeNull();
    expect(
      safeNext("data:text/html,<script>alert(1)</script>", ORIGEM)
    ).toBeNull();
  });

  it("recusa quando o caminho resolve pra outra origem", () => {
    // Escapes que o parser de URL desfaz e acabam apontando pra fora.
    expect(safeNext("/%2F%2Fsite-malicioso.com", ORIGEM)).not.toBe(
      "//site-malicioso.com"
    );
  });

  it("recusa vazio, nulo e indefinido", () => {
    expect(safeNext("", ORIGEM)).toBeNull();
    expect(safeNext(null, ORIGEM)).toBeNull();
    expect(safeNext(undefined, ORIGEM)).toBeNull();
  });

  it("sem origem informada, ainda exige caminho relativo", () => {
    // É o caso do navegador em teste, sem window. As checagens de prefixo
    // seguram sozinhas.
    expect(safeNext("/ok")).toBe("/ok");
    expect(safeNext("//fora.com")).toBeNull();
    expect(safeNext("https://fora.com")).toBeNull();
  });
});

describe("safeNextOr — destino padrão", () => {
  it("devolve o padrão quando o destino é recusado", () => {
    expect(
      safeNextOr("https://site-malicioso.com", "/onboarding", ORIGEM)
    ).toBe("/onboarding");
    expect(safeNextOr(null, "/onboarding", ORIGEM)).toBe("/onboarding");
  });

  it("devolve o destino quando ele é válido", () => {
    expect(safeNextOr("/aceitar-convite?token=x", "/onboarding", ORIGEM)).toBe(
      "/aceitar-convite?token=x"
    );
  });
});
