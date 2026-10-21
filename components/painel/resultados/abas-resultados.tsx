import type { FiltrosResultados } from "@/lib/metricas/resultados/filtros";
import { ABAS_RESULTADOS } from "@/lib/metricas/resultados/filtros";
import { cn } from "@/lib/utils";
import Link from "next/link";

const rotulos = {
  vendas: "Vendas",
  horarios: "Horários",
  equipe: "Equipe",
  descontos: "Descontos",
} as const;

export function AbasResultados({
  filtros,
  slug,
}: {
  filtros: FiltrosResultados;
  slug: string;
}) {
  return (
    <div className="overflow-x-auto border-b border-border">
      <div
        role="tablist"
        aria-label="Resultados"
        className="flex min-w-max gap-5"
      >
        {ABAS_RESULTADOS.map((aba) => {
          const parametros = new URLSearchParams(filtros.query);
          parametros.set("aba", aba);
          const atual = filtros.aba === aba;
          return (
            <Link
              key={aba}
              role="tab"
              aria-selected={atual}
              href={`/r/${slug}/resultados?${parametros.toString()}`}
              className={cn(
                "border-b-2 px-1 py-2 text-sm font-bold",
                atual
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground"
              )}
            >
              {rotulos[aba]}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
