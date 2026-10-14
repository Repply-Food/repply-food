import type * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Mesma forma e mesma borda do Input — os dois são o mesmo contêiner.
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        /* O campo desabilitado era preenchido com o token de limite de campo (a 50%
           no claro, 80% no escuro). Com o valor novo desse token isso virava cinza
           MÉDIO no claro — mais escuro que o campo normal, o oposto de "apagado" — e
           cinza claro no escuro, mais aceso que o card. Agora segue o Input: fundo
           neutro + opacidade. */
        "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 dark:disabled:bg-muted",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive dark:aria-invalid:ring-destructive/40",
        // Foco visível também quando o campo está com erro. Ver comentário no Input.
        "aria-invalid:focus-visible:ring-destructive/50 dark:aria-invalid:focus-visible:ring-destructive/70",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
