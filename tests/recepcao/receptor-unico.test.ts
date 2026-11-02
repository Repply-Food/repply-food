import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

it("mantém apenas o receptor SCC unificado no código executável", () => {
  const antigo = ["receber", "relatorios"].join("-");
  expect(existsSync(join("supabase/functions", antigo))).toBe(false);
  expect(readFileSync("supabase/config.toml", "utf8")).not.toContain(antigo);

  const arquivos = (diretorio: string): string[] =>
    readdirSync(diretorio, { withFileTypes: true }).flatMap((entrada) => {
      const caminho = join(diretorio, entrada.name);
      return entrada.isDirectory() ? arquivos(caminho) : [caminho];
    });
  for (const arquivo of [
    "app",
    "lib",
    "scripts",
    "supabase/functions",
    "tests",
  ].flatMap(arquivos)) {
    if (/\.(ts|tsx|js|mjs|json)$/.test(arquivo)) {
      expect(readFileSync(arquivo, "utf8"), arquivo).not.toContain(antigo);
    }
  }
});
