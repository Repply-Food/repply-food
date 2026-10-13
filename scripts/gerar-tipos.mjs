import { execFile } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import ts from "typescript";

const executar = promisify(execFile);

function validarTipos(arquivo, conteudo) {
  if (!conteudo.trim()) throw new Error("saida_vazia");
  const programa = ts.createProgram([arquivo], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
  });
  if (ts.getPreEmitDiagnostics(programa).length)
    throw new Error("typescript_invalido");
  const fonte = programa.getSourceFile(arquivo);
  const aliases = fonte?.statements.filter(
    (declaracao) =>
      ts.isTypeAliasDeclaration(declaracao) &&
      declaracao.modifiers?.some(
        (modificador) => modificador.kind === ts.SyntaxKind.ExportKeyword
      )
  );
  const json = aliases?.find((alias) => alias.name.text === "Json");
  const database = aliases?.find((alias) => alias.name.text === "Database");
  // Contrato canônico do Supabase, não apenas nomes em um comentário/string.
  const membrosJson =
    json && ts.isUnionTypeNode(json.type)
      ? json.type.types
          .map((tipo) =>
            tipo
              .getText(fonte)
              .replace(/\s/g, "")
              .replace(/;(?=})/g, "")
          )
          .sort()
      : [];
  const jsonEsperado = [
    "string",
    "number",
    "boolean",
    "null",
    "{[key:string]:Json|undefined}",
    "Json[]",
  ].sort();
  if (JSON.stringify(membrosJson) !== JSON.stringify(jsonEsperado))
    throw new Error("json_invalido");
  const checker = programa.getTypeChecker();
  const tipoBanco = database && checker.getTypeAtLocation(database);
  const publico = tipoBanco?.getProperty("public");
  if (!publico || !database || !fonte) throw new Error("database_invalido");
  const schema = checker.getTypeOfSymbolAtLocation(publico, database);
  for (const nome of [
    "Tables",
    "Views",
    "Functions",
    "Enums",
    "CompositeTypes",
  ]) {
    const propriedade = schema.getProperty(nome);
    if (!propriedade) throw new Error("schema_invalido");
    const tipo = checker.getTypeOfSymbolAtLocation(propriedade, database);
    if (!(tipo.flags & ts.TypeFlags.Object)) throw new Error("schema_invalido");
  }
}

async function gerarTipos() {
  const argumentos = process.argv.slice(2);
  if (
    argumentos.length &&
    (argumentos.length !== 2 || argumentos[0] !== "--db-url" || !argumentos[1])
  ) {
    throw new Error("argumentos_invalidos");
  }
  const destino = resolve("types/database.types.ts");
  // Mesmo filesystem do destino para rename atômico. Só esta pasta própria
  // será removida, inclusive quando CLI/validação/rename falham.
  const pasta = await mkdtemp(join(dirname(destino), ".gerar-tipos-"));
  try {
    let resultado;
    try {
      resultado = await executar(
        "npx",
        [
          "supabase",
          "gen",
          "types",
          "typescript",
          ...(argumentos.length ? argumentos : ["--local"]),
        ],
        { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 }
      );
    } catch {
      // Não imprimir comando, URL, stderr ou Error da CLI: pode haver segredo.
      throw new Error("cli_falhou");
    }
    const arquivo = join(pasta, "database.types.ts");
    await writeFile(arquivo, resultado.stdout, { flag: "wx", mode: 0o600 });
    validarTipos(arquivo, resultado.stdout);
    const anterior = await readFile(destino, "utf8").catch((erro) => {
      if (erro.code === "ENOENT") return null;
      throw erro;
    });
    if (anterior === resultado.stdout) {
      console.info("Tipos válidos; destino já corresponde ao banco.");
    } else {
      await rename(arquivo, destino);
      console.info("Tipos válidos; destino substituído atomicamente.");
    }
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

try {
  await gerarTipos();
} catch {
  console.error(
    "Falha na geração/validação ou limpeza. Confira a CLI, a configuração local e o destino."
  );
  process.exitCode = 1;
}
