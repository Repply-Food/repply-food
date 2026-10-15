"use client";

import { Cartao } from "@/components/admin/cartao";
import { Confirmacao } from "@/components/admin/confirmacao";
import { Button } from "@/components/ui/button";
import { mudarSituacaoAction } from "@/lib/admin/actions";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";
import { useState, useTransition } from "react";
import { toast } from "sonner";

/** Cartão 6 (D-57): suspender ou reativar. Os dados ficam e o SCC continua enviando. */
export function CartaoSituacao({ detalhe }: { detalhe: DetalheDoRestaurante }) {
  const { restaurante } = detalhe;
  const suspenso = restaurante.situacao === "suspenso";
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function mudar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await mudarSituacaoAction(
        restaurante.id,
        suspenso ? "ativo" : "suspenso"
      );
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      toast.success(
        suspenso ? "Restaurante reativado." : "Restaurante suspenso."
      );
      setConfirmando(false);
    });
  }

  return (
    <Cartao titulo="Situação">
      <p className="text-sm">
        {suspenso
          ? "Suspenso: o dono vê o aviso de acesso suspenso."
          : "Ativo: o dono vê o painel."}
      </p>
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
      {confirmando ? (
        <Confirmacao
          texto={
            suspenso
              ? "O dono volta a ver o painel."
              : "O dono deixa de ver o painel e vê o aviso com o WhatsApp da Repply; os dados continuam guardados e o SCC continua enviando."
          }
          rotuloConfirmar={suspenso ? "Reativar" : "Suspender"}
          enviando={enviando}
          aoConfirmar={mudar}
          aoCancelar={() => setConfirmando(false)}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="toque"
          className="w-full sm:w-fit md:h-9 md:text-sm"
          onClick={() => setConfirmando(true)}
        >
          {suspenso ? "Reativar" : "Suspender"}
        </Button>
      )}
    </Cartao>
  );
}
