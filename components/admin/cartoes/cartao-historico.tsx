import { Cartao } from "@/components/admin/cartao";
import { linhaDoHistorico } from "@/lib/admin/historico";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";

/** Cartão 7: as últimas 30 ações do admin nesta casa (D-59). */
export function CartaoHistorico({
  detalhe,
}: { detalhe: DetalheDoRestaurante }) {
  return (
    <Cartao titulo="Histórico">
      {detalhe.historico.length === 0 ? (
        <p className="text-sm text-quiet">Nenhuma ação registrada ainda.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {detalhe.historico.map((registro) => (
            <li
              key={registro.id}
              className="number-mono text-xs leading-relaxed"
            >
              {linhaDoHistorico(registro, detalhe.restaurante.fuso)}
            </li>
          ))}
        </ol>
      )}
    </Cartao>
  );
}
