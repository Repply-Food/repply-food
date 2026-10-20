import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { Database } from "../../../types/database.types.ts";
import {
  criarManipuladorAlerta,
  type AlertaParaEmail,
} from "../_shared/alerta.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const segredo = Deno.env.get("ALERTA_CHAVE_INTERNA") ?? "";
const emailDe = Deno.env.get("ALERTA_EMAIL_DE") ?? "";
const emailPara = Deno.env.get("ALERTA_EMAIL_PARA") ?? "";
const appUrl = Deno.env.get("APP_URL") ?? "";
const chaveResend = Deno.env.get("RESEND_API_KEY") ?? "";
const db = createClient<Database>(url, chaveServico, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function urlDoAdmin(restauranteId: string): string | null {
  try {
    return new URL(`/admin/restaurantes/${restauranteId}`, appUrl).toString();
  } catch {
    return null;
  }
}

async function buscarAlerta(id: string): Promise<AlertaParaEmail | null> {
  const { data: alerta, error: erroAlerta } = await db
    .from("alertas_sinal")
    .select("id, tipo, estado, restaurante_id")
    .eq("id", id)
    .maybeSingle();
  if (erroAlerta || !alerta || alerta.estado !== "em_transito") return null;

  const [{ data: restaurante, error: erroRestaurante }, { data: sinal, error: erroSinal }] =
    await Promise.all([
      db
        .from("restaurantes")
        .select("nome, fuso")
        .eq("id", alerta.restaurante_id)
        .maybeSingle(),
      db
        .from("sinal_de_vida")
        .select("ultimo_envio_ok_em")
        .eq("restaurante_id", alerta.restaurante_id)
        .maybeSingle(),
    ]);
  const admin = urlDoAdmin(alerta.restaurante_id);
  if (erroRestaurante || erroSinal || !restaurante || !sinal || !admin) return null;

  return {
    id: alerta.id,
    tipo: alerta.tipo === "voltou" ? "voltou" : "parado",
    nomeRestaurante: restaurante.nome,
    ultimoEnvioEm: sinal.ultimo_envio_ok_em,
    fuso: restaurante.fuso,
    urlAdmin: admin,
  };
}

const responder = criarManipuladorAlerta({
  segredo,
  emailDe,
  emailPara,
  buscarAlerta,
  enviarEmail: async (email, de, para, chave) => {
    // A SDK só é criada depois de autenticar e encontrar um alerta válido.
    // Assim, ambiente local sem chave ainda responde 401 a chamadas indevidas.
    const resultado = await new Resend(chaveResend).emails.send({
      from: de,
      to: [para],
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: { "Idempotency-Key": chave },
    });
    return { ok: !resultado.error };
  },
});

Deno.serve(async (req) => {
  try {
    return await responder(req);
  } catch {
    console.error("[enviar-alerta] erro_interno");
    return new Response(JSON.stringify({ ok: false, codigo: "erro_interno" }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
});
