import { detectar, deveMostrarGuia } from "@/lib/painel/guia-instalar";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("deveMostrarGuia", () => {
  it("mostra no celular, fora do app, não visto", () => {
    expect(
      deveMostrarGuia({ eCelular: true, appInstalado: false, jaViu: false })
    ).toBe(true);
  });
  it("NÃO mostra no computador", () => {
    expect(
      deveMostrarGuia({ eCelular: false, appInstalado: false, jaViu: false })
    ).toBe(false);
  });
  it("NÃO mostra dentro do app instalado", () => {
    expect(
      deveMostrarGuia({ eCelular: true, appInstalado: true, jaViu: false })
    ).toBe(false);
  });
  it("NÃO mostra se já visto neste aparelho", () => {
    expect(
      deveMostrarGuia({ eCelular: true, appInstalado: false, jaViu: true })
    ).toBe(false);
  });
});

function fingir({
  largo,
  grosso,
  standalone,
  ua,
  platform,
  touch,
}: {
  largo: boolean;
  grosso: boolean;
  standalone?: boolean;
  ua?: string;
  platform?: string;
  touch?: number;
}) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("min-width")
      ? largo
      : q.includes("pointer: coarse")
        ? grosso
        : q.includes("display-mode: standalone")
          ? Boolean(standalone)
          : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("navigator", {
    userAgent: ua ?? "Mozilla/5.0",
    platform: platform ?? "Win32",
    maxTouchPoints: touch ?? 0,
    standalone: standalone === true ? true : undefined,
  });
}

describe("detectar", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("computador: tela larga não é celular", () => {
    fingir({ largo: true, grosso: false });
    expect(detectar().eCelular).toBe(false);
  });
  it("janela estreita no computador (ponteiro fino) não é celular", () => {
    fingir({ largo: false, grosso: false });
    expect(detectar().eCelular).toBe(false);
  });
  it("celular: tela estreita + ponteiro grosso", () => {
    fingir({ largo: false, grosso: true });
    expect(detectar().eCelular).toBe(true);
  });
  it("app instalado via display-mode standalone", () => {
    fingir({ largo: false, grosso: true, standalone: true });
    expect(detectar().appInstalado).toBe(true);
  });
  it("iPhone pelo user agent", () => {
    fingir({ largo: false, grosso: true, ua: "Mozilla/5.0 (iPhone)" });
    expect(detectar().ehIOS).toBe(true);
  });
  it("iPad moderno (MacIntel com toque) é iOS", () => {
    fingir({ largo: false, grosso: true, platform: "MacIntel", touch: 5 });
    expect(detectar().ehIOS).toBe(true);
  });
});
