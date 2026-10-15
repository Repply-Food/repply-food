"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Copia o texto para a área de transferência. Se o navegador recusar (página
 * sem HTTPS, permissão negada), mostra o texto num campo para copiar à mão.
 */
export function BotaoCopiar({
  rotulo,
  texto,
}: {
  rotulo: string;
  texto: string;
}) {
  const [estado, setEstado] = useState<"pronto" | "copiado" | "falhou">(
    "pronto"
  );

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("copiado");
      toast.success("Copiado.");
    } catch {
      setEstado("falhou");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="toque"
        className="md:h-9 md:text-sm"
        onClick={copiar}
      >
        {estado === "copiado" ? `${rotulo} ✓` : rotulo}
      </Button>
      {estado === "falhou" ? (
        <label className="flex flex-col gap-1 text-xs">
          Não deu para copiar sozinho. Selecione o texto e copie:
          <textarea
            readOnly
            value={texto}
            rows={Math.min(10, texto.split("\n").length + 1)}
            onFocus={(evento) => evento.currentTarget.select()}
            className="number-mono rounded-lg border border-input bg-background p-2 text-xs"
          />
        </label>
      ) : null}
    </div>
  );
}
