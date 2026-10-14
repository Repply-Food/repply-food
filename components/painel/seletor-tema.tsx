"use client";

import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const OPCOES = [
  { valor: "light", rotulo: "Claro" },
  { valor: "dark", rotulo: "Escuro" },
] as const;

/**
 * Claro (padrão) ou escuro (D-12). O tema escolhido só é lido depois de
 * montar no navegador: no servidor ele é desconhecido, e desenhar o botão
 * marcado antes disso faria o servidor e o navegador discordarem.
 */
export function SeletorTema() {
  const { theme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: grupo de botões de alternância com `aria-label`; o <fieldset> traria borda, largura mínima e legenda do navegador.
      role="group"
      aria-label="Tema"
      className="inline-flex rounded-md border p-1"
    >
      {OPCOES.map(({ valor, rotulo }) => {
        const ativo = montado && (theme ?? "light") === valor;
        return (
          <button
            key={valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => setTheme(valor)}
            className={cn(
              "h-11 min-w-20 rounded px-3 text-sm md:h-9",
              ativo ? "brand-action font-bold" : "text-muted-foreground"
            )}
          >
            {rotulo}
          </button>
        );
      })}
    </div>
  );
}
