"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  CAMINHO_COOKIE_RECUPERACAO,
  COOKIE_RECUPERACAO,
  conferirCookieRecuperacao,
} from "./cookie-recuperacao";
import { destinoDepoisDeEntrar } from "./destino";
import { MENSAGEM_LOGIN_RECUSADO, mensagemDoErroDeAuth } from "./erros";
import {
  liberarPrimeiroAcesso,
  precisaTrocarSenha,
  senhaConfere,
} from "./nucleo";
import {
  type EntrarInput,
  type EsqueciInput,
  type NovaSenhaInput,
  type TrocarSenhaInput,
  entrarSchema,
  esqueciSchema,
  novaSenhaSchema,
  trocarSenhaSchema,
} from "./schemas";

type Resultado<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };
type ClienteServidor = Awaited<ReturnType<typeof createClient>>;

/** Mesmo tempo de resposta para e-mail que existe ou não (padrão do Imob). */
const LATENCIA_MINIMA_MS = 800;
async function segurarLatencia(inicio: number): Promise<void> {
  const falta = LATENCIA_MINIMA_MS - (Date.now() - inicio);
  if (falta > 0) await new Promise((resolve) => setTimeout(resolve, falta));
}

function primeiroErro(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Confira os dados";
}

/** Para onde vai, lendo pela RLS as casas que este login enxerga. */
async function destinoDe(
  supabase: ClienteServidor,
  trocaPendente: boolean
): Promise<string> {
  const [admin, casas] = await Promise.all([
    supabase.rpc("eh_admin_repply"),
    supabase.from("restaurantes").select("slug, situacao").order("nome"),
  ]);
  return destinoDepoisDeEntrar({
    precisaTrocarSenha: trocaPendente,
    ehAdmin: admin.data === true,
    restaurantes: (casas.data ?? []).map((c) => ({
      slug: c.slug,
      situacao: c.situacao === "suspenso" ? "suspenso" : "ativo",
    })),
  });
}

/** Depois de trocar a senha: renova a sessão (novo app_metadata) e tira os outros aparelhos. */
async function fecharTroca(supabase: ClienteServidor): Promise<void> {
  await supabase.auth.refreshSession();
  await supabase.auth.signOut({ scope: "others" });
}

export async function entrarAction(
  input: EntrarInput
): Promise<Resultado<{ destino: string }>> {
  const inicio = Date.now();
  const dados = entrarSchema.safeParse(input);
  if (!dados.success) {
    await segurarLatencia(inicio);
    return { ok: false, error: primeiroErro(dados.error.issues) };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
  });
  if (error || !data.user) {
    await segurarLatencia(inicio);
    const limite = error?.code === "over_request_rate_limit";
    return {
      ok: false,
      error: limite ? mensagemDoErroDeAuth(error) : MENSAGEM_LOGIN_RECUSADO,
    };
  }
  const destino = await destinoDe(supabase, precisaTrocarSenha(data.user));
  await segurarLatencia(inicio);
  return { ok: true, data: { destino } };
}

/** Sai SÓ deste aparelho: o login é compartilhado (D-10). */
export async function sairAction(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/entrar");
}

export async function pedirNovaSenhaAction(
  input: EsqueciInput
): Promise<Resultado> {
  const inicio = Date.now();
  const dados = esqueciSchema.safeParse(input);
  if (!dados.success) {
    await segurarLatencia(inicio);
    return { ok: false, error: primeiroErro(dados.error.issues) };
  }
  // A volta do e-mail usa o MESMO endereço em que a pessoa está (127.0.0.1,
  // localhost ou o domínio): o cookie do PKCE só existe nele.
  const origem =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    dados.data.email,
    {
      redirectTo: `${origem}/auth/confirmar?next=${CAMINHO_COOKIE_RECUPERACAO}`,
    }
  );
  await segurarLatencia(inicio);
  // O Supabase responde igual para e-mail que existe ou não: erro aqui é de
  // infraestrutura ou de limite, nunca uma pista de quem é cliente.
  if (error) return { ok: false, error: mensagemDoErroDeAuth(error) };
  return { ok: true };
}

/** Senha nova depois do e-mail. Exige o cookie assinado AQUI, não só na página. */
export async function definirNovaSenhaAction(
  input: NovaSenhaInput
): Promise<Resultado<{ destino: string }>> {
  const dados = novaSenhaSchema.safeParse(input);
  if (!dados.success)
    return { ok: false, error: primeiroErro(dados.error.issues) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      ok: false,
      error: "Sua sessão expirou. Peça um link novo em “Esqueci a senha”.",
    };

  const loja = await cookies();
  if (
    !conferirCookieRecuperacao(loja.get(COOKIE_RECUPERACAO)?.value, user.id)
  ) {
    return {
      ok: false,
      error:
        "Este link de senha nova não vale mais. Peça outro em “Esqueci a senha”.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: dados.data.senha,
  });
  if (error) return { ok: false, error: mensagemDoErroDeAuth(error) };

  // Recuperar a senha também cumpre o primeiro acesso.
  if (
    precisaTrocarSenha(user) &&
    !(await liberarPrimeiroAcesso(createServiceClient(), user.id))
  ) {
    return { ok: false, error: mensagemDoErroDeAuth(null) };
  }
  await fecharTroca(supabase);
  loja.delete({ name: COOKIE_RECUPERACAO, path: CAMINHO_COOKIE_RECUPERACAO });
  return { ok: true, data: { destino: await destinoDe(supabase, false) } };
}

/** Primeiro acesso (sem a senha atual) ou troca voluntária (com a senha atual). */
export async function trocarSenhaAction(
  input: TrocarSenhaInput
): Promise<Resultado<{ destino: string }>> {
  const dados = trocarSenhaSchema.safeParse(input);
  if (!dados.success)
    return { ok: false, error: primeiroErro(dados.error.issues) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email)
    return { ok: false, error: "Sua sessão expirou. Entre de novo." };

  const primeiroAcesso = precisaTrocarSenha(user);
  if (!primeiroAcesso) {
    const confere = await senhaConfere(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      user.email,
      dados.data.senhaAtual
    );
    if (!confere) return { ok: false, error: "A senha atual não confere." };
  }

  const { error } = await supabase.auth.updateUser({
    password: dados.data.senha,
  });
  if (error) return { ok: false, error: mensagemDoErroDeAuth(error) };

  if (
    primeiroAcesso &&
    !(await liberarPrimeiroAcesso(createServiceClient(), user.id))
  ) {
    return { ok: false, error: mensagemDoErroDeAuth(null) };
  }
  await fecharTroca(supabase);
  return { ok: true, data: { destino: await destinoDe(supabase, false) } };
}
