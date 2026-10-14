import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * O `tailwind-merge` sabe desempatar duas classes que mexem na MESMA propriedade
 * — `bg-red-500 bg-blue-500` vira só a segunda. Mas ele só reconhece o que está
 * na tabela dele, e os raios da marca (`rounded-card`, `rounded-tag`) são tokens
 * nossos, definidos no `@theme inline` do `app/styles/tokens.css`.
 *
 * Sem registrar aqui, `cn("rounded-card", "rounded-lg")` devolve AS DUAS: quem
 * ganha passa a ser a ordem em que o Tailwind gerou as regras, não a ordem
 * escrita no componente. O bug fica dormindo até alguém tentar sobrescrever o
 * raio de um Card ou de um Badge — e aí falha de um jeito que não parece com a
 * causa.
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
