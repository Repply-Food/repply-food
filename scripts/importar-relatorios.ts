import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { fotografiaSchema } from "../supabase/functions/_shared/relatorios/schemas.ts";
import { criarTransporteLocal, enviarFotografia } from "./relatorios/enviar.ts";
import {
  ErroRelatorios,
  fragmentarFotografia,
} from "./relatorios/fragmentar.ts";

export async function executarImportador(
  args: string[],
  ambiente: Record<string, string | undefined> = process.env
): Promise<number> {
  try {
    let arquivo: string;
    let dryRun: boolean;
    try {
      const { values } = parseArgs({
        args,
        options: {
          arquivo: { type: "string" },
          "dry-run": { type: "boolean", default: false },
        },
        strict: true,
      });
      if (!values.arquivo) throw new Error();
      arquivo = values.arquivo;
      dryRun = values["dry-run"];
    } catch {
      throw new ErroRelatorios("Use --arquivo e, para validar, --dry-run.");
    }
    let bruto: unknown;
    try {
      bruto = JSON.parse(await readFile(arquivo, "utf8"));
    } catch {
      throw new ErroRelatorios("Não foi possível ler o arquivo JSON.");
    }
    const validado = z.array(fotografiaSchema).min(1).safeParse(bruto);
    if (!validado.success)
      throw new ErroRelatorios("Arquivo de fotografias inválido.");
    const fotografias = validado.data;
    // Valida inclusive a última carga antes de enviar qualquer página da primeira.
    const contagens = { relatorios: fotografias.length, linhas: 0, paginas: 0 };
    for (const fotografia of fotografias) {
      const pedidos = fragmentarFotografia(fotografia);
      contagens.linhas += fotografia.linhas.length;
      contagens.paginas += pedidos.length - 1;
    }
    if (!dryRun) {
      const transporte = criarTransporteLocal(
        ambiente.RF_RELATORIOS_URL ?? "",
        ambiente.RF_RELATORIOS_TOKEN ?? ""
      );
      for (const fotografia of fotografias)
        await enviarFotografia(fotografia, transporte);
    }
    console.log(JSON.stringify(contagens));
    return 0;
  } catch (erro) {
    console.error(
      erro instanceof ErroRelatorios
        ? erro.message
        : "Não foi possível processar os relatórios."
    );
    return 1;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await executarImportador(process.argv.slice(2));
}
