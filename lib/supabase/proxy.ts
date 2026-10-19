import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "../../types/database.types";
import { opcoesDeCookieSeguro } from "./cookies";

/** Renova a sessão do Supabase a cada requisição (padrão do @supabase/ssr).
 *
 * `cabecalhosExtras` (o nonce e a CSP, vindos do porteiro) vão nos cabeçalhos
 * encaminhados ao Next. São montados a partir de `request.headers` AO VIVO, que
 * já reflete os cookies renovados pela @supabase/ssr (o `request.cookies.set`
 * reescreve o cabeçalho `cookie`), para não perder a sessão no caminho. */
export async function atualizarSessao(
  request: NextRequest,
  cabecalhosExtras?: Headers
): Promise<{ resposta: NextResponse; usuario: User | null }> {
  const cabecalhosDoPedido = () => {
    const h = new Headers(request.headers);
    if (cabecalhosExtras)
      for (const [nome, valor] of cabecalhosExtras) h.set(nome, valor);
    return h;
  };
  let resposta = NextResponse.next({
    request: { headers: cabecalhosDoPedido() },
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // O segundo parâmetro (cabeçalhos de cache) existe na @supabase/ssr
        // 0.10: resposta com cookie de sessão não pode ser guardada por CDN
        // nem por proxy, ou a sessão de uma pessoa pode ser servida a outra.
        setAll(cookiesToSet, cabecalhos) {
          for (const { name, value } of cookiesToSet)
            request.cookies.set(name, value);
          resposta = NextResponse.next({
            request: { headers: cabecalhosDoPedido() },
          });
          for (const { name, value, options } of cookiesToSet) {
            resposta.cookies.set(name, value, opcoesDeCookieSeguro(options));
          }
          for (const [chave, valor] of Object.entries(cabecalhos)) {
            resposta.headers.set(chave, valor);
          }
        },
      },
    }
  );

  // getUser() valida no servidor do Supabase (não confia só no cookie) e já
  // traz o app_metadata atualizado (o aviso de troca de senha).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { resposta, usuario: user };
}
