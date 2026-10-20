export const MARCA_GUIA_VISTO = "rf-guia-tela-inicial-visto";

export function deveMostrarGuia(e: {
  eCelular: boolean;
  appInstalado: boolean;
  jaViu: boolean;
}): boolean {
  return e.eCelular && !e.appInstalado && !e.jaViu;
}

type Ambiente = { eCelular: boolean; appInstalado: boolean; ehIOS: boolean };

/** Lê o ambiente do navegador, com guardas (SSR / sem matchMedia / aba privada).
 *  Celular = tela estreita E ponteiro grosso (dedo): uma janela estreita de
 *  computador não conta (D-40). */
export function detectar(): Ambiente {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return { eCelular: false, appInstalado: false, ehIOS: false };
  }
  const telaDeCelular = !window.matchMedia("(min-width: 1024px)").matches;
  const ponteiroGrosso = window.matchMedia("(pointer: coarse)").matches;
  const nav = navigator as Navigator & {
    standalone?: boolean;
    maxTouchPoints?: number;
    platform?: string;
  };
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true;
  // iPad com iPadOS 13+ se anuncia como "MacIntel" com toque.
  const ehIOS =
    /iphone|ipad|ipod/i.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1);
  return {
    eCelular: telaDeCelular && ponteiroGrosso,
    appInstalado: standalone,
    ehIOS,
  };
}

export function jaViuGuia(): boolean {
  try {
    return localStorage.getItem(MARCA_GUIA_VISTO) === "1";
  } catch {
    return false;
  }
}

export function marcarGuiaVisto(): void {
  try {
    localStorage.setItem(MARCA_GUIA_VISTO, "1");
  } catch {
    // aba privada / storage bloqueado: sem marca, o guia pode reaparecer. Aceito.
  }
}
