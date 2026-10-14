import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        /* Campo é CONTÊINER: retângulo de 10px (`rounded-lg` = --radius), nunca pílula.
           `--input` entra aqui como BORDA, que é o papel novo dele — cinza médio a
           3,4:1 contra o branco, o mínimo que a 1.4.11 do WCAG pede pra contorno de
           componente. No Food ele aponta para `--control-border` (app/globals.css).
           Como preenchimento ele só vale no escuro (`dark:bg-input/30`), onde 30%
           dá um fundo sutil em vez de um bloco cinza.

           Altura: 44px no celular (alvo de toque) e 36px no computador. O texto
           `text-base md:text-sm` continua, para o iPhone não dar zoom no foco. */
        "h-11 md:h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none md:text-sm dark:bg-input/30",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground",
        // Foco: a borda vira laranja escuro (--ring) e sai um halo de 3px.
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        // Desabilitado APAGA (fundo neutro + opacidade). Nunca escurece.
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 dark:disabled:bg-muted",
        // Erro em repouso: borda vermelha cheia + halo fraco.
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive dark:aria-invalid:ring-destructive/40",
        /* Erro COM FOCO. Sem esta linha o campo com erro fica sem indicador de foco
           nenhum: no Tailwind a variante `aria-invalid` é emitida DEPOIS da
           `focus-visible`, então ela sobrescrevia tanto a borda quanto o anel. A
           variante empilhada é emitida por último e devolve o foco. O anel continua
           vermelho de propósito — quem diz "erro" é a cor, quem diz "foco" é a
           intensidade, e assim o daltônico não perde nenhum dos dois sinais. */
        "aria-invalid:focus-visible:ring-destructive/50 dark:aria-invalid:focus-visible:ring-destructive/70",
        className
      )}
      {...props}
    />
  );
}

export { Input };
