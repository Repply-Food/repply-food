import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "../../types/database.types";
import { opcoesDeCookieSeguro } from "./cookies";

/** Renova a sessão do Supabase a cada requisição (padrão do @supabase/ssr). */
export async function atualizarSessao(
  request: NextRequest
): Promise<{ resposta: NextResponse; usuario: User | null }> {
  let resposta = NextResponse.next({ request });

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
          resposta = NextResponse.next({ request });
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
