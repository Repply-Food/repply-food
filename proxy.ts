import { precisaTrocarSenha } from "@/lib/auth/nucleo";
import { decidirRota, ehArquivoEstatico } from "@/lib/auth/rotas";
import { montarCsp } from "@/lib/seguranca/csp";
import { atualizarSessao } from "@/lib/supabase/proxy";
import { type NextRequest, NextResponse } from "next/server";

/** O porteiro (Next 16 chama o antigo middleware de proxy). */
export async function proxy(request: NextRequest) {
  // A trava de segurança das telas (CSP) é montada aqui porque precisa de uma
  // senha de uso único (nonce) por carregamento, que um cabeçalho estático do
  // next.config não consegue dar.
  const { nonce, politica } = montarCsp(process.env.NODE_ENV !== "production");

  // Ícone, manifesto e marca não precisam de sessão: não consulta o login.
  // Ainda assim carregam a CSP, como toda resposta do site.
  if (ehArquivoEstatico(request.nextUrl.pathname)) {
    const estatico = NextResponse.next();
    estatico.headers.set("content-security-policy", politica);
    return estatico;
  }

  // O nonce e a CSP vão nos cabeçalhos do PEDIDO para o Next carimbar o nonce
  // nos `<script>` em linha que injeta; sem isso a CSP bloqueia os próprios
  // scripts do Next e a página nunca inicia.
  const cabecalhosExtras = new Headers();
  cabecalhosExtras.set("x-nonce", nonce);
  cabecalhosExtras.set("content-security-policy", politica);

  const { resposta, usuario } = await atualizarSessao(
    request,
    cabecalhosExtras
  );
  const decisao = decidirRota({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    temUsuario: usuario !== null,
    precisaTrocarSenha: precisaTrocarSenha(usuario),
  });
  if (decisao.tipo === "segue") {
    // O navegador obedece a CSP pelo cabeçalho da RESPOSTA (o do pedido só serve
    // para o Next achar o nonce); por isso ela também vai aqui.
    resposta.headers.set("content-security-policy", politica);
    return resposta;
  }

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
  redirecionamento.headers.set("content-security-policy", politica);
  return redirecionamento;
}

/**
 * Pula só os arquivos internos do Next e os .svg da RAIZ (âncora `$`, ponto
 * como `[.]`: as duas lições do Imob consertado).
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon[.]ico|[^/]+[.]svg$).*)"],
};
