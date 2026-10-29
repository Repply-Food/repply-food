"use client";

import { cn } from "@/lib/utils";
import { ChartColumn, LayoutDashboard, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { tela: "hoje", rotulo: "Hoje", Icone: LayoutDashboard },
  { tela: "resultados", rotulo: "Resultados", Icone: ChartColumn },
  { tela: "ajustes", rotulo: "Ajustes", Icone: Settings },
] as const;

/**
 * Hoje · Resultados · Ajustes. "lateral" é a barra escura do computador;
 * "inferior" é o menu fixo do celular (alvos de 56 px). A tela atual vai em
 * negrito, com o traço laranja e `aria-current`: não só a cor.
 */
export function MenuPainel({
  slug,
  variante,
}: {
  slug: string;
  variante: "lateral" | "inferior";
}) {
  const caminho = usePathname();
  return (
    <nav
      aria-label="Telas da casa"
      className={variante === "inferior" ? "w-full" : undefined}
    >
      <ul
        className={
          variante === "inferior" ? "grid grid-cols-3" : "flex flex-col gap-1"
        }
      >
        {ITENS.map(({ tela, rotulo, Icone }) => {
          const href = `/r/${slug}/${tela}`;
          const atual =
            caminho === href ||
            caminho.startsWith(`${href}/`) ||
            (tela === "resultados" &&
              (caminho === `/r/${slug}/relatorios` ||
                caminho.startsWith(`/r/${slug}/relatorios/`)));
          return (
            <li key={tela}>
              <Link
                href={href}
                aria-current={atual ? "page" : undefined}
                className={cn(
                  variante === "inferior"
                    ? "flex h-14 flex-col items-center justify-center gap-1 border-t-2 border-transparent text-xs"
                    : "flex h-10 items-center gap-3 rounded-md border-l-2 border-transparent px-3 text-sm",
                  atual
                    ? "border-primary font-bold text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <Icone aria-hidden="true" className="size-5" />
                {rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
