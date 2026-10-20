"use client";

import { useEffect } from "react";

/** Registra o service worker mínimo (só "sem conexão"). Só em produção, para
 *  não deixar um SW preso no navegador de quem desenvolve em localhost. */
export function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
