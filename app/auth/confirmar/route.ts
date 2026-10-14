import {
  CAMINHO_COOKIE_RECUPERACAO,
  COOKIE_RECUPERACAO,
  criarCookieRecuperacao,
} from "@/lib/auth/cookie-recuperacao";
import { redirecionarRelativo } from "@/lib/auth/redirecionar";
import { safeNextOr } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

const TIPOS = [
  "recovery",
  "email",
  "magiclink",
  "invite",
  "email_change",
  "signup",
] as const satisfies readonly EmailOtpType[];

function tipoDoLink(bruto: string | null): EmailOtpType | null {
  return TIPOS.find((tipo) => tipo === bruto) ?? null;
}

/** Recebe o link do e-mail, abre a sessão e segue para `next` (padrão do Imob consertado). */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const destino = safeNextOr(url.searchParams.get("next"), "/", url.origin);
  const falhou = redirecionarRelativo("/entrar?erro=link_invalido");

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  if (!code && !tokenHash) return falhou;

  const supabase = await createClient();
  const {
    data: { user: jaLogado },
  } = await supabase.auth.getUser();
  // Não troca uma sessão aberta pela do link (fixação de sessão).
  if (jaLogado) return redirecionarRelativo("/entrar?erro=sessao_aberta");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return falhou;
  } else {
    const tipo = tipoDoLink(url.searchParams.get("type"));
    if (!tipo || !tokenHash) return falhou;
    const { error } = await supabase.auth.verifyOtp({
      type: tipo,
      token_hash: tokenHash,
    });
    if (error) return falhou;
  }

  const resposta = redirecionarRelativo(destino);
  if (destino.startsWith(CAMINHO_COOKIE_RECUPERACAO)) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      resposta.cookies.set(
        COOKIE_RECUPERACAO,
        criarCookieRecuperacao(user.id),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 10,
          path: CAMINHO_COOKIE_RECUPERACAO,
        }
      );
    }
  }
  return resposta;
}
