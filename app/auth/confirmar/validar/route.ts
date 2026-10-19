import {
  CAMINHO_COOKIE_RECUPERACAO,
  COOKIE_RECUPERACAO,
  criarCookieRecuperacao,
} from "@/lib/auth/cookie-recuperacao";
import { safeNextOr } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

// Só os tipos que o produto usa (dívida 39): recuperação e convite. O ramo
// `code` saiu: o modelo próprio do e-mail usa token_hash.
const TIPOS = ["recovery", "invite"] as const satisfies readonly EmailOtpType[];

function tipoDoLink(bruto: string | null): EmailOtpType | null {
  return TIPOS.find((tipo) => tipo === bruto) ?? null;
}

/**
 * Redireciona com 303 (See Other) e endereço RELATIVO. 303 obriga o navegador a
 * fazer GET no destino (padrão Post/Redirect/Get); um 307 reenviaria o POST para
 * `/nova-senha`/`/entrar`, que são páginas GET, e daria 405. Relativo porque o
 * Next troca 127.0.0.1 por localhost em `request.url` (o cookie é de um endereço
 * só). Não reaproveita `redirecionarRelativo`, que é 307 e serve a outras rotas.
 * Só caminho do próprio site (começa com uma barra, não `//`/`/\`, sem controle).
 */
function redirecionar303(para: string): NextResponse {
  const temControle = [...para].some((letra) => {
    const codigo = letra.charCodeAt(0);
    return codigo < 0x20 || codigo === 0x7f;
  });
  const estranho =
    !para.startsWith("/") ||
    para.startsWith("//") ||
    para.startsWith("/\\") ||
    temControle;
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: estranho ? "/" : para,
      "Cache-Control": "private, no-store",
    },
  });
}

/** O POST gasta o token. O GET (page.tsx) só mostra o botão: antivírus não gasta. */
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const formulario = await request.formData();
  const destino = safeNextOr(
    String(formulario.get("next") ?? ""),
    "/",
    url.origin
  );
  const falhou = redirecionar303("/entrar?erro=link_invalido");

  const tipo = tipoDoLink(String(formulario.get("type") ?? ""));
  const tokenHash = String(formulario.get("token_hash") ?? "");
  if (!tipo || !tokenHash) return falhou;

  const supabase = await createClient();
  const {
    data: { user: jaLogado },
  } = await supabase.auth.getUser();
  // Não troca uma sessão aberta pela do link (fixação de sessão).
  if (jaLogado) return redirecionar303("/entrar?erro=sessao_aberta");

  const { error } = await supabase.auth.verifyOtp({
    type: tipo,
    token_hash: tokenHash,
  });
  if (error) return falhou;

  const resposta = redirecionar303(destino);
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
