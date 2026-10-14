import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * O `tailwind-merge` sabe desempatar duas classes que mexem na MESMA propriedade
 * (duas cores de fundo, por exemplo: vale só a última). Mas ele só reconhece o
 * que está na tabela dele, e os raios da marca são tokens nossos, definidos na
 * ponte `@theme inline` de `app/globals.css` (no Food, o do card é o
 * `--radius-card`). A lista abaixo é herdada do Imob e inclui um raio de tag
 * que o Food ainda não declara.
 *
 * Sem registrar aqui, um raio da marca e um raio padrão do Tailwind no mesmo
 * elemento saem AMBOS: quem ganha passa a ser a ordem em que o Tailwind gerou
 * as regras, não a ordem escrita no componente. O bug fica dormindo até alguém
 * tentar sobrescrever o raio de um Card — e aí falha de um jeito que não
 * parece com a causa.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: ["rounded-card", "rounded-tag"],
      "rounded-t": ["rounded-t-card", "rounded-t-tag"],
      "rounded-b": ["rounded-b-card", "rounded-b-tag"],
      "rounded-l": ["rounded-l-card", "rounded-l-tag"],
      "rounded-r": ["rounded-r-card", "rounded-r-tag"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
