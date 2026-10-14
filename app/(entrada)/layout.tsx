import { Logo } from "@/components/marca/logo";
import type { ReactNode } from "react";

/**
 * Telas de entrada (D-40): no computador, marca e frase à esquerda (ilha
 * escura) e formulário à direita (ilha clara); no celular, só a coluna clara.
 */
export default function LayoutEntrada({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-2">
      <aside className="scheme-ink hidden flex-col justify-between p-12 md:flex">
        <Logo variante="escuro" tamanho="grande" />
        <p className="font-heading text-4xl leading-tight">
          sua casa,
          <br />
          <span className="text-quiet">de onde você estiver.</span>
        </p>
      </aside>
      <main className="scheme-paper flex min-h-dvh flex-col justify-center px-6 py-10 md:px-16">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
          <div className="flex justify-center md:hidden">
            <Logo variante="claro" tamanho="grande" empilhado />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
