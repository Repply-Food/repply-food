"use client";

import { Cartao } from "@/components/admin/cartao";
import { Button } from "@/components/ui/button";
import { mudarModuloAction } from "@/lib/admin/actions";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";
import { casaTemModulo } from "@/lib/painel/modulos";
import { useState, useTransition } from "react";
import { toast } from "sonner";

/** Cartão "Módulos": liga/desliga o Mentor de IA nesta casa. Não apaga conversa. */
export function CartaoModulos({ detalhe }: { detalhe: DetalheDoRestaurante }) {
  const { restaurante } = detalhe;
  const ligado = casaTemModulo(restaurante.modulos, "mentor");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function mudar() {
    setErro(null);
    iniciar(async () => {
      const r = await mudarModuloAction(restaurante.id, "mentor", !ligado);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success(ligado ? "Mentor desligado." : "Mentor ligado.");
    });
  }

  return (
    <Cartao titulo="Módulos">
      <p className="text-sm">
        Mentor de IA: <strong>{ligado ? "ligado" : "desligado"}</strong>.{" "}
        {ligado
          ? "O dono vê a aba Mentor e pode conversar."
          : "O dono não vê a aba Mentor."}
      </p>
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="toque"
        className="w-full sm:w-fit md:h-9 md:text-sm"
        disabled={enviando}
        onClick={mudar}
      >
        {ligado ? "Desligar o Mentor" : "Ligar o Mentor"}
      </Button>
    </Cartao>
  );
}
