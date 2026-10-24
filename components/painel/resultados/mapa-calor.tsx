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

/**
 * Cor de "calor" da célula: quanto mais cheia, mais forte o laranja da marca.
 * A cor é só o SEGUNDO canal — o número de contas continua escrito na célula
 * (regra da marca: cor nunca é o único sinal). O tom mais quente é o laranja
 * #ff5a1f com texto quase-preto (--action-fg), a mesma combinação do botão de
 * ação já aprovada no teste de contraste; qualquer tom mais claro contrasta
 * ainda melhor. Escala fixa (não segue o tema): o texto escuro continua
 * legível sobre a célula clara/laranja no tema claro e no escuro.
 */
function corDaCelula(intensidade: number): string {
  const t = 0.12 + 0.88 * Math.min(1, Math.max(0, intensidade));
  const canal = (quente: number) => Math.round(255 + (quente - 255) * t);
  return `rgb(255, ${canal(90)}, ${canal(31)})`;
}

export function MapaCalor({
  mapa,
}: {
  mapa: DadosDeResultados["mapa"];
}) {
  if (mapa.length === 0) {
    return <p className="text-sm text-quiet">Sem movimento no período</p>;
  }

  const maiorMedia = Math.max(
    0,
    ...mapa.map((ponto) => ponto.mediaContas ?? 0)
  );

  return (
    <div
      className="flex flex-wrap gap-2"
      aria-label="Mapa de movimento por dia e hora"
    >
      {mapa.map((ponto) => {
        const dia = dias[ponto.diaSemana] ?? "Dia";
        const media = formatarMedia(ponto.mediaContas);
        const intensidade =
          maiorMedia > 0 ? (ponto.mediaContas ?? 0) / maiorMedia : 0;
        return (
          <span
            key={`${ponto.diaSemana}-${ponto.hora}`}
            aria-label={`${dia}, ${ponto.hora}h: média de ${media}`}
            className="flex min-w-24 flex-col rounded-md border border-border px-2 py-1 text-xs"
            style={{
              backgroundColor: corDaCelula(intensidade),
              color: "var(--action-fg)",
            }}
          >
            <strong>{`${dia.slice(0, 3)} · ${ponto.hora}h`}</strong>
            <span className="number-mono">{media}</span>
          </span>
        );
      })}
    </div>
  );
}
