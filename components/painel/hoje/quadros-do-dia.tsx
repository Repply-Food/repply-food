import { Card, CardContent } from "@/components/ui/card";
import { formatarBRL } from "@/lib/format/dinheiro";
import type { DadosDoHoje } from "@/lib/metricas/tipos";
import type { ReactNode } from "react";
import { ChipComparacao } from "./chip-comparacao";
import { diaDaSemana } from "./formato";

function Quadro({
  rotulo,
  numero,
  children,
}: {
  rotulo: string;
  numero: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-0.5">
        <span className="label-mono text-quiet">{rotulo}</span>
        <span className="number-mono text-lg font-bold tracking-tight md:text-xl">
          {numero}
        </span>
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Os três quadros do dia: mesas abertas, pessoas na casa e gasto por pessoa.
 * No celular ficam lado a lado (o importante antes do "fold"); no computador
 * empilham na coluna ao lado da curva. Divisão por zero no por-pessoa vira "—"
 * (metricas.md §1), nunca "R$ 0,00".
 */
export function QuadrosDoDia({
  mesas,
  porPessoa,
  fuso,
  agora,
}: {
  mesas: DadosDoHoje["mesasAbertas"];
  porPessoa: DadosDoHoje["porPessoa"];
  fuso: string;
  agora: Date;
}) {
  const dia = diaDaSemana(agora, fuso);

  return (
    <div className="grid grid-cols-3 gap-3 md:grid-cols-1 md:gap-4">
      <Quadro rotulo="Mesas abertas" numero={mesas.quantidade}>
        <span className="text-xs text-quiet">
          {`${formatarBRL(mesas.valorEmAberto)} em aberto`}
        </span>
      </Quadro>
      <Quadro rotulo="Pessoas" numero={mesas.pessoasNaCasa}>
        <span className="text-xs text-quiet">na casa</span>
      </Quadro>
      <Quadro
        rotulo="Por pessoa"
        numero={porPessoa.valor === null ? "—" : formatarBRL(porPessoa.valor)}
      >
        {porPessoa.valor === null ? null : (
          <ChipComparacao variacao={porPessoa.variacao} dia={dia} />
        )}
      </Quadro>
    </div>
  );
}
