import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { EnvioSccV2 } from "../../supabase/functions/_shared/scc/schemas";
import { fragmentarV2 } from "./fragmentar-v2";

type Transporte = (pagina: EnvioSccV2) => Promise<Response>;

export function criarTransporteLocal(
  destino: string,
  token: string
): Transporte {
  let url: URL;
  try {
    url = new URL(destino);
  } catch {
    throw new Error("Configure uma URL local de loopback.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.href.includes("?") ||
    url.href.includes("#") ||
    /\/\/[^/]*@/.test(destino)
  )
    throw new Error("Somente URL local de loopback é permitida.");
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  if (!token.trim() || /[\r\n]/.test(token))
    throw new Error("Configure o token local.");
  return async (pagina) => {
    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(pagina),
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error("Falha no transporte local. Repita o mesmo arquivo.");
    }
  };
}

function preparar(cargas: unknown): EnvioSccV2[][] {
  if (!Array.isArray(cargas) || cargas.length === 0)
    throw new Error("Arquivo de cargas inválido.");
  return cargas.map(fragmentarV2);
}

async function enviarPaginas(
  cargas: EnvioSccV2[][],
  transporte: Transporte
): Promise<void> {
  for (const paginas of cargas) {
    for (const pagina of paginas) {
      let resposta: Response;
      try {
        resposta = await transporte(pagina);
      } catch {
        throw new Error("Falha no transporte local. Repita o mesmo arquivo.");
      }
      if (!resposta.ok) {
        await resposta.body?.cancel();
        throw new Error(`Envio interrompido: HTTP ${resposta.status}.`);
      }
      let recibo: unknown;
      try {
        recibo = await resposta.json();
      } catch {
        throw new Error("Recibo inválido; cursor não avançado.");
      }
      if (
        !recibo ||
        typeof recibo !== "object" ||
        !("ok" in recibo) ||
        recibo.ok !== true ||
        !("estado" in recibo) ||
        !["recebendo", "publicada"].includes(String(recibo.estado))
      )
        throw new Error("Recibo inválido; cursor não avançado.");
      if (
        pagina.pagina.numero === pagina.pagina.total &&
        recibo.estado !== "publicada"
      )
        throw new Error("Carga não publicada; cursor não avançado.");
    }
  }
}

export async function enviarCargas(
  cargas: unknown,
  transporte: Transporte
): Promise<void> {
  await enviarPaginas(preparar(cargas), transporte);
}

export async function executarEnvio(
  args: string[],
  ambiente: Record<string, string | undefined> = process.env
): Promise<number> {
  try {
    const { values } = parseArgs({
      args,
      strict: true,
      options: {
        arquivo: { type: "string" },
        "dry-run": { type: "boolean", default: false },
      },
    });
    if (!values.arquivo)
      throw new Error("Use --arquivo e, para validar, --dry-run.");
    let dados: unknown;
    try {
      dados = JSON.parse(await readFile(values.arquivo, "utf8"));
    } catch {
      throw new Error("Não foi possível ler o arquivo JSON.");
    }
    const cargas = preparar(dados);
    const contagens = {
      cargas: cargas.length,
      paginas: cargas.reduce((n, paginas) => n + paginas.length, 0),
      registros: cargas.reduce(
        (n, paginas) =>
          n + paginas.reduce((t, pagina) => t + pagina.dados.length, 0),
        0
      ),
    };
    if (!values["dry-run"])
      await enviarPaginas(
        cargas,
        criarTransporteLocal(
          ambiente.RF_SCC_URL ?? "",
          ambiente.RF_SCC_TOKEN ?? ""
        )
      );
    console.log(JSON.stringify(contagens));
    return 0;
  } catch (erro) {
    const mensagem =
      erro instanceof Error &&
      /^(Arquivo de cargas inválido|Carga inválida|Carga excede|Registro excede|Configure|Somente URL|Use --arquivo|Não foi possível ler|Falha no transporte|Envio interrompido|Recibo inválido|Carga não publicada)/.test(
        erro.message
      )
        ? erro.message
        : "Não foi possível processar as cargas.";
    console.error(mensagem);
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await executarEnvio(process.argv.slice(2));
}
