"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatarBRL } from "@/lib/format/dinheiro";
import type { ContaEsquecida } from "@/lib/metricas/tipos";
import { useState } from "react";
import { duracaoDaConta } from "./formato";

const VISIVEIS = 3;

/** "Mesa 12" quando há código do cartão/mesa; senão a conta pelo código. */
function nomeDaConta(conta: ContaEsquecida): string {
  return conta.mesa === null ? `Conta ${conta.cod}` : `Mesa ${conta.mesa}`;
}

/**
 * O alerta das contas abertas há mais que o limite da casa (M04, D-33). Mostra
 * no máximo três; o resto fica atrás de "ver todas (N)". Acento âmbar de
 * atenção (nunca laranja, que é só da marca e da linha de hoje — D-33): a
 * frase do título carrega o sentido, a cor só reforça.
 *
 * O quadro só existe quando há conta esquecida (a página não o monta vazio);
 * sem ele, a meta sobe para este lugar.
 */
export function ContasEsquecidas({
  contas,
  limiteTexto,
}: {
  contas: ContaEsquecida[];
  limiteTexto: string;
}) {
  const [expandido, setExpandido] = useState(false);
  const total = contas.length;
  const plural = total > 1;
  const visiveis = expandido ? contas : contas.slice(0, VISIVEIS);

  return (
    <Card className="border-l-4" style={{ borderLeftColor: "var(--warning)" }}>
      <CardContent className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">
          {`${total} ${plural ? "contas abertas" : "conta aberta"} há mais de ${limiteTexto}`}
        </h2>
        <ul className="flex flex-col">
          {visiveis.map((conta) => (
            <li
              key={conta.cod}
              className="number-mono flex justify-between gap-4 py-1 text-sm"
            >
              <span>{`${nomeDaConta(conta)} · ${duracaoDaConta(conta.abertaHa)}`}</span>
              <span>{formatarBRL(conta.valor)}</span>
            </li>
          ))}
        </ul>
        {total > VISIVEIS ? (
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            className="w-fit text-sm font-medium underline underline-offset-4"
          >
            {expandido ? "ver menos ▴" : `ver todas (${total}) ▾`}
          </button>
        ) : null}
      </CardContent>
    </Card>
  );
}
