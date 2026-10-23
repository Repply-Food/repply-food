import "server-only";
import { logError } from "@/lib/logger";
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
  /**
   * Casas LIGADAS a este login em `acessos`. O admin normalmente não tem
   * nenhuma: abre a casa do cliente pelo endereço (`exigirCasa`), sem carregar
   * a lista de todas a cada página (pendência 43).
   */
  casas: CasaDoLogin[];
};

function paraCasa(c: {
  id: string;
  slug: string;
  nome: string;
  situacao: string;
  fuso: string;
}): CasaDoLogin {
  return {
    id: c.id,
    slug: c.slug,
    nome: c.nome,
    fuso: c.fuso,
    situacao: c.situacao === "suspenso" ? "suspenso" : "ativo",
  };
}

/**
 * Falha ao ler a sessão vira erro de verdade (a tela de erro, `app/error.tsx`),
 * nunca "sem casa": antes ela levava o dono ao "acesso pendente" (pendência
 * 27). O log leva só o código.
 */
function falhaNaSessao(): never {
  logError("falha_leitura_sessao");
  throw new Error("falha_leitura_sessao");
}

/**
 * Uma leitura de sessão por requisição, mesmo com layout e página pedindo
 * (React `cache`).
 *
 * Lê a sessão LOCALMENTE (`getSession`, sem ir à rede). O porteiro
 * (`proxy.ts` → `atualizarSessao`) já validou o login no servidor (`getUser`)
 * nesta mesma requisição; repetir o `getUser` aqui seria uma segunda ida ao
 * servidor de login a cada navegação. A segurança não muda: o porteiro segue
 * sendo o ponto de validação, e o acesso aos dados é barrado pela RLS (o JWT
 * do cookie), não por esta leitura.
 */
export const obterSessao = cache(async (): Promise<Sessao | null> => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const [admin, casas] = await Promise.all([
    supabase.rpc("eh_admin_repply"),
    supabase
      .from("restaurantes")
      .select("id, slug, nome, situacao, fuso, acessos!inner(user_id)")
      .eq("acessos.user_id", user.id)
      .order("nome"),
  ]);
  if (admin.error || casas.error) falhaNaSessao();

  return {
    userId: user.id,
    email: user.email ?? "",
    ehAdmin: admin.data === true,
    precisaTrocarSenha: precisaTrocarSenha(user),
    casas: (casas.data ?? []).map(paraCasa),
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

/** A casa do endereço, para o admin: uma consulta só por requisição (pendência 43). */
const casaPeloEndereco = cache(
  async (slug: string): Promise<CasaDoLogin | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("restaurantes")
      .select("id, slug, nome, situacao, fuso")
      .eq("slug", slug)
      .maybeSingle();
    if (error) falhaNaSessao();
    return data ? paraCasa(data) : null;
  }
);

/**
 * Guarda das telas da casa. O dono abre só as casas ligadas ao login dele. O
 * admin abre qualquer uma, para o suporte (só leitura, D-38), e `modoAdmin`
 * liga a faixa "só leitura" e o Ajustes do admin (D-58).
 */
export async function exigirCasa(
  slug: string
): Promise<{ sessao: Sessao; casa: CasaDoLogin; modoAdmin: boolean }> {
  const sessao = await exigirSessao();
  if (sessao.precisaTrocarSenha) redirect("/trocar-senha");
  if (sessao.ehAdmin) {
    const casa = await casaPeloEndereco(slug);
    if (!casa) redirect("/admin");
    return { sessao, casa, modoAdmin: true };
  }
  const casa = sessao.casas.find((c) => c.slug === slug);
  if (!casa) redirect(destinoDaSessao(sessao));
  if (casa.situacao === "suspenso") redirect("/acesso-pendente");
  return { sessao, casa, modoAdmin: false };
}

export async function exigirAdmin(): Promise<Sessao> {
  const sessao = await exigirSessao();
  if (sessao.precisaTrocarSenha) redirect("/trocar-senha");
  if (!sessao.ehAdmin) redirect(destinoDaSessao(sessao));
  return sessao;
}
