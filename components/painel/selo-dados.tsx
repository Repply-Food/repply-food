import type { Selo } from "@/lib/painel/selo";
import { cn } from "@/lib/utils";

const CLASSES_DO_TOM: Record<Selo["tom"], string> = {
  ok: "status-success",
  atencao: "status-warning",
  alerta: "status-danger",
  neutro: "brand-surface text-quiet",
};

/**
 * Selo do vigia: cor + texto, nunca só a cor (CLAUDE.md §8).
 *
 * `compacto` é o do cabeçalho do celular: uma linha só, com o texto curto
 * (`● há 2 min`, como na tela aprovada). O leitor de tela ouve a frase inteira.
 * Sem `compacto` (barra lateral do computador) o texto vai completo e pode
 * quebrar linha dentro do selo, sem cortar.
 */
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
        "number-mono inline-flex text-xs",
        compacto
          ? "shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5"
          : "w-fit max-w-full items-start gap-1.5 rounded-lg px-2.5 py-1",
        CLASSES_DO_TOM[selo.tom]
      )}
    >
      <span aria-hidden="true">●</span>
      {compacto ? (
        <>
          <span aria-hidden="true">{selo.textoCurto}</span>
          <span className="sr-only">{selo.texto}</span>
        </>
      ) : (
        selo.texto
      )}
    </span>
  );
}
