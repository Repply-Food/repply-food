import { BotaoSair } from "@/components/entrada/botao-sair";
import { destinoDaSessao, obterSessao } from "@/lib/auth/sessao";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormularioEntrar } from "./formulario-entrar";

export const metadata = { title: "Entrar · repply food." };

const AVISOS: Record<string, string> = {
  link_invalido: "Este link não vale mais. Peça um novo em “Esqueci a senha”.",
};

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const { next, erro } = await searchParams;
  const sessao = await obterSessao();

  if (sessao) {
    // Clicou no link do e-mail com outra conta aberta neste aparelho: o link
    // não troca a sessão (fixação de sessão). Explica e oferece sair.
    if (erro !== "sessao_aberta") redirect(destinoDaSessao(sessao));
    return (
      <section className="flex flex-col gap-6">
        <h1 className="text-3xl font-semibold">Já existe uma conta aberta</h1>
        <p className="text-sm text-muted-foreground">
          Este aparelho já está dentro com {sessao.email}. Para usar o link do
          e-mail, saia primeiro e clique no link de novo.
        </p>
        <Link
          href={destinoDaSessao(sessao)}
          className="flex min-h-11 items-center justify-center text-center text-sm underline underline-offset-4"
        >
          Continuar com esta conta
        </Link>
        <BotaoSair variante="outline" />
      </section>
    );
  }

  const aviso = erro ? AVISOS[erro] : undefined;

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Entrar</h1>
      {aviso ? (
        <p role="alert" className="brand-surface rounded-md p-3 text-sm">
          {aviso}
        </p>
      ) : null}
      <FormularioEntrar next={next ?? null} />
    </section>
  );
}
