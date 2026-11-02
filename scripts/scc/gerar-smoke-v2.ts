import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { criarAmostrasV2 } from "./amostra-v2";

export async function executarGerador(args: string[]): Promise<number> {
  try {
    const { values } = parseArgs({
      args,
      strict: true,
      options: { saida: { type: "string" } },
    });
    if (!values.saida) throw new Error();
    await writeFile(
      values.saida,
      `${JSON.stringify(criarAmostrasV2(), null, 2)}\n`,
      { flag: "wx" }
    );
    console.log("Arquivo de cargas fictícias criado.");
    return 0;
  } catch {
    console.error("Não foi possível criar o arquivo de cargas fictícias.");
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await executarGerador(process.argv.slice(2));
}
