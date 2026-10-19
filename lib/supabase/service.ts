import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.types";

/** `true` para 127.0.0.1, localhost, [::1] e nomes .localhost/.test. */
export function urlLocalDoSupabase(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return (
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "::1" ||
      host.endsWith(".localhost") ||
      host.endsWith(".test")
    );
  } catch {
    return false;
  }
}

/**
 * Cliente com service role. Usar APENAS no servidor ou em Edge Functions.
 * Nunca expor ao client (nunca importar em componentes cliente).
 *
 * Trava dev-contra-nuvem (dívida 10): fora de produção, apontar a chave de
 * serviço para uma URL que não é local é quase sempre engano (dado real, banco
 * da nuvem, rodando em dev). Lança, a menos que PERMITIR_NUVEM_NO_DEV=1 diga que
 * é de propósito. URL vazia não dispara (é o caso "não configurado"). Em
 * produção nunca lança.
 */
export function createServiceClient() {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (
    process.env.NODE_ENV !== "production" &&
    url !== "" &&
    !urlLocalDoSupabase(url) &&
    process.env.PERMITIR_NUVEM_NO_DEV !== "1"
  ) {
    throw new Error(
      "A chave de serviço está apontando para uma URL de nuvem fora de produção. " +
        "Use o banco local, ou defina PERMITIR_NUVEM_NO_DEV=1 se for de propósito."
    );
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
