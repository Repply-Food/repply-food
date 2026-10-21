"use client";

import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { formatarBRL } from "@/lib/format/dinheiro";
import type { DadosDeResultados } from "@/lib/metricas/resultados/tipos";
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts";

const configuracao = {
  faturamento: { label: "Faturamento", color: "#FF5A1F" },
} satisfies ChartConfig;

export function GraficoVendasDiarias({
  vendas,
}: {
  vendas: DadosDeResultados["vendasDiarias"];
}) {
  const dados = vendas.map((venda) => ({
    dia: new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
      .format(new Date(`${venda.diaOperacao}T12:00:00`))
      .replace(".", ""),
    faturamento: Number(venda.faturamento),
  }));

  return (
    <div role="img" aria-label="Faturamento por dia">
      <ChartContainer config={configuracao} className="h-44 w-full">
        <BarChart accessibilityLayer data={dados} margin={{ top: 8, left: 0 }}>
          <XAxis dataKey="dia" tickLine={false} axisLine={false} />
          <YAxis hide />
          <Tooltip
            cursor={false}
            formatter={(valor) => formatarBRL(String(valor))}
          />
          <Bar
            dataKey="faturamento"
            fill="var(--color-faturamento)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
