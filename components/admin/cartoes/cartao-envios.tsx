import { Cartao } from "@/components/admin/cartao";
import { momentoNaCasa } from "@/lib/admin/datas";
import {
  camposNovosDoEnvio,
  detalheDoEnvio,
  envioOk,
} from "@/lib/admin/envios";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";
import { cn } from "@/lib/utils";

/** Cartão 4: os 20 envios mais recentes, com os erros e os campos novos (D-51). */
export function CartaoEnvios({ detalhe }: { detalhe: DetalheDoRestaurante }) {
  const { envios, restaurante } = detalhe;
  const agora = new Date(detalhe.agoraIso);
  return (
    <Cartao titulo="Últimos envios">
      {envios.length === 0 ? (
        <p className="text-sm text-quiet">Nenhum envio ainda.</p>
      ) : (
        <ol className="flex flex-col divide-y">
          {envios.map((envio) => {
            const ok = envioOk(envio);
            const camposNovos = camposNovosDoEnvio(envio);
            return (
              <li key={envio.id} className="flex flex-col gap-1 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="number-mono">
                    {momentoNaCasa(envio.recebidoEm, agora, restaurante.fuso)}
                  </span>
                  <span
                    className={cn(
                      "number-mono rounded-full px-2 py-0.5 text-xs",
                      ok ? "status-success" : "status-danger"
                    )}
                  >
                    {ok ? "ok" : "erro"}
                  </span>
                </div>
                <p className="number-mono text-xs text-quiet">
                  {detalheDoEnvio(envio)}
                </p>
                {camposNovos ? <p className="text-xs">{camposNovos}</p> : null}
              </li>
            );
          })}
        </ol>
      )}
    </Cartao>
  );
}
