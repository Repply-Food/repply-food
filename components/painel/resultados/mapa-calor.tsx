import type { DadosDeResultados } from "@/lib/metricas/resultados/tipos";

const dias = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

function formatarMedia(media: number | null) {
  return media === null
    ? "sem dados"
    : `${media.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} contas`;
}

export function MapaCalor({
  mapa,
}: {
  mapa: DadosDeResultados["mapa"];
}) {
  if (mapa.length === 0) {
    return <p className="text-sm text-quiet">Sem movimento no período</p>;
  }

  return (
    <div
      className="flex flex-wrap gap-2"
      aria-label="Mapa de movimento por dia e hora"
    >
      {mapa.map((ponto) => {
        const dia = dias[ponto.diaSemana] ?? "Dia";
        const media = formatarMedia(ponto.mediaContas);
        return (
          <span
            key={`${ponto.diaSemana}-${ponto.hora}`}
            aria-label={`${dia}, ${ponto.hora}h: média de ${media}`}
            className="flex min-w-24 flex-col rounded-md border border-border bg-surface-subtle px-2 py-1 text-xs"
          >
            <strong>{`${dia.slice(0, 3)} · ${ponto.hora}h`}</strong>
            <span className="number-mono text-quiet">{media}</span>
          </span>
        );
      })}
    </div>
  );
}
