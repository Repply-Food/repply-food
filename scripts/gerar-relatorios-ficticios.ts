import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  criarAmostras,
  criarDiaVazio,
  criarPeriodoParcial,
} from "./relatorios/amostra.ts";

export async function executarGerador(args: string[]): Promise<number> {
  try {
    const { values } = parseArgs({
      args,
      options: {
        saida: { type: "string" },
        cenario: { type: "string", default: "completo" },
      },
      strict: true,
    });
    if (!values.saida) throw new Error();
    const cenarios = {
      completo: criarAmostras,
      "dia-vazio": criarDiaVazio,
      "periodo-parcial": criarPeriodoParcial,
    };
    if (!Object.hasOwn(cenarios, values.cenario)) throw new Error();
    const gerar = cenarios[values.cenario as keyof typeof cenarios];
    await writeFile(values.saida, `${JSON.stringify(gerar(), null, 2)}\n`, {
      flag: "wx",
    });
    return 0;
  } catch {
    console.error(
      "Não foi possível gerar. Use --saida com arquivo novo e --cenario completo|dia-vazio|periodo-parcial."
    );
    return 1;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await executarGerador(process.argv.slice(2));
}
