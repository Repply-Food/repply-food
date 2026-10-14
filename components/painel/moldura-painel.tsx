import { Logo } from "@/components/marca/logo";
import type { Selo } from "@/lib/painel/selo";
import type { ReactNode } from "react";
import { MenuPainel } from "./menu-painel";
import { SeloDados } from "./selo-dados";

type Props = {
  casa: { nome: string; slug: string };
  selo: Selo;
  children: ReactNode;
};

/**
 * Moldura do painel do dono (D-40): no computador, barra lateral escura com a
 * marca, o menu e, no rodapé, a casa e o selo; no celular, faixa de cima com a
 * casa e o selo e menu fixo embaixo.
 */
export function MolduraPainel({ casa, selo, children }: Props) {
  return (
    <div className="min-h-dvh">
      <aside className="scheme-ink fixed inset-y-0 left-0 hidden w-60 flex-col gap-6 p-4 md:flex">
        <Logo variante="escuro" className="px-1 pt-2" />
        <MenuPainel slug={casa.slug} variante="lateral" />
        <div className="mt-auto flex flex-col gap-2 px-1 pb-2">
          <strong className="text-sm">{casa.nome}</strong>
          <SeloDados selo={selo} compacto />
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col md:pl-60">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-4 py-3 md:hidden">
          <span className="flex min-w-0 items-center gap-2">
            <img
              src="/marca/simbolo.svg"
              alt="repply food."
              width={28}
              height={28}
            />
            <strong className="truncate text-base">{casa.nome}</strong>
          </span>
          <SeloDados selo={selo} compacto />
        </header>

        <main className="flex-1 px-4 pt-4 pb-24 md:px-8 md:pt-8 md:pb-8">
          {children}
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <MenuPainel slug={casa.slug} variante="inferior" />
      </div>
    </div>
  );
}
