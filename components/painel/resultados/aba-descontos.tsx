import { Card, CardContent } from "@/components/ui/card";
import { formatarBRL } from "@/lib/format/dinheiro";
import type { DadosDeResultados } from "@/lib/metricas/resultados/tipos";

function nomeOperador(codigo: number | null) {
  return codigo === null ? "Sem operador" : `Operador ${codigo}`;
}

export function AbaDescontos({ dados }: { dados: DadosDeResultados }) {
  const semMovimento = dados.resumo.contas === 0;

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-5">
      <Card>
        <CardContent className="flex flex-col gap-1">
          <span className="label-mono text-quiet">Descontos no período</span>
          {semMovimento ? (
            <p className="text-sm text-quiet">Sem movimento no período</p>
          ) : (
            <>
              <strong className="number-mono text-2xl">
                {formatarBRL(dados.resumo.descontosTotal)}
              </strong>
              {dados.resumo.percentualDescontos !== null ? (
                <span className="text-xs text-quiet">
                  {dados.resumo.percentualDescontos.toLocaleString("pt-BR", {
                    style: "percent",
                    maximumFractionDigits: 1,
                  })}{" "}
                  do faturamento
                </span>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <span className="label-mono text-quiet">
            Por operador de fechamento
          </span>
          {dados.descontos.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {dados.descontos.map((desconto, indice) => (
                <li
                  key={`${desconto.codOperadorFechamento ?? "sem"}-${indice}`}
                  className="flex items-center justify-between gap-3 border-b pb-2 last:border-0 last:pb-0"
                >
                  <span>{nomeOperador(desconto.codOperadorFechamento)}</span>
                  <strong className="number-mono">
                    {formatarBRL(desconto.descontos)}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-quiet">
              {semMovimento
                ? "Sem movimento no período"
                : "Sem descontos no período"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
