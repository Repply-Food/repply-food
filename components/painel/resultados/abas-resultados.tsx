"use client";

import type { FiltrosResultados } from "@/lib/metricas/resultados/filtros";
import { ABAS_RESULTADOS } from "@/lib/metricas/resultados/filtros";
import { cn } from "@/lib/utils";
import { type ReactNode, useState } from "react";

type Aba = FiltrosResultados["aba"];

const rotulos: Record<Aba, string> = {
  vendas: "Vendas",
  horarios: "Horários",
  equipe: "Equipe",
  descontos: "Descontos",
};

/**
 * Abas de Resultados. O servidor manda os quatro painéis já prontos (com os
 * dados do período, que são os mesmos para todas as abas) e a troca acontece
 * AQUI no navegador — instantânea, sem ir ao servidor rebuscar tudo a cada
 * clique. A URL continua refletindo a aba (para link e PDF, D-34), atualizada
 * sem recarregar a página.
 */
export function AbasResultados({
  slug,
  abaInicial,
  paineis,
}: {
  slug: string;
  abaInicial: Aba;
  paineis: Record<Aba, ReactNode>;
}) {
  const [aba, setAba] = useState<Aba>(abaInicial);

  function trocar(proxima: Aba) {
    if (proxima === aba) return;
    setAba(proxima);
    const parametros = new URLSearchParams(window.location.search);
    parametros.set("aba", proxima);
    // Troca a URL sem navegação do Next: nada vai ao servidor.
    window.history.pushState(
      null,
      "",
      `/r/${slug}/resultados?${parametros.toString()}`
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="overflow-x-auto border-b border-border">
        <nav aria-label="Abas de resultados">
          <ul className="flex min-w-max gap-5">
            {ABAS_RESULTADOS.map((a) => {
              const atual = aba === a;
              return (
                <li key={a}>
                  <button
                    type="button"
                    aria-current={atual ? "page" : undefined}
                    onClick={() => trocar(a)}
                    className={cn(
                      "block border-b-2 px-1 py-2 text-sm font-bold",
                      atual
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground"
                    )}
                  >
                    {rotulos[a]}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      {paineis[aba]}
    </div>
  );
}
