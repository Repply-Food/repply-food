import { Card, CardContent } from "@/components/ui/card";
import { formatarBRL } from "@/lib/format/dinheiro";
import type { DadosDoHoje } from "@/lib/metricas/tipos";
import { cn } from "@/lib/utils";
import { ChipComparacao } from "./chip-comparacao";
import { CurvaDoDia } from "./curva-do-dia";
import { diaDaSemana, horaCurta } from "./formato";

/**
 * O cartão principal: o faturamento da casa de hoje (sem a taxa, D-14), a
 * comparação com o mesmo dia da semana, a taxa de serviço numa linha à parte e
 * a curva acumulada. Fiel a `docs/telas/hoje.html`.
 */
export function CartaoFaturamento({
  faturamento,
  curva,
  fuso,
  agora,
  horaDeVirada,
  className,
}: {
  faturamento: DadosDoHoje["faturamento"];
  curva: DadosDoHoje["curva"];
  fuso: string;
  agora: Date;
  horaDeVirada: number;
  className?: string;
}) {
  const dia = diaDaSemana(agora, fuso);
  const hora = horaCurta(agora, fuso);
  const temTipico = curva.some((ponto) => ponto.tipico !== null);

  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-1">
        <span className="label-mono text-quiet">
          Faturamento da casa · hoje
        </span>
        <span className="number-mono text-3xl font-bold tracking-tight md:text-4xl">
          {formatarBRL(faturamento.valor)}
        </span>
        <div className="mt-1">
          <ChipComparacao
            variacao={faturamento.variacao}
            dia={dia}
            hora={hora}
          />
        </div>
        <span className="mt-1 text-xs text-quiet">
          {`+ ${formatarBRL(faturamento.taxaServico)} de taxa de serviço (fora do faturamento)`}
        </span>
        <CurvaDoDia
          pontos={curva}
          horaDeVirada={horaDeVirada}
          className="mt-3"
        />
        <div className="mt-1 flex gap-4 text-[0.7rem] text-quiet">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("inline-block h-0.5 w-3.5")}
              style={{ background: "#FF5A1F" }}
            />
            hoje (acumulado)
          </span>
          {temTipico ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-3.5"
                style={{ background: "#A3A3A3" }}
              />
              {`${dia.singular} típica`}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
