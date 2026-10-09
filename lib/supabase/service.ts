import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com service role. Usar APENAS no servidor ou em Edge Functions.
 * Nunca expor ao client (nunca importar em componentes cliente).
 */
export function createServiceClient() {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
