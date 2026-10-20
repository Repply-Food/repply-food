"use client";

import { useHidratado } from "@/components/forms/use-hidratado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarTurnosAction } from "@/lib/painel/ajustes-actions";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

export function SecaoTurnos({
  slug,
  almocoAteInicial,
  somenteLeitura,
}: {
  slug: string;
  almocoAteInicial: string;
  somenteLeitura: boolean;
}) {
  const router = useRouter();
  const idCampo = useId();
  const hidratado = useHidratado();
  const [salvando, iniciarSalvar] = useTransition();
  const [almocoAte, setAlmocoAte] = useState(almocoAteInicial);

  function salvar() {
    iniciarSalvar(async () => {
      const r = await salvarTurnosAction(slug, almocoAte);
      if (r.ok) {
        toast.success("Turnos salvos.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <section className="brand-surface flex flex-col gap-4 rounded-lg p-4">
      <h2 className="text-lg font-semibold">Turnos</h2>
      <div className="flex flex-col gap-1">
        <label htmlFor={idCampo} className="text-sm text-quiet">
          Almoço até
        </label>
        <Input
          id={idCampo}
          type="time"
          value={almocoAte}
          disabled={somenteLeitura}
          onChange={(e) => setAlmocoAte(e.target.value)}
        />
      </div>
      <p className="text-sm text-quiet">
        Antes desse horário conta como almoço; depois, como jantar. Usado na
        tela Resultados.
      </p>
      {somenteLeitura ? null : (
        <Button
          type="button"
          size="toque"
          disabled={!hidratado || salvando}
          onClick={salvar}
        >
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
      )}
    </section>
  );
}
