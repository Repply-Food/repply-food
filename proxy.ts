import { decidirRota, ehArquivoEstatico } from "@/lib/auth/rotas";
import { atualizarSessao } from "@/lib/supabase/proxy";
import { type NextRequest, NextResponse } from "next/server";

/** O porteiro (Next 16 chama o antigo middleware de proxy). */
export async function proxy(request: NextRequest) {
  // Ícone, manifesto e marca não precisam de sessão: não consulta o login.
  if (ehArquivoEstatico(request.nextUrl.pathname)) return NextResponse.next();

  const { resposta, usuario } = await atualizarSessao(request);
  const decisao = decidirRota({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    temUsuario: usuario !== null,
    precisaTrocarSenha: usuario?.app_metadata?.precisa_trocar_senha === true,
  });
  if (decisao.tipo === "segue") return resposta;

  const redirecionamento = NextResponse.redirect(
    new URL(decisao.para, request.url)
  );
  // A sessão renovada vai junto; sem isso o navegador perde o login no caminho.
  for (const cookie of resposta.cookies.getAll())
    redirecionamento.cookies.set(cookie);
  // Idem os cabeçalhos de cache que o @supabase/ssr manda junto do cookie.
  for (const nome of ["cache-control", "expires", "pragma"]) {
    const valor = resposta.headers.get(nome);
    if (valor) redirecionamento.headers.set(nome, valor);
  }
  return redirecionamento;
}

/**
 * Pula só os arquivos internos do Next e os .svg da RAIZ (âncora `$`, ponto
 * como `[.]`: as duas lições do Imob consertado).
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon[.]ico|[^/]+[.]svg$).*)"],
};
