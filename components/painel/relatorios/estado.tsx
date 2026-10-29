import { dataEHoraNaCasa } from "@/lib/admin/datas";
import type { ResultadoDoRelatorio } from "@/lib/relatorios/tipos";
import type { Relatorio } from "@/lib/validators/relatorios";

export function EstadoRelatorio<R extends Relatorio>({
  resultado,
  fuso,
  temFiltros,
}: {
  resultado: ResultadoDoRelatorio<R>;
  fuso: string;
  temFiltros: boolean;
}) {
  const { situacao, cobertura, linhas } = resultado;
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {situacao === "sem_dados" ? (
        <output className="rounded-md border p-3 text-sm">
          A SCC ainda não enviou este relatório para o período
        </output>
      ) : null}
      {situacao === "parcial" ? (
        <output className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <strong className="block">Totais parciais</strong>
          <span className="block">
            Recebidos {cobertura.recebidos} de {cobertura.esperados} dias.
            Faltam: {cobertura.ausentes.join(", ")}.
          </span>
        </output>
      ) : null}
      {cobertura.simulacao ? (
        <p
          role="note"
          className="rounded-md border border-primary/50 bg-primary/10 p-3 text-sm"
        >
          Dados fictícios de demonstração
        </p>
      ) : null}
      {cobertura.capturadoEm ? (
        <p className="text-xs text-quiet">
          Dados capturados em {dataEHoraNaCasa(cobertura.capturadoEm, fuso)}
        </p>
      ) : null}
      {situacao === "completo" && linhas.length === 0 ? (
        <output className="rounded-md border p-3 text-sm">
          {temFiltros
            ? "Sem resultados para os filtros"
            : "Sem movimento no período"}
        </output>
      ) : null}
    </div>
  );
}
