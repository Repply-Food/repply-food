import "server-only";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { destinoDepoisDeEntrar } from "./destino";
import { precisaTrocarSenha } from "./nucleo";

export type CasaDoLogin = {
  id: string;
  slug: string;
  nome: string;
  situacao: "ativo" | "suspenso";
  fuso: string;
};

export type Sessao = {
  userId: string;
  email: string;
  ehAdmin: boolean;
  precisaTrocarSenha: boolean;
  /** Casas que a RLS deixa ver: as do login (todas, para o admin). */
  casas: CasaDoLogin[];
};

/** Uma ida ao Supabase por requisição, mesmo com layout e página pedindo. */
export const obterSessao = cache(async (): Promise<Sessao | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [admin, casas] = await Promise.all([
    supabase.rpc("eh_admin_repply"),
    supabase
      .from("restaurantes")
      .select("id, slug, nome, situacao, fuso")
      .order("nome"),
  ]);

  return {
    userId: user.id,
    email: user.email ?? "",
    ehAdmin: admin.data === true,
    precisaTrocarSenha: precisaTrocarSenha(user),
    casas: (casas.data ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      nome: c.nome,
      fuso: c.fuso,
      situacao: c.situacao === "suspenso" ? "suspenso" : "ativo",
    })),
  };
});

export function destinoDaSessao(sessao: Sessao): string {
  return destinoDepoisDeEntrar({
    precisaTrocarSenha: sessao.precisaTrocarSenha,
    ehAdmin: sessao.ehAdmin,
    restaurantes: sessao.casas,
  });
}

export async function exigirSessao(): Promise<Sessao> {
  const sessao = await obterSessao();
  if (!sessao) redirect("/entrar");
  return sessao;
}

/** Guarda das telas da casa: a casa precisa estar entre as do login. */
export async function exigirCasa(
  slug: string
): Promise<{ sessao: Sessao; casa: CasaDoLogin }> {
  const sessao = await exigirSessao();
  if (sessao.precisaTrocarSenha) redirect("/trocar-senha");
  const casa = sessao.casas.find((c) => c.slug === slug);
  if (!casa) redirect(destinoDaSessao(sessao));
  if (casa.situacao === "suspenso" && !sessao.ehAdmin)
    redirect("/acesso-pendente");
  return { sessao, casa };
}

export async function exigirAdmin(): Promise<Sessao> {
  const sessao = await exigirSessao();
  if (sessao.precisaTrocarSenha) redirect("/trocar-senha");
  if (!sessao.ehAdmin) redirect(destinoDaSessao(sessao));
  return sessao;
}
