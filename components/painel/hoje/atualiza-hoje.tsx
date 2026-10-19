"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * O relógio da tela "Hoje": a cada ~1 min pede ao Next para recarregar os dados
 * do servidor (`router.refresh()`), então os números seguem o expediente quase
 * em tempo real sem o dono recarregar a página. Não desenha nada.
 *
 * O intervalo vive no componente (não há `setInterval` de rotina no servidor —
 * isso não funcionaria na Vercel, CLAUDE.md §2); `clearInterval` na saída evita
 * recarga fantasma depois que a tela fecha.
 */
export function AtualizaHoje({ intervaloMs }: { intervaloMs: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervaloMs);
    return () => clearInterval(id);
  }, [router, intervaloMs]);

  return null;
}
