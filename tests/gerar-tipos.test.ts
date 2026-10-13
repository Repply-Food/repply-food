// @vitest-environment node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const executar = promisify(execFile);
const script = resolve("scripts/gerar-tipos.mjs");
const urlLocal = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const diretorios: string[] = [];
const original = await readFile("types/database.types.ts", "utf8");
const anterior = `// destino anterior da fixture\n${original}`;
const jsonCanonico = original.match(/export type Json = [^\n]+/)?.[0];
if (!jsonCanonico) throw new Error("Json canônico gerado não encontrado");

afterEach(async () => {
  for (const diretorio of diretorios.splice(0))
    await rm(diretorio, { recursive: true, force: true });
});

/**
 * Põe um `npx` de mentira na frente do PATH. Ele devolve `saida.txt` no lugar
 * da CLI do Supabase e deixa `chamado.txt` para o teste saber que foi usado.
 */
async function instalarNpxFalso(bin: string, exit: number): Promise<void> {
  const falso = join(bin, "npx-falso.cjs");
  await writeFile(
    falso,
    `const fs = require("node:fs");
fs.writeFileSync("chamado.txt", "sim");
const args = process.argv.slice(2).join(" ");
if (!args.startsWith("supabase gen types typescript --db-url ") &&
    args !== "supabase gen types typescript --local") process.exit(64);
process.stdout.write(fs.readFileSync("saida.txt"));
if (${exit}) process.stderr.write("segredo_ficticio_nao_logar");
process.exit(${exit});
`
  );
  if (process.platform === "win32") {
    // No Windows o npx é um .cmd, que o script chama através do cmd.exe.
    await writeFile(
      join(bin, "npx.cmd"),
      `@echo off\r\n"${process.execPath}" "%~dp0npx-falso.cjs" %*\r\n`
    );
    return;
  }
  const npx = join(bin, "npx");
  await writeFile(
    npx,
    `#!/bin/sh\nexec "${process.execPath}" "${falso}" "$@"\n`
  );
  await chmod(npx, 0o700);
}

async function cenario(
  saida: string,
  exit: number,
  conteudoAnterior = anterior,
  argumentos: string[] = ["--db-url", urlLocal]
) {
  const pasta = await mkdtemp(join(tmpdir(), "rf-gerar-tipos-"));
  diretorios.push(pasta);
  await mkdir(join(pasta, "types"));
  await mkdir(join(pasta, "bin"));
  const destino = join(pasta, "types/database.types.ts");
  await writeFile(destino, conteudoAnterior);
  const inodeAnterior = (await stat(destino, { bigint: true })).ino;
  await mkdir(join(pasta, "types/.gerar-tipos-alheio"));
  await writeFile(
    join(pasta, "types/.gerar-tipos-alheio/marcador"),
    "arquivo alheio intacto"
  );
  await writeFile(join(pasta, "saida.txt"), saida);
  await instalarNpxFalso(join(pasta, "bin"), exit);
  // No Windows a variável se chama "Path": tira qualquer grafia e põe uma só.
  const ambiente = Object.fromEntries(
    Object.entries(process.env).filter(
      ([nome]) => nome.toLowerCase() !== "path"
    )
  ) as NodeJS.ProcessEnv;
  let codigo = 0;
  let stderr = "";
  try {
    const resultado = await executar(
      process.execPath,
      [script, ...argumentos],
      {
        cwd: pasta,
        env: {
          ...ambiente,
          PATH: `${join(pasta, "bin")}${delimiter}${process.env.PATH ?? ""}`,
        },
        timeout: 20_000,
      }
    );
    stderr = resultado.stderr;
  } catch (erro) {
    const falha = erro as { code: number; stderr: string };
    codigo = falha.code;
    stderr = falha.stderr;
  }
  expect(
    await readFile(join(pasta, "types/.gerar-tipos-alheio/marcador"), "utf8")
  ).toBe("arquivo alheio intacto");
  return {
    codigo,
    stderr,
    cliChamada: existsSync(join(pasta, "chamado.txt")),
    destino: await readFile(destino, "utf8"),
    inodePreservado:
      (await stat(destino, { bigint: true })).ino === inodeAnterior,
    temporarios: (await readdir(join(pasta, "types"))).filter(
      (nome) => !["database.types.ts", ".gerar-tipos-alheio"].includes(nome)
    ),
  };
}

describe("geração CLI atômica de tipos em destino próprio", () => {
  it.each([
    ["CLI falha após saída parcial", "export type Json =", 1],
    ["saída vazia", "", 0],
    ["texto inválido", "não é TypeScript!", 0],
    [
      "TypeScript malformado",
      "export type Json = string; export type Database = {",
      0,
    ],
    ["zero", "0", 0],
    ["Json ausente", "export type Database = { public: { Tables: {} } };", 0],
    ["Database nulo", `${jsonCanonico}; export type Database = null;`, 0],
    ["Database ausente com Json válido", `${jsonCanonico};`, 0],
    [
      "Database public incompleto com Json válido",
      `${jsonCanonico}; export type Database = { public: { Tables: {} } };`,
      0,
    ],
    [
      "Database área escalar com Json válido",
      `${jsonCanonico}; export type Database = { public: { Tables: number; Views: {}; Functions: {}; Enums: {}; CompositeTypes: {} } };`,
      0,
    ],
    [
      "Json incorreto",
      "export type Json = Date; export type Database = { public: {} };",
      0,
    ],
    [
      "referência TS inexistente",
      `${original}\nexport type Falha = TipoInexistente;`,
      0,
    ],
  ] as const)(
    "%s preserva destino, falha e remove só temporário próprio",
    async (_, saida, exit) => {
      const resultado = await cenario(saida, exit);
      expect(resultado.destino).toBe(anterior);
      expect(resultado.inodePreservado).toBe(true);
      expect(resultado.codigo).not.toBe(0);
      expect(resultado.temporarios).toEqual([]);
      expect(resultado.stderr).not.toContain("segredo_ficticio_nao_logar");
    }
  );

  it("sucesso válido substitui todo o destino e não deixa temporários", async () => {
    const resultado = await cenario(original, 0);
    expect(resultado.codigo).toBe(0);
    expect(resultado.destino).toBe(original);
    expect(resultado.inodePreservado).toBe(false);
    expect(resultado.temporarios).toEqual([]);
  });

  it("saída igual é comparada antes do rename e preserva inode, também em --local", async () => {
    const resultado = await cenario(original, 0, original, []);
    expect(resultado.codigo).toBe(0);
    expect(resultado.destino).toBe(original);
    expect(resultado.inodePreservado).toBe(true);
    expect(resultado.temporarios).toEqual([]);
  });

  it("o npm run types chama o script deste repositório", async () => {
    const pacote = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pacote.scripts.types).toBe("node scripts/gerar-tipos.mjs");
  });

  it("recusa URL com caractere que o shell do Windows interpretaria, sem chamar a CLI", async () => {
    const resultado = await cenario(original, 0, anterior, [
      "--db-url",
      `${urlLocal}?a=1&calc`,
    ]);
    expect(resultado.codigo).not.toBe(0);
    expect(resultado.cliChamada).toBe(false);
    expect(resultado.destino).toBe(anterior);
    expect(resultado.temporarios).toEqual([]);
  });
});
