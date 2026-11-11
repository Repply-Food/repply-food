import { Lembrancas } from "@/components/painel/mentor/lembrancas";
import { exigirCasa } from "@/lib/auth/sessao";
import { fichasDaCasa } from "@/lib/mentor/leitura";
import { casaTemModulo } from "@/lib/painel/modulos";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = { title: "Lembranças do mentor · repply food." };

export default async function PaginaLembrancas({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { casa, modoAdmin } = await exigirCasa(slug);
  if (!casaTemModulo(casa.modulos, "mentor")) notFound();

  // Falha de leitura vira a tela de erro, nunca um vazio falso: quem já
  // contou coisa ao mentor perderia o fio sem saber (mesmo princípio da lista
  // de conversas). Casa nova, sem ficha, abre o estado vazio.
  const fichas = await fichasDaCasa(casa.id);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/r/${slug}/mentor`}
          className="inline-flex h-11 items-center gap-1 self-start rounded-lg px-2 text-sm font-bold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
          Mentor
        </Link>
        <h1 className="text-2xl font-semibold">O que o mentor lembra</h1>
        <p className="text-sm text-quiet">
          O que você conta nas conversas fica guardado aqui, e o mentor usa para
          responder melhor.
        </p>
      </div>
      <Lembrancas
        slug={slug}
        fichas={fichas}
        fuso={casa.fuso}
        agoraIso={new Date().toISOString()}
        somenteLeitura={modoAdmin}
      />
    </section>
  );
}
