import { Logo } from "@/components/marca/logo";
import type { Selo } from "@/lib/painel/selo";
import Link from "next/link";
import type { ReactNode } from "react";
import { MenuPainel } from "./menu-painel";
import { SeloDados } from "./selo-dados";

type Props = {
  casa: { nome: string; slug: string };
  selo: Selo;
  /** Faixa fixa no topo: o admin vendo o painel do cliente (D-58). */
  faixa?: ReactNode;
  /** "Trocar de casa": login com duas ou mais casas ativas (D-58). */
  trocarDeCasa?: boolean;
  children: ReactNode;
};

/**
 * Moldura do painel do dono (D-40): no computador, barra lateral escura com a
 * marca, o menu e, no rodapé, a casa e o selo; no celular, faixa de cima com a
 * casa e o selo e menu fixo embaixo. A faixa do modo leitura fica presa no
 * topo junto com o cabeçalho do celular.
 */
export function MolduraPainel({
  casa,
  selo,
  faixa = null,
  trocarDeCasa = false,
  children,
}: Props) {
  return (
    <div className="min-h-dvh">
      <aside className="scheme-ink fixed inset-y-0 left-0 hidden w-60 flex-col gap-6 p-4 md:flex">
        <Logo variante="escuro" className="px-1 pt-2" />
        <MenuPainel slug={casa.slug} variante="lateral" />
        <div className="mt-auto flex flex-col gap-2 px-1 pb-2">
          <strong className="text-sm">{casa.nome}</strong>
          {trocarDeCasa ? (
            <Link
              href="/escolher-casa"
              className="w-fit text-sm underline underline-offset-4"
            >
              Trocar de casa
            </Link>
          ) : null}
          <SeloDados selo={selo} />
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col md:pl-60">
        <div className="sticky top-0 z-10">
          {faixa}
          <header className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3 md:hidden">
            <span className="flex min-w-0 items-center gap-2">
              <img
                src="/marca/simbolo.svg"
                alt="repply food."
                width={28}
                height={28}
              />
              <span className="flex min-w-0 flex-col">
                <strong className="truncate text-base">{casa.nome}</strong>
                {trocarDeCasa ? (
                  // Alvo de 44 px sem mudar o desenho: o pseudo-elemento estica a área tocável.
                  <Link
                    href="/escolher-casa"
                    className="relative w-fit text-xs underline underline-offset-4 after:absolute after:-inset-x-2 after:-inset-y-3.5"
                  >
                    Trocar de casa
                  </Link>
                ) : null}
              </span>
            </span>
            <SeloDados selo={selo} compacto />
          </header>
        </div>

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
