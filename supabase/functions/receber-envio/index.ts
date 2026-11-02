import { createClient } from "@supabase/supabase-js";
import { autenticarToken } from "../_shared/scc/autenticacao.ts";
import { criarHandlerSccV2 } from "../_shared/scc/http.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { autoRefreshToken: false, persistSession: false } }
);

Deno.serve(
  criarHandlerSccV2({
    autenticar: (req) =>
      autenticarToken(req, async (hash) => {
        const { data, error } = await db
          .from("tokens_envio")
          .select("restaurante_id, expira_em, revogado_em")
          .eq("hash", hash)
          .maybeSingle();
        if (error) throw error;
        return data;
      }),
    consumirLimite: async (casa) =>
      await db.rpc("consumir_limite_scc", { p_restaurante_id: casa }),
    receberPagina: async (casa, pedido) =>
      await db.rpc("receber_pagina_scc_v2", {
        p_restaurante_id: casa,
        p_pagina: pedido,
      }),
    permitirSimulacao: Deno.env.get("RF_PERMITIR_SIMULACAO") === "1",
  })
);
