"use client";

import { Cartao } from "@/components/admin/cartao";
import { useHidratado } from "@/components/forms/use-hidratado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pedirReenvioAction } from "@/lib/admin/actions";
import { diaCurto, hojeNaCasa } from "@/lib/admin/datas";
import {
  DIAS_MAXIMOS_DO_REENVIO,
  primeiroDiaDoReenvio,
  problemaNoReenvio,
} from "@/lib/admin/schemas";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";
import { type FormEvent, useId, useState, useTransition } from "react";
import { toast } from "sonner";

/**
 * Cartão 5 (contrato §8): o SCC manda de novo tudo desde a data, na resposta
 * ao próximo envio. O banco limpa o pedido sozinho quando o reenvio começa.
 */
export function CartaoReenvio({ detalhe }: { detalhe: DetalheDoRestaurante }) {
  const { restaurante } = detalhe;
  const hoje = hojeNaCasa(new Date(detalhe.agoraIso), restaurante.fuso);
  const idDoCampo = useId();
  const hidratado = useHidratado();
  const [desde, setDesde] = useState(hoje);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function pedir(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const problema = problemaNoReenvio(desde, hoje);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    iniciar(async () => {
      const resultado = await pedirReenvioAction(restaurante.id, { desde });
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      toast.success(
        "Pedido de reenvio registrado. Vai na próxima resposta ao SCC."
      );
    });
  }

  return (
    <Cartao titulo="Pedir reenvio">
      {restaurante.pedidoReenvioDesde ? (
        <output className="brand-surface block rounded-lg p-3 text-sm">
          {`Pedido de reenvio desde ${diaCurto(restaurante.pedidoReenvioDesde)}, aguardando o SCC.`}
        </output>
      ) : null}
      <p className="text-sm text-quiet">
        {`O SCC manda de novo tudo desde a data escolhida. Até ${DIAS_MAXIMOS_DO_REENVIO} dias para trás.`}
      </p>
      <form
        method="post"
        onSubmit={pedir}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        noValidate
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={idDoCampo}>Desde</Label>
          <Input
            id={idDoCampo}
            type="date"
            min={primeiroDiaDoReenvio(hoje)}
            max={hoje}
            value={desde}
            onChange={(evento) => setDesde(evento.target.value)}
          />
        </div>
        <Button
          type="submit"
          size="toque"
          className="md:h-9 md:text-sm"
          disabled={!hidratado || enviando}
        >
          {enviando ? "Enviando…" : "Pedir reenvio"}
        </Button>
      </form>
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
    </Cartao>
  );
}
