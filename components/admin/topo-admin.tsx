import { BotaoSair } from "@/components/entrada/botao-sair";
import { Logo } from "@/components/marca/logo";
import { Menu } from "lucide-react";
import Link from "next/link";

const TROCAR_SENHA = `/trocar-senha?voltar=${encodeURIComponent("/admin")}`;

/**
 * Topo do admin (tela aprovada): barra escura com a marca e a etiqueta
 * "admin"; à direita, o e-mail de quem está dentro, "Trocar minha senha" e
 * "Sair". No celular os dois ficam num menu (☰) que abre sem JavaScript.
 * O tomate só aparece no símbolo (D-42): o `Logo` cuida disso.
 */
export function TopoAdmin({ email }: { email: string }) {
  return (
    <header className="scheme-ink sticky top-0 z-20">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 md:px-6">
        <Link href="/admin" className="flex min-h-11 items-center gap-2">
          <Logo variante="escuro" />
          <span className="number-mono rounded-full border px-2 py-0.5 text-xs text-quiet">
            admin
          </span>
        </Link>

        <nav aria-label="Conta" className="hidden items-center gap-4 md:flex">
          <span className="text-sm text-quiet">{email}</span>
          <Link
            href={TROCAR_SENHA}
            className="text-sm underline underline-offset-4"
          >
            Trocar minha senha
          </Link>
          <div className="w-28">
            <BotaoSair variante="outline" />
          </div>
        </nav>

        <details className="relative md:hidden">
          <summary
            aria-label="Menu da conta"
            className="flex size-11 cursor-pointer list-none items-center justify-center rounded-lg [&::-webkit-details-marker]:hidden"
          >
            <Menu aria-hidden="true" className="size-6" />
          </summary>
          <div className="scheme-paper absolute top-12 right-0 flex w-64 flex-col gap-2 rounded-xl border p-3 shadow-lg">
            <span className="break-all text-sm text-quiet">{email}</span>
            <Link
              href={TROCAR_SENHA}
              className="flex min-h-11 items-center text-sm underline underline-offset-4"
            >
              Trocar minha senha
            </Link>
            <BotaoSair variante="outline" />
          </div>
        </details>
      </div>
    </header>
  );
}
