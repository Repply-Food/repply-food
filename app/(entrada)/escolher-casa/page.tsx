import { BotaoSair } from "@/components/entrada/botao-sair";
import { destinoDaSessao, exigirSessao } from "@/lib/auth/sessao";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "Escolha a casa · repply food." };

/** Para quem tem mais de uma casa ativa (D-54). */
export default async function PaginaEscolherCasa() {
  const sessao = await exigirSessao();
  const ativas = sessao.casas.filter((c) => c.situacao === "ativo");
  if (sessao.ehAdmin || ativas.length < 2) redirect(destinoDaSessao(sessao));

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Escolha a casa</h1>
      <ul className="flex flex-col gap-3">
        {ativas.map((casa) => (
          <li key={casa.id}>
            <Link
              href={`/r/${casa.slug}/hoje`}
              className="brand-surface flex min-h-14 items-center rounded-lg px-4 text-base font-bold"
            >
              {casa.nome}
            </Link>
          </li>
        ))}
      </ul>
      <BotaoSair />
    </section>
  );
}
