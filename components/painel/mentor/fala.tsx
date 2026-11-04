import { Markdown } from "@/components/painel/mentor/markdown";
import { cn } from "@/lib/utils";
import type { ReactNode, RefObject } from "react";

/** Quem falou numa conversa com o mentor (o mesmo par que o banco aceita). */
export type PapelDaFala = "dono" | "mentor";

const ROTULO = { dono: "Você", mentor: "Mentor" } as const;

/**
 * Uma fala da conversa com o mentor, compartilhada pelo chat do dono e pela
 * leitura do admin. O dono fica à direita, com fundo da marca; o mentor, à
 * esquerda, em superfície neutra. Só a cor e a posição não bastam: cada fala
 * leva o nome de quem falou. A fala do mentor é renderizada como Markdown; a do
 * dono fica em texto puro, com as quebras de linha preservadas.
 *
 * `rotulo` troca o nome mostrado (o admin lê a fala de OUTRA pessoa, então o
 * "Você" do dono vira "Dono"). Sem ele, vale o do chat.
 */
export function Fala({
  papel,
  rotulo,
  referencia,
  children,
}: {
  papel: PapelDaFala;
  rotulo?: string;
  referencia?: RefObject<HTMLLIElement | null>;
  children: ReactNode;
}) {
  const doDono = papel === "dono";
  // A fala do mentor vem em Markdown (o provedor formata por natureza) e é
  // renderizada como tal; a do dono e o "Pensando…" são texto puro. Só o texto
  // puro usa whitespace-pre-wrap para preservar as quebras — o Markdown cuida
  // das suas próprias, com parágrafos e listas de verdade.
  const rico = papel === "mentor" && typeof children === "string";
  return (
    <li
      ref={referencia}
      className={cn(
        "flex scroll-mt-28 flex-col gap-1",
        doDono ? "items-end" : "items-start"
      )}
    >
      <span className="label-mono text-quiet">{rotulo ?? ROTULO[papel]}</span>
      <div
        className={cn(
          "max-w-[88%] break-words rounded-lg px-3 py-2 md:max-w-[80%]",
          !rico && "whitespace-pre-wrap",
          doDono ? "bg-primary text-primary-foreground" : "brand-surface"
        )}
      >
        {papel === "mentor" && typeof children === "string" ? (
          <Markdown texto={children} />
        ) : (
          children
        )}
      </div>
    </li>
  );
}
