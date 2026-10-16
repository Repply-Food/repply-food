"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";

/**
 * Envolve o detalhe do restaurante. No computador (lista + detalhe lado a lado,
 * a partir de `lg`), clicar numa área vazia FORA do detalhe fecha — volta para
 * `/admin`. Clicar em cima de qualquer controle (link, botão, campo) deixa o
 * controle agir: as linhas da lista navegam para outra casa ou, se já aberta,
 * para `/admin` (fechar), e o "Cadastrar" abre o cadastro — sem fechar junto.
 * No celular o detalhe ocupa a tela inteira, então essa regra não vale lá
 * (fechar é o "‹ Restaurantes").
 */
export function DetalheFechavel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoApontarForaDoDetalhe(evento: MouseEvent) {
      const alvo = evento.target as Element | null;
      if (!alvo) return;
      // Só no computador (duas colunas); no celular o detalhe é a tela toda.
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      // Dentro do próprio detalhe: não fecha.
      if (ref.current?.contains(alvo)) return;
      // Em cima de um controle: ele cuida do próprio clique (evita fechar E
      // navegar ao mesmo tempo numa linha da lista ou no "Cadastrar").
      if (alvo.closest("a, button, input, select, textarea, label")) return;
      router.push("/admin");
    }
    document.addEventListener("mousedown", aoApontarForaDoDetalhe);
    return () =>
      document.removeEventListener("mousedown", aoApontarForaDoDetalhe);
  }, [router]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
