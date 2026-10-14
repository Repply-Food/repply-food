import type { Selo } from "@/lib/painel/selo";
import { cn } from "@/lib/utils";

const CLASSES_DO_TOM: Record<Selo["tom"], string> = {
  ok: "status-success",
  atencao: "status-warning",
  alerta: "status-danger",
  neutro: "brand-surface text-quiet",
};

/** Selo do vigia: cor + texto, nunca só a cor (CLAUDE.md §8). */
export function SeloDados({
  selo,
  compacto = false,
}: {
  selo: Selo;
  compacto?: boolean;
}) {
  return (
    <span
      className={cn(
        "number-mono inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
        compacto && "px-2 py-0.5",
        CLASSES_DO_TOM[selo.tom]
      )}
    >
      <span aria-hidden="true">●</span>
      {selo.texto}
    </span>
  );
}
