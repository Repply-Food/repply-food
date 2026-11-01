import type { z } from "zod";
import {
  MAX_BYTES_PAGINA,
  MAX_PAGINAS,
  MAX_REGISTROS_CARGA,
  MAX_REGISTROS_PAGINA,
} from "./limites.ts";
import { sanitizarAntesDeValidar } from "./privacidade.ts";
import { type EnvioSccV2, validarEnvioSccV2 } from "./schemas.ts";
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

type Resultado = {
  data: unknown;
  error: { code: string; message?: string } | null;
};
type Dependencias = {
  autenticar: (req: Request) => Promise<string | null>;
  consumirLimite: (casa: string) => Promise<Resultado>;
  receberPagina: (casa: string, pedido: EnvioSccV2) => Promise<Resultado>;
  permitirSimulacao: boolean;
};

function responder(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function camposSeguros(issues: readonly z.core.$ZodIssue[]): string[] {
  const campos = new Set<string>();
  for (const issue of issues) {
    const caminho = issue.path.filter(
      (parte): parte is string | number =>
        typeof parte === "string" || typeof parte === "number"
    );
    if (
      caminho.length &&
      caminho.every(
        (parte) =>
          typeof parte === "number" ||
          /^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(parte)
      )
    ) {
      campos.add(caminho.join("."));
    }
    if (campos.size >= 20) break;
  }
  return [...campos];
}

function excedeLimites(bruto: unknown): boolean {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return false;
  const p = bruto as Record<string, unknown>;
  const pagina =
    p.pagina && typeof p.pagina === "object"
      ? (p.pagina as Record<string, unknown>)
      : {};
  return (
    (Array.isArray(p.dados) && p.dados.length > MAX_REGISTROS_PAGINA) ||
    (typeof pagina.numero === "number" && pagina.numero > MAX_PAGINAS) ||
    (typeof pagina.total === "number" && pagina.total > MAX_PAGINAS) ||
    (typeof p.total_registros === "number" &&
      p.total_registros > MAX_REGISTROS_CARGA)
  );
}

function respostaErro(error: { code: string; message?: string }): Response {
  const status =
    error.code === "PR413" && error.message === "limite_cargas_abertas"
      ? 429
      : ((
          {
            PR409: 409,
            PR413: 413,
            PR422: 422,
            "22023": 422,
            PR429: 429,
          } as Record<string, number>
        )[error.code] ?? 500);
  return responder(
    {
      ok: false,
      erro:
        (
          {
            409: "conflito na carga",
            413: "envio grande demais",
            422: "carga inválida",
            429: "limite excedido",
          } as Record<number, string>
        )[status] ?? "erro interno",
    },
    status
  );
}

export function criarHandlerSccV2(
  deps: Dependencias
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      if (req.method !== "POST")
        return responder({ ok: false, erro: "use POST" }, 405);
      const casa = await deps.autenticar(req);
      if (!casa) return responder({ ok: false, erro: "não autorizado" }, 401);
      const limite = await deps.consumirLimite(casa);
      if (limite.error) return respostaErro(limite.error);
      if (!limite.data)
        return responder({ ok: false, erro: "erro interno" }, 500);
      const bruto = sanitizarAntesDeValidar(
        await lerJsonLimitado(req, MAX_BYTES_PAGINA)
      );
      if (excedeLimites(bruto))
        return responder({ ok: false, erro: "envio grande demais" }, 413);
      const validado = validarEnvioSccV2(bruto);
      if (!validado.success)
        return responder(
          {
            ok: false,
            erro: "formato inválido",
            campos: camposSeguros(validado.error.issues),
          },
          422
        );
      if (validado.data.natureza === "simulacao" && !deps.permitirSimulacao)
        return responder({ ok: false, erro: "simulação não liberada" }, 422);
      const resultado = await deps.receberPagina(casa, validado.data);
      if (resultado.error) return respostaErro(resultado.error);
      if (!resultado.data)
        return responder({ ok: false, erro: "erro interno" }, 500);
      return responder(resultado.data, 200);
    } catch (erro) {
      if (erro instanceof ErroHttp)
        return responder({ ok: false, erro: erro.message }, erro.status);
      return responder({ ok: false, erro: "erro interno" }, 500);
    }
  };
}
