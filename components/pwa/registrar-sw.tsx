"use client";

import { iniciarCapturaInstalar } from "@/lib/painel/evento-instalar";
import { useEffect } from "react";

/** Registra o service worker mínimo (só "sem conexão"). Só em produção, para
 *  não deixar um SW preso no navegador de quem desenvolve em localhost.
 *  A captura do "instalar" liga sempre, cedo: o evento do Android dispara uma
 *  vez e se perde se ninguém estiver ouvindo. */
export function RegistrarSW() {
  useEffect(() => {
    iniciarCapturaInstalar();
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
