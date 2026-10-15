"use client";

import { useHidratado } from "@/components/forms/use-hidratado";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

/**
 * Pergunta antes de uma ação séria (trocar ou revogar o token, redefinir a
 * senha, suspender). É um formulário de verdade: `method="post"` e botão
 * desligado até a página carregar (CLAUDE.md §10).
 */
export function Confirmacao({
  texto,
  rotuloConfirmar,
  enviando,
  aoConfirmar,
  aoCancelar,
  children,
}: {
  texto: string;
  rotuloConfirmar: string;
  enviando: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
  children?: ReactNode;
}) {
  const hidratado = useHidratado();
  return (
    <form
      method="post"
      onSubmit={(evento) => {
        evento.preventDefault();
        aoConfirmar();
      }}
      className="flex flex-col gap-3 rounded-xl border p-3"
    >
      <p className="text-sm">{texto}</p>
      {children}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="submit"
          size="toque"
          className="md:h-9 md:text-sm"
          disabled={!hidratado || enviando}
        >
          {enviando ? "Enviando…" : rotuloConfirmar}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="toque"
          className="md:h-9 md:text-sm"
          onClick={aoCancelar}
          disabled={enviando}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
