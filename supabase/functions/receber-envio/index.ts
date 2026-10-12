import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../../types/database.types.ts";
import { validarEnvelope } from "../_shared/recepcao.ts";
import { registrarErroNoBanco } from "../_shared/registro-erro.ts";

// Limites e ritmo (contrato-de-dados.md §7 e recepcao-de-dados.md §3).
const LIMITE_BYTES = 2 * 1024 * 1024; // 2 MB
const LIMITE_ENTRADAS = 2000;
const RITMO_MS = 20 * 1000; // 20 s entre envios do mesmo restaurante

// Dados pessoais descartados na recepção (D-29): nunca entram na nuvem, nem
// no banco, nem no JSON original guardado em envios.payload.
const CAMPOS_PESSOAIS = ["NomeCliente", "RG", "FoneCliente", "Sexo"];

const url = Deno.env.get("SUPABASE_URL") ?? "";
const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient<Database>(url, chaveServico, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function responder(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function extrairToken(req: Request): string {
  const autorizacao = req.headers.get("authorization") ?? "";
  const partes = /^Bearer\s+(.+)$/i.exec(autorizacao);
  return partes?.[1]?.trim() ?? "";
}

async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(texto)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/** Remove os campos pessoais do envelope inteiro, em qualquer profundidade. */
function removerDadosPessoais(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map((item) => removerDadosPessoais(item));
  }
  if (valor === null || typeof valor !== "object") {
    return valor;
  }
  const limpo: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor)) {
    if (CAMPOS_PESSOAIS.includes(chave)) {
      continue;
    }
    limpo[chave] = removerDadosPessoais(item);
  }
  return limpo;
}

/**
 * Erro depois do passo 3 (recepcao-de-dados.md §3.10): registra em envios com
 * mensagem curta e sem dado pessoal e atualiza o sinal de vida.
 */
async function registrarErro(
  restauranteId: string,
  httpStatus: number,
  erro: string,
  envelope?: unknown
): Promise<void> {
  const agora = new Date().toISOString();
  await registrarErroNoBanco(
    {
      async inserirEnvio(registro) {
        const { data, error } = await db
          .from("envios")
          .insert({
            restaurante_id: registro.restauranteId,
            http_status: registro.httpStatus,
            erro: registro.erro,
            payload:
              registro.payload === undefined
                ? null
                : (registro.payload as Json),
          })
          .select("id")
          .single();
        return { id: data?.id ?? null, error };
      },
      async atualizarSinal(id, momento) {
        const { data, error } = await db
          .from("sinal_de_vida")
          .upsert(
            {
              restaurante_id: id,
              ultimo_envio_em: momento,
              ultimo_erro_em: momento,
            },
            { onConflict: "restaurante_id" }
          )
          .select("restaurante_id")
          .single();
        return { restauranteId: data?.restaurante_id ?? null, error };
      },
    },
    {
      restauranteId,
      httpStatus,
      erro,
      payload: envelope,
    },
    agora
  );
}

function contarEntradas(envelope: unknown): number {
  if (
    envelope === null ||
    typeof envelope !== "object" ||
    Array.isArray(envelope)
  ) {
    return 0;
  }
  const entradas = (envelope as Record<string, unknown>).entradas;
  return Array.isArray(entradas) ? entradas.length : 0;
}

async function receberEnvio(req: Request): Promise<Response> {
  // 1. Só POST (recepcao-de-dados.md §3.1).
  if (req.method !== "POST") {
    return responder({ ok: false, erro: "use POST" }, 405);
  }

  // 2. Tamanho (contrato §7): mais de 2 MB responde 413 antes de autenticar.
  const texto = await req.text();
  if (new TextEncoder().encode(texto).byteLength > LIMITE_BYTES) {
    return responder({ ok: false, erro: "envio grande demais" }, 413);
  }

  // 3. Token: SHA-256 e procura em tokens_envio (passo 3).
  const token = extrairToken(req);
  if (!token) {
    console.error("[receber-envio] token inválido: ausente");
    return responder({ ok: false, erro: "não autorizado" }, 401);
  }
  const hash = await sha256Hex(token);
  const { data: linhaToken } = await db
    .from("tokens_envio")
    .select("restaurante_id, prefixo, expira_em, revogado_em")
    .eq("hash", hash)
    .maybeSingle();

  const agoraIso = new Date().toISOString();
  const tokenValido =
    linhaToken !== null &&
    linhaToken.revogado_em === null &&
    (linhaToken.expira_em === null || linhaToken.expira_em > agoraIso);
  if (!tokenValido) {
    console.error(
      `[receber-envio] token inválido: ${linhaToken?.prefixo ?? "sem prefixo"}`
    );
    return responder({ ok: false, erro: "não autorizado" }, 401);
  }
  const restauranteId = linhaToken.restaurante_id;

  // 4. Ritmo (passo 4): mesmo restaurante enviou há menos de 20 s.
  const { data: sinal } = await db
    .from("sinal_de_vida")
    .select("ultimo_envio_em")
    .eq("restaurante_id", restauranteId)
    .maybeSingle();
  const ultimoEnvio = sinal?.ultimo_envio_em
    ? Date.parse(sinal.ultimo_envio_em)
    : Number.NaN;
  if (!Number.isNaN(ultimoEnvio) && Date.now() - ultimoEnvio < RITMO_MS) {
    await registrarErro(restauranteId, 429, "envios rápidos demais");
    return responder(
      { ok: false, erro: "envios rápidos demais; aguarde o próximo ciclo" },
      429
    );
  }

  // 5. JSON válido (passo 5).
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    await registrarErro(restauranteId, 400, "json inválido");
    return responder({ ok: false, erro: "json inválido" }, 400);
  }

  // 6. Descarta dados pessoais antes de validar e antes de guardar (passo 6).
  const envelope = removerDadosPessoais(bruto);

  // 2.001+ entradas responde 413 (contrato §7), não 422.
  if (contarEntradas(envelope) > LIMITE_ENTRADAS) {
    await registrarErro(restauranteId, 413, "mais de 2.000 entradas", envelope);
    return responder({ ok: false, erro: "envio grande demais" }, 413);
  }

  // 7. Valida o envelope (passo 7).
  const resultado = validarEnvelope(envelope);
  if (!resultado.success) {
    const erros = resultado.error.issues.map((problema) => ({
      campo: problema.path.join("."),
      mensagem: problema.message,
    }));
    await registrarErro(restauranteId, 422, "formato inválido", envelope);
    return responder({ ok: false, erros }, 422);
  }

  // 8. Processa: upsert, reconciliação, sinal de vida, envios (passo 8).
  const { data: contagens, error: erroRpc } = await db.rpc("processar_envio", {
    p_restaurante_id: restauranteId,
    p_envelope: envelope as Json,
  });
  if (erroRpc) {
    console.error(
      `[receber-envio] processar_envio: ${erroRpc.code ?? "sem-codigo"}`
    );
    await registrarErro(restauranteId, 500, "erro interno", envelope);
    return responder({ ok: false, erro: "erro interno" }, 500);
  }

  // 9. Resposta 200 com as contagens e o próximo intervalo (passo 9).
  const detalhes = (contagens ?? {}) as unknown as Record<string, unknown>;
  return responder({ ok: true, ...detalhes }, 200);
}

Deno.serve(async (req) => {
  try {
    return await receberEnvio(req);
  } catch (erro) {
    // Log curto e sem dado pessoal; o SCC repete no próximo ciclo.
    console.error("[receber-envio] falha inesperada");
    return responder({ ok: false, erro: "erro interno" }, 500);
  }
});
