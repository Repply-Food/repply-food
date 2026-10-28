import type { z } from "zod";
import {
  MAX_BYTES_PAGINA,
  MAX_LINHAS_CARGA,
  MAX_LINHAS_PAGINA,
  MAX_PAGINAS,
} from "./limites.ts";
import { pedidoRelatoriosSchema } from "./schemas.ts";

class ErroHttp extends Error {
  constructor(
    readonly status: number,
    mensagem: string
  ) {
    super(mensagem);
  }
}

/** Conta os bytes recebidos, inclusive sem Content-Length ou com valor falso. */
export async function lerJsonLimitado(
  req: Request,
  maxBytes: number
): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw new ErroHttp(400, "json inválido");
  let bytes = 0;
  let texto = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new ErroHttp(413, "envio grande demais");
        }
        texto += decoder.decode(value, { stream: true });
      }
      texto += decoder.decode();
    } catch (erro) {
      if (erro instanceof ErroHttp) throw erro;
      if (erro instanceof TypeError) throw new ErroHttp(400, "json inválido");
      throw erro;
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErroHttp(400, "json inválido");
  }
}

type Dependencias = {
  autenticar: (req: Request) => Promise<string | null>;
  executarRpc: (
    nome: "receber_pagina_relatorio" | "publicar_relatorio",
    parametros: Record<string, unknown>
  ) => Promise<{
    data: unknown;
    error: { code: string; message?: string } | null;
  }>;
  permitirSimulacao: boolean;
};

function responder(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Retorna apenas identificadores curtos, nunca mensagens Zod com valores. */
function camposSeguros(issues: readonly z.core.$ZodIssue[]): string[] {
  const campos = new Set<string>();
  function visitar(problemas: readonly z.core.$ZodIssue[]) {
    for (const problema of problemas) {
      const nomes = [
        ...problema.path,
        ...(problema.code === "unrecognized_keys" ? problema.keys : []),
      ];
      for (const nome of nomes) {
        if (
          typeof nome === "string" &&
          /^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(nome) &&
          campos.size < 20
        )
          campos.add(nome);
      }
      if (problema.code === "invalid_union")
        for (const erros of problema.errors) visitar(erros);
    }
  }
  visitar(issues);
  return [...campos];
}

// Limites estruturais também são 413; o schema continua obrigatório antes da RPC.
function excedeLimites(bruto: unknown): boolean {
  if (!bruto || typeof bruto !== "object") return false;
  const p = bruto as Record<string, unknown>;
  const m =
    p.manifesto && typeof p.manifesto === "object"
      ? (p.manifesto as Record<string, unknown>)
      : {};
  return (
    (Array.isArray(p.linhas) && p.linhas.length > MAX_LINHAS_PAGINA) ||
    (typeof m.total_paginas === "number" && m.total_paginas > MAX_PAGINAS) ||
    (typeof m.total_linhas === "number" && m.total_linhas > MAX_LINHAS_CARGA)
  );
}

export function criarHandlerRelatorios(
  deps: Dependencias
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      if (req.method !== "POST")
        return responder({ ok: false, erro: "use POST" }, 405);
      const bruto = await lerJsonLimitado(req, MAX_BYTES_PAGINA);
      const casa = await deps.autenticar(req);
      if (!casa) return responder({ ok: false, erro: "não autorizado" }, 401);
      if (excedeLimites(bruto))
        return responder({ ok: false, erro: "envio grande demais" }, 413);
      const validado = pedidoRelatoriosSchema.safeParse(bruto);
      if (!validado.success)
        return responder(
          {
            ok: false,
            erro: "formato inválido",
            campos: camposSeguros(validado.error.issues),
          },
          422
        );
      const pedido = validado.data;
      if (
        pedido.acao === "pagina" &&
        pedido.manifesto.natureza === "simulacao" &&
        !deps.permitirSimulacao
      ) {
        return responder({ ok: false, erro: "simulação não liberada" }, 422);
      }
      // Repetições válidas são permitidas. As quotas pertencem às RPCs, sem contador v1.
      const { data, error } =
        pedido.acao === "pagina"
          ? await deps.executarRpc("receber_pagina_relatorio", {
              p_restaurante_id: casa,
              p_pedido: pedido,
            })
          : await deps.executarRpc("publicar_relatorio", {
              p_restaurante_id: casa,
              p_carga_id: pedido.carga_id,
            });
      if (error) {
        // A quota usa PR413 no banco; o contrato HTTP distingue cargas abertas (429).
        // Só comparamos o identificador técnico fixo, sem devolver mensagem SQL.
        if (
          error.code === "PR413" &&
          error.message === "limite_cargas_abertas"
        ) {
          return responder(
            { ok: false, erro: "limite de cargas abertas" },
            429
          );
        }
        // Mensagem/detalhes SQL ficam fora da resposta e dos logs.
        const status =
          (
            { PR409: 409, PR413: 413, PR422: 422, "22023": 422 } as Record<
              string,
              number
            >
          )[error.code] ?? 500;
        const erro =
          (
            {
              409: "conflito na carga",
              413: "envio grande demais",
              422: "carga inválida ou incompleta",
            } as Record<number, string>
          )[status] ?? "erro interno";
        return responder({ ok: false, erro }, status);
      }
      if (!data) return responder({ ok: false, erro: "erro interno" }, 500);
      return responder(data, 200);
    } catch (erro) {
      if (erro instanceof ErroHttp)
        return responder({ ok: false, erro: erro.message }, erro.status);
      return responder({ ok: false, erro: "erro interno" }, 500);
    }
  };
}
