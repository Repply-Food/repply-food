import { createClient } from "@supabase/supabase-js";
import type { TokenEnvio } from "../_shared/relatorios/autenticacao.ts";
import { autenticarToken } from "../_shared/relatorios/autenticacao.ts";
import { criarHandlerRelatorios } from "../_shared/relatorios/http.ts";

// Sem tipos RPC inventados: regeneração do Database depende das migrations locais.
const db = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { autoRefreshToken: false, persistSession: false } }
);

Deno.serve(
  criarHandlerRelatorios({
    permitirSimulacao: Deno.env.get("RF_PERMITIR_SIMULACAO") === "1",
    autenticar: (req) =>
      autenticarToken(req, async (hash) => {
        const { data, error } = await db
          .from("tokens_envio")
          .select("restaurante_id, expira_em, revogado_em")
          .eq("hash", hash)
          .maybeSingle();
        if (error) throw new Error("falha na autenticação");
        return data as TokenEnvio | null;
      }),
    executarRpc: async (nome, parametros) => {
      const { data, error } = await db.rpc(nome, parametros);
      return { data, error };
    },
  })
);
