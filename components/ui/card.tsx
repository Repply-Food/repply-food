/**
 * Card — o contêiner do sistema.
 *
 * DUAS DECISÕES DE MARCA MORAM AQUI:
 *
 * 1. RAIO. A marca separa forma por função: pílula = clicável, retângulo de
 *    10–16px = contêiner. O card é contêiner, então usa `--radius-card` (14px)
 *    pela classe `rounded-card`. Não trocar por `rounded-full` nem por um raio
 *    solto: o dia em que card e botão tiverem a mesma forma, a hierarquia
 *    "o que eu clico × o que eu leio" desaparece da tela inteira.
 *
 * 2. CONTORNO É `border`, NÃO `ring`. O template desenhava `ring-1
 *    ring-foreground/10`. O problema: `ring` do Tailwind é implementado como
 *    `box-shadow`, e qualquer `box-shadow` custom — `glow-brand-lg`,
 *    `glow-brand-hover`, `surface-highlight` — SOBRESCREVE a propriedade
 *    inteira e apaga o anel junto. É por isso que no `kpi-card` o contorno
 *    some no instante em que o brilho entra. `border` mora em outra
 *    propriedade e convive com o glow sem disputar.
 *
 *    Efeito colateral bem-vindo: dois consumidores já passam
 *    `className="border-destructive/30"` esperando um contorno vermelho
 *    (settings/organization e connect-cloud-dialog). Como o card não tinha
 *    largura de borda, essas classes só pintavam uma borda de 0px — o aviso
 *    nunca apareceu. Com `border` na base, elas voltam a funcionar, e o
 *    `twMerge` do `cn` garante que a cor do consumidor vença a da base.
 *
 * CONTRASTE. Com a paleta correta o card é BRANCO (#FFFFFF) sobre canvas
 * #FAFAFA — 1.02:1, ou seja, fundo nenhum. Quem separa o card da página é a
 * borda, medida em 1.26:1 contra o card e 1.20:1 contra o canvas. É pouco em
 * termos absolutos, mas é o `--border` do sistema e é o que existe: sem ela o
 * card literalmente não tem limite. Por isso a borda não é opcional aqui.
 */
import type * as React from "react";

import { cn } from "@/lib/utils";

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        // `has-[>.rule-header]:pt-0` — a faixa de cabeçalho tem que ENCOSTAR no topo.
        // O card tem `py-4`, então uma faixa com fundo próprio começava 17px abaixo
        // da borda e ficava boiando, com um filete do fundo do card acima dela.
        // Medido em 42 usos, 26 arquivos. O defeito já existia antes do redesign —
        // o preenchimento antigo era quase invisível e ninguém enxergava. Consertar
        // aqui evita repetir `py-0` em 26 lugares e esquecer no 27º.
        "group/card flex flex-col gap-4 overflow-hidden rounded-card border border-border bg-card py-4 text-sm text-card-foreground has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 has-[>.rule-header]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-[>.rule-header]:pt-0 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-card *:[img:last-child]:rounded-b-card",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-card px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-card border-t bg-surface-subtle p-4 group-data-[size=sm]/card:p-3",
        className
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
