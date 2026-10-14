import { cn } from "@/lib/utils";

type Props = {
  /** "claro" para fundo claro, "escuro" para fundo escuro (barra lateral). */
  variante: "claro" | "escuro";
  tamanho?: "normal" | "grande";
  /** Símbolo em cima do nome (tela de entrar no celular). */
  empilhado?: boolean;
  className?: string;
};

/** Símbolo + "repply food.". O tomate só aparece no símbolo (D-42). */
export function Logo({
  variante,
  tamanho = "normal",
  empilhado = false,
  className,
}: Props) {
  const altura = tamanho === "grande" ? 40 : 28;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2",
        empilhado && "flex-col gap-3",
        className
      )}
    >
      {/* SVG estático da marca: <img> simples, sem ganho com next/image. */}
      <img src="/marca/simbolo.svg" alt="" width={altura} height={altura} />
      <img
        src={
          variante === "claro"
            ? "/marca/texto-claro.svg"
            : "/marca/texto-escuro.svg"
        }
        alt="repply food."
        height={Math.round(altura * 0.6)}
        style={{ height: Math.round(altura * 0.6), width: "auto" }}
      />
    </span>
  );
}
