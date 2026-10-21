import { Card, CardContent } from "@/components/ui/card";
import { formatarBRL } from "@/lib/format/dinheiro";
import type { FiltrosResultados } from "@/lib/metricas/resultados/filtros";
import type { DadosDeResultados } from "@/lib/metricas/resultados/tipos";
import { CartaoComparativo } from "./cartao-comparativo";
import { GraficoVendasDiarias } from "./grafico-vendas-diarias";

export function AbaVendas({
  dados,
  filtros,
}: {
  dados: DadosDeResultados;
  filtros: FiltrosResultados;
}) {
  const { resumo } = dados;
  const ocupacao = dados.ocupacao
    .map(
      (item) =>
        `${item.tipo} ${item.participacao === null ? "—" : `${Math.round(item.participacao * 100)}%`}`
    )
    .join(" · ");

  return (
    <div className="grid gap-4 md:grid-cols-3 md:gap-5">
      <Card className="md:col-span-2">
        <CardContent className="flex flex-col gap-1">
          <span className="label-mono text-quiet">Faturamento da casa</span>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="number-mono text-3xl font-bold tracking-tight md:text-4xl">
              {formatarBRL(resumo.faturamento)}
            </span>
            <span className="number-mono text-xs font-bold text-quiet">
              {resumo.variacao.faturamento === null
                ? "—"
                : `${resumo.variacao.faturamento >= 0 ? "▲" : "▼"} ${Math.round(Math.abs(resumo.variacao.faturamento) * 100)}%`}
            </span>
          </div>
          <span className="mt-1 text-xs text-quiet">
            + {formatarBRL(resumo.taxaServico)} de taxa de serviço (fora do
            faturamento)
          </span>
          <GraficoVendasDiarias vendas={dados.vendasDiarias} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:gap-5">
        <CartaoComparativo
          titulo="Contas"
          valor={resumo.contas}
          variacao={resumo.variacao.contas}
        />
        <CartaoComparativo
          titulo="Pessoas"
          valor={resumo.pessoas}
          variacao={resumo.variacao.pessoas}
        />
        <CartaoComparativo
          titulo="Por conta"
          valor={resumo.ticketConta}
          variacao={resumo.variacao.ticketConta}
          dinheiro
        />
        <CartaoComparativo
          titulo="Por pessoa"
          valor={resumo.ticketPessoa}
          variacao={resumo.variacao.ticketPessoa}
          dinheiro
        />
        <Card size="sm" className="col-span-2">
          <CardContent className="flex flex-col gap-1">
            <span className="label-mono text-quiet">Mesa × balcão</span>
            <span className="text-sm font-bold">{ocupacao || "—"}</span>
          </CardContent>
        </Card>
      </div>

      {filtros.atalho === "mes" && dados.meta ? (
        <Card className="md:col-span-3">
          <CardContent className="flex flex-col gap-1">
            <span className="label-mono text-quiet">Meta do mês</span>
            {dados.meta.meta === null ? (
              <span className="text-quiet">sem meta definida</span>
            ) : (
              <>
                <span className="number-mono text-xl font-bold">
                  {dados.meta.andamento === null
                    ? "—"
                    : `${Math.round(dados.meta.andamento * 100)}%`}
                </span>
                {dados.meta.projecaoDisponivel && dados.meta.projecao ? (
                  <span className="text-xs text-quiet">
                    no ritmo atual, fecha em {formatarBRL(dados.meta.projecao)}{" "}
                    (meta {formatarBRL(dados.meta.meta)})
                  </span>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
