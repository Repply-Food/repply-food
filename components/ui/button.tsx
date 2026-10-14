import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

/* -----------------------------------------------------------------------------
   BOTÃO = RETÂNGULO DE 10 PX
   -----------------------------------------------------------------------------
   Vindo do Repply Imob, onde o botão é pílula (`rounded-full`). No repply food.
   o botão é um retângulo de 10 px com texto em negrito, como nas telas
   aprovadas (`docs/telas/estilo.css`, classe `.rf-btn`): a pílula é marca do
   Imob, não do Food.

   O raio mora SÓ aqui, na base. Os tamanhos `xs`, `sm`, `icon-xs` e `icon-sm`
   não reescrevem o raio por conta própria; trocar a base muda todos de uma vez.

   O tamanho `toque` tem 44 px de altura: é o alvo de toque mínimo no celular.
----------------------------------------------------------------------------- */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-bold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /* `hover:bg-primary-hover` no lugar de `[a]:hover:bg-primary/80`:
           · o `[a]:` compilava pra `:is(a):hover`, ou seja, o hover só existia
             quando o botão era um link. Um <button> primário — o CTA mais
             clicado do sistema — não tinha NENHUM retorno de hover.
           · o `/80` era translucidez: a cor final mudava conforme o fundo atrás.
             O token é o #E54A12 do brandbook, estável em qualquer superfície.

           O brilho no hover é do Imob e não veio para o Food. */
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        /* O laranja saiu do TEXTO e foi pro SUBLINHADO. `text-primary` em corpo
           de 14px media 2.99:1 sobre o canvas e 3.12:1 sobre o card — reprova o
           4.5:1 do WCAG AA. Com `text-foreground` o mesmo texto vai a 18.97:1 /
           19.80:1, e a ênfase continua sendo laranja, só que numa forma gráfica
           (que precisa de 3:1, não de 4.5:1).

           O sublinhado é PERMANENTE, não `hover:underline`. Tirado o laranja do
           texto, o hover era a única coisa que distinguia o link do texto ao
           redor — e affordance que só existe no hover não chega a quem usa
           teclado ou toque (WCAG 1.4.1).

           O tom é `primary-hover` (#E54A12 no claro), não `primary`: o #FF5A1F
           dá 2.99:1 sobre o canvas, um fio abaixo dos 3:1. É a mesma medição que
           já obrigou o `--ring` a usar o laranja escuro. Assim o traço fica em
           3.78:1 no claro e 6.35:1 no escuro. O hover engrossa o traço em vez de
           mudar a cor — feedback sem regredir nenhum número. */
        link: "text-foreground underline decoration-primary-hover underline-offset-4 hover:decoration-2",
      },
      /* Respiro horizontal ≈ metade da altura (herdado do Imob, onde a borda
         curva da pílula "come" a extremidade do texto).
             xs  24px de altura → 12px  ·  sm  28px → 14px
             default 32px       → 16px  ·  lg  36px → 20px
         O `lg` passa um pouco da metade porque é o CTA de destaque.

         O par `has-data-[icon=…]` continua tirando ~4px do lado que tem ícone:
         ícone é uma forma compacta e não precisa do mesmo afastamento que a
         extremidade de uma palavra. Sem esse desconto o botão com ícone parece
         torto.

         `toque` (44px) é o tamanho dos botões de ação no celular. */
      size: {
        default:
          "h-8 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        xs: "h-6 gap-1 px-3 text-xs has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-3.5 text-[0.8rem] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        toque:
          "h-11 gap-2 px-6 text-base has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        /* Só ícone: `size-N` deixa largura = altura (quadrado com os cantos de
           10 px). Nenhum padding horizontal aqui — ele desalinharia o ícone do
           centro. */
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
