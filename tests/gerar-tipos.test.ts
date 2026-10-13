// @vitest-environment node
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const executar = promisify(execFile);
const diretorios: string[] = [];
const original = await readFile("types/database.types.ts", "utf8");
const anterior = `// destino anterior da fixture\n${original}`;

afterEach(async () => {
  for (const diretorio of diretorios.splice(0))
    await rm(diretorio, { recursive: true, force: true });
});

async function cenario(
  saida: string,
  exit: number,
  conteudoAnterior = anterior,
  argumentos = "--db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres"
) {
  const pasta = await mkdtemp("/tmp/opencode/tipos-8c-");
  diretorios.push(pasta);
  await mkdir(join(pasta, "types"));
  await mkdir(join(pasta, "bin"));
  await mkdir(join(pasta, "scripts"));
  await symlink(resolve("node_modules"), join(pasta, "node_modules"));
  const pacote = JSON.parse(await readFile("package.json", "utf8"));
  // No RED executa o comando inline EXISTENTE, nunca um import ausente.
  if (pacote.scripts.types.includes("scripts/gerar-tipos.mjs")) {
    await copyFile(
      "scripts/gerar-tipos.mjs",
      join(pasta, "scripts/gerar-tipos.mjs")
    );
  }
  const destino = join(pasta, "types/database.types.ts");
  await writeFile(destino, conteudoAnterior);
  const inodeAnterior = (await stat(destino)).ino;
  await mkdir(join(pasta, "types/.gerar-tipos-alheio"));
  await writeFile(
    join(pasta, "types/.gerar-tipos-alheio/marcador"),
    "arquivo alheio intacto"
  );
  await writeFile(join(pasta, "saida.txt"), saida);
  await writeFile(
    join(pasta, "bin/npx"),
    `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.slice(2, 7).join(' ') !== 'supabase gen types typescript --db-url' &&
    process.argv.slice(2).join(' ') !== 'supabase gen types typescript --local') process.exit(64);
process.stdout.write(fs.readFileSync('saida.txt'));
if (${exit}) process.stderr.write('segredo_ficticio_nao_logar');
process.exit(${exit});
`,
    { mode: 0o700 }
  );
  let codigo = 0;
  let stderr = "";
  try {
    const resultado = await executar(
      "sh",
      ["-c", `${pacote.scripts.types} ${argumentos}`],
      {
        cwd: pasta,
        env: {
          ...process.env,
          PATH: `${join(pasta, "bin")}:${process.env.PATH}`,
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
    destino: await readFile(destino, "utf8"),
    inodePreservado: (await stat(destino)).ino === inodeAnterior,
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
    [
      "Database nulo",
      "export type Json = string; export type Database = null;",
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
    const resultado = await cenario(original, 0, original, "");
    expect(resultado.codigo).toBe(0);
    expect(resultado.destino).toBe(original);
    expect(resultado.inodePreservado).toBe(true);
    expect(resultado.temporarios).toEqual([]);
  });
});
