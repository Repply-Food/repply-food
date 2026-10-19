"use client";

/**
 * A curva do dia: o faturamento acumulado de hoje (laranja, cheia) contra o
 * "dia típico" do mesmo dia da semana (cinza, tracejada). Tela aprovada:
 * `docs/telas/hoje.html`, D-33.
 *
 * O QUE ESTE COMPONENTE NÃO FAZ: calcular. Cada ponto já vem da função SQL
 * `metrica_curva_do_dia` (CLAUDE.md §5). Aqui a string do dinheiro vira
 * `number` só para o Recharts posicionar o ponto no desenho; nenhum valor
 * mostrado ao dono sai dessa conversão.
 *
 * TRÊS ESTADOS QUE O DADO TRAZ, E O QUE A CURVA FAZ COM CADA UM:
 * - `hoje` null (faixa depois de agora): o futuro não se desenha. A linha de
 *   hoje termina no ponto de agora, marcado com um círculo e uma régua fina;
 * - `tipico` null em todas as faixas (menos de 2 ocorrências do dia da semana):
 *   a linha cinza some, e o rótulo acessível diz que falta histórico em vez de
 *   prometer uma comparação que não está na tela;
 * - nenhuma faixa de hoje com valor (lista vazia ou casa ainda sem leitura): só
 *   a base do gráfico, sem ponto de agora.
 *
 * COR: laranja é a linha de hoje e a marca, nada mais (CLAUDE.md §8). As cores
 * moram no `ChartConfig` e chegam às linhas como `var(--color-hoje)` e
 * `var(--color-tipico)`, publicadas pelo `ChartContainer`.
 */

import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import type { PontoDaCurva } from "@/lib/metricas/tipos";
import { cn } from "@/lib/utils";
import {
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

const chartConfig = {
  hoje: { label: "Hoje (acumulado)", color: "#FF5A1F" },
  tipico: { label: "Dia típico", color: "#A3A3A3" },
} satisfies ChartConfig;

/** Rótulos do eixo: de 6 em 6 horas desde a virada (0, 360, 720, 1080 min). */
const MINUTOS_DOS_ROTULOS = [0, 360, 720, 1080];

type PontoPlotado = {
  minuto: number;
  hoje: number | null;
  tipico: number | null;
};

function paraNumero(valor: string | null): number | null {
  return valor === null ? null : Number(valor);
}

function plotar(pontos: PontoDaCurva[]): PontoPlotado[] {
  return pontos.map((ponto) => ({
    minuto: ponto.minuto,
    hoje: paraNumero(ponto.hoje),
    tipico: paraNumero(ponto.tipico),
  }));
}

/** O último ponto de hoje com valor: onde a curva está "agora". */
function pontoDeAgora(pontos: PontoPlotado[]) {
  let agora: { minuto: number; hoje: number } | null = null;
  for (const ponto of pontos) {
    if (ponto.hoje !== null) {
      agora = { minuto: ponto.minuto, hoje: ponto.hoje };
    }
  }
  return agora;
}

/** Hora do relógio (0 a 23) de `minuto` minutos depois da virada. */
export function rotuloDaHora(minuto: number, horaDeVirada: number): string {
  return `${(horaDeVirada + Math.floor(minuto / 60)) % 24}h`;
}

export function CurvaDoDia({
  pontos,
  horaDeVirada,
  className,
}: {
  pontos: PontoDaCurva[];
  /**
   * Hora da virada do dia da casa (0 a 23). Com ela o eixo ganha horas do
   * relógio (5h, 11h, 17h, 23h); sem ela o eixo fica escondido, porque
   * `minuto` conta desde a virada e não diz que horas são.
   */
  horaDeVirada?: number;
  className?: string;
}) {
  const dados = plotar(pontos);
  const agora = pontoDeAgora(dados);
  const temTipico = dados.some((ponto) => ponto.tipico !== null);
  const rotulos = MINUTOS_DOS_ROTULOS.filter((minuto) =>
    dados.some((ponto) => ponto.minuto === minuto)
  );

  return (
    <ChartContainer
      config={chartConfig}
      role="img"
      aria-label={
        temTipico
          ? "Curva acumulada de hoje contra o dia típico"
          : "Curva acumulada de hoje, ainda sem histórico para o dia típico"
      }
      className={cn("aspect-[280/128] w-full md:aspect-[560/150]", className)}
    >
      <LineChart
        data={dados}
        accessibilityLayer={false}
        margin={{ top: 6, right: 8, bottom: 0, left: 8 }}
      >
        <XAxis
          type="number"
          dataKey="minuto"
          domain={["dataMin", "dataMax"]}
          ticks={rotulos}
          tickFormatter={(minuto: number) =>
            rotuloDaHora(minuto, horaDeVirada ?? 0)
          }
          hide={horaDeVirada === undefined}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          fontSize={10}
          fontFamily="var(--font-mono)"
        />
        {/* Sem eixo vertical (a tela aprovada não tem). O teto nunca é zero,
            para uma casa que ainda não vendeu não gerar escala vazia. */}
        <YAxis
          hide
          domain={[0, (maximo: number) => (maximo > 0 ? maximo : 1)]}
        />
        <ReferenceLine y={0} stroke="var(--color-border)" />
        {agora && (
          <ReferenceLine
            x={agora.minuto}
            stroke="var(--color-hoje)"
            strokeOpacity={0.25}
          />
        )}
        {/* O dia típico vai primeiro: a linha de hoje é desenhada por cima. */}
        {temTipico && (
          <Line
            dataKey="tipico"
            type="linear"
            stroke="var(--color-tipico)"
            strokeWidth={1.6}
            strokeDasharray="4 3"
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        )}
        <Line
          dataKey="hoje"
          type="linear"
          stroke="var(--color-hoje)"
          strokeWidth={2.4}
          dot={false}
          activeDot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
        {agora && (
          <ReferenceDot
            x={agora.minuto}
            y={agora.hoje}
            r={3.5}
            fill="var(--color-hoje)"
            stroke="none"
          />
        )}
      </LineChart>
    </ChartContainer>
  );
}
