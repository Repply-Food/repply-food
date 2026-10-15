import { SeletorTema } from "@/components/painel/seletor-tema";
import { Button } from "@/components/ui/button";
import { emailsDosLoginsDaCasa } from "@/lib/admin/dados";
import { sairAction } from "@/lib/auth/actions";
import { exigirCasa } from "@/lib/auth/sessao";
import { WHATSAPP_REPPLY } from "@/lib/contato";
import Link from "next/link";

export const metadata = { title: "Ajustes · repply food." };

/**
 * Etapa 2: só a parte da conta. Meta, turnos e o resto chegam na etapa 6.
 * O admin vendo o painel do cliente (D-58) vê o login do cliente no lugar de
 * "E-mail / Trocar senha / Sair": a conta que ele mexeria ali é a dele.
 */
export default async function PaginaAjustes({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sessao, casa, modoAdmin } = await exigirCasa(slug);
  const loginsDoCliente = modoAdmin ? await emailsDosLoginsDaCasa(casa.id) : [];

  return (
    <section className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Ajustes</h1>
      <div className="brand-surface flex flex-col divide-y rounded-lg">
        {modoAdmin ? (
          <Link
            href={`/admin/restaurantes/${casa.id}`}
            className="flex min-h-14 items-center justify-between gap-4 px-4 py-2"
          >
            <span className="shrink-0">Login do cliente</span>
            <span className="min-w-0 break-all text-right text-quiet">
              {`${loginsDoCliente.length > 0 ? loginsDoCliente.join(", ") : "ainda não criado"} (ver no admin)`}
            </span>
          </Link>
        ) : (
          <>
            <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2">
              <span className="shrink-0">E-mail</span>
              <span className="min-w-0 break-all text-right text-quiet">
                {sessao.email}
              </span>
            </div>
            <Link
              href={`/trocar-senha?voltar=${encodeURIComponent(`/r/${slug}/ajustes`)}`}
              className="flex min-h-14 items-center justify-between px-4"
            >
              <span>Trocar senha</span>
              <span aria-hidden="true">›</span>
            </Link>
          </>
        )}
        <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2">
          <span>Tema</span>
          <SeletorTema />
        </div>
        <a
          href={WHATSAPP_REPPLY.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-14 items-center justify-between px-4"
        >
          <span>Falar com a Repply</span>
          <span className="text-quiet">
            WhatsApp <span aria-hidden="true">›</span>
            <span className="sr-only">, abre em nova aba</span>
          </span>
        </a>
      </div>
      {modoAdmin ? null : (
        <form action={sairAction}>
          <Button
            type="submit"
            variant="outline"
            size="toque"
            className="w-full md:w-auto"
          >
            Sair
          </Button>
        </form>
      )}
    </section>
  );
}
