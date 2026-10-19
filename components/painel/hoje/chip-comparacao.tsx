import { cn } from "@/lib/utils";
import type { NomeDoDia } from "./formato";

/**
 * O chip de comparação com a média do mesmo dia da semana (metricas.md §4).
 *
 * Cor + seta + texto, nunca só a cor (D-33, CLAUDE.md §8): verde para cima,
 * vermelho para baixo, e o leitor de tela ouve "acima"/"abaixo" junto do
 * número. Sem histórico (variação `null`) não há o que comparar: no lugar do
 * chip, um aviso discreto de que o histórico ainda está sendo juntado.
 */
export function ChipComparacao({
  variacao,
  dia,
  hora,
}: {
  variacao: number | null;
  dia: NomeDoDia;
  /** Quando presente, o chip vira "vs. <dia>s até <hora>" (faturamento). */
  hora?: string;
}) {
  if (variacao === null) {
    return (
      <span className="text-xs text-quiet">
        ainda juntando o histórico das {dia.plural}
      </span>
    );
  }

  const acima = variacao >= 0;
  const porcento = Math.round(Math.abs(variacao) * 100);
  const texto = hora
    ? `${porcento}% vs. ${dia.plural} até ${hora}`
    : `${porcento}%`;

  return (
    <span
      className={cn(
        "number-mono inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
        acima ? "status-success" : "status-danger"
      )}
    >
      <span aria-hidden="true">{acima ? "▲" : "▼"}</span>
      <span className="sr-only">
        {acima ? "acima do normal," : "abaixo do normal,"}
      </span>
      <span>{texto}</span>
    </span>
  );
}
