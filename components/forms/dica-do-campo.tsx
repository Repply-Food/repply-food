"use client";

import { FormLabel } from "@/components/ui/form";
import { CircleHelp } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

/**
 * Dica "?" discreta ao lado de um rótulo. A explicação aparece ao passar o
 * mouse ou focar pelo teclado (computador) e ao TOCAR (celular, onde não há
 * "passar o mouse"); fecha ao sair do campo (`blur`), tirar o mouse ou apertar
 * Esc. O "?" é um `<button>` de verdade (entra na tabulação sozinho) e o balão
 * é `role="tooltip"` ligado por `aria-describedby`. O alvo de toque chega a
 * ~44px pelo pseudo-elemento `after:` (o desenho continua pequeno).
 *
 * O balão é `absolute` e se ancora na linha do rótulo (que o chamador marca com
 * `relative` — ver `RotuloComDica`): assim ele tem a largura da célula do campo
 * e **nunca vaza a tela no celular**.
 */
export function DicaDoCampo({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const id = useId();

  return (
    <>
      <button
        type="button"
        aria-label={`O que significa "${titulo}"`}
        aria-describedby={aberto ? id : undefined}
        aria-expanded={aberto}
        className="relative inline-flex size-5 shrink-0 items-center justify-center rounded-full text-quiet transition-colors after:absolute after:-inset-[11px] hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onMouseEnter={() => setAberto(true)}
        onMouseLeave={() => setAberto(false)}
        onClick={() => setAberto((visivel) => !visivel)}
        onBlur={() => setAberto(false)}
        onKeyDown={(evento) => {
          if (evento.key === "Escape") setAberto(false);
        }}
      >
        <CircleHelp aria-hidden className="size-4" />
      </button>
      {aberto ? (
        <span
          id={id}
          role="tooltip"
          className="brand-surface absolute left-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border p-2.5 text-sm font-normal text-foreground shadow-lg"
        >
          {children}
        </span>
      ) : null}
    </>
  );
}

/**
 * Rótulo de campo com a dica "?" ao lado. Usa o `FormLabel` (mantém o vínculo
 * com o campo por `htmlFor`) e marca a linha com `relative` para o balão da
 * `DicaDoCampo` se ancorar na largura da célula. Precisa estar dentro de um
 * `FormField`/`FormItem` (como todo `FormLabel`).
 */
export function RotuloComDica({
  label,
  dica,
}: {
  label: string;
  dica: ReactNode;
}) {
  return (
    <div className="relative flex items-center gap-1.5">
      <FormLabel>{label}</FormLabel>
      <DicaDoCampo titulo={label}>{dica}</DicaDoCampo>
    </div>
  );
}
