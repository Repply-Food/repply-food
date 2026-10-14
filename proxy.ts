import { precisaTrocarSenha } from "@/lib/auth/nucleo";
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
    precisaTrocarSenha: precisaTrocarSenha(usuario),
  });
  if (decisao.tipo === "segue") return resposta;

  // Endereço ABSOLUTO de propósito. Medido num `next dev` real: o adaptador do
  // Next recusa um `Location` relativo vindo do proxy (erro 500, "Invalid URL")
  // e, quando o endereço é o do próprio pedido, ele mesmo o entrega ao
  // navegador como relativo (`/entrar?next=...`). Assim a pessoa continua em
  // 127.0.0.1 ou em localhost, como estava, e o login não se perde. Quem
  // redireciona com endereço relativo à mão é a rota `/auth/confirmar`, que
  // não passa por esse adaptador (`lib/auth/redirecionar.ts`).
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
