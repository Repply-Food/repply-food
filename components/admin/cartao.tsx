import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Os cartões do detalhe do restaurante (tela aprovada `docs/telas/admin.html`). */
export function Cartao({
  titulo,
  children,
  className,
}: {
  titulo: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-background p-4",
        className
      )}
    >
      <h2 className="label-mono text-quiet">{titulo}</h2>
      {children}
    </section>
  );
}
