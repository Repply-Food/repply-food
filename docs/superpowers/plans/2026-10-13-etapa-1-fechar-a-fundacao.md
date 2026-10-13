# Etapa 1 · Fechar a fundação — Plano de Implementação

> **Para agentes de execução:** É OBRIGATÓRIO usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para rastreamento.

**Objetivo:** Fechar as nove pendências da revisão de 13/10/2026 e os achados do estudo, para que a fundação possa receber login, admin e métricas sem risco de vazar dado entre restaurantes, gravar dado pessoal ou alarmar em falso.

**Arquitetura:** Nada novo de produto. São correções na base que já existe: três mudanças de banco novas (nunca se edita migration antiga), ajustes na função `receber-envio`, um módulo novo com a lista de campos aceitos, e testes que hoje faltam. A verificação passa a fechar no Windows e no Linux.

**Stack:** Next.js 16, TypeScript estrito, Supabase (Postgres 17 + RLS, Edge Functions em Deno, pg_cron), Vitest, Biome, CLI do Supabase via `npx`.

**Este plano é a etapa 1 de 11** do plano do MVP aprovado pelo Lucas Ferreira em 13/10/2026. As etapas seguintes (entrar e moldura, admin, primeira publicação, Hoje, Ajustes, Resultados, PDF, alarme por e-mail, ensaio geral, piloto) ganham um plano próprio cada uma.

## Restrições Globais

- **Idioma:** tudo em português do Brasil; domínio em português (tabelas, colunas, funções).
- **Nuvem: proibido nesta etapa.** Nada de `supabase db push`, `--linked`, `functions deploy`, `secrets set`, `config push`, Vercel ou DNS. Tudo roda no banco local (`127.0.0.1`).
- **`git push`: só com o ok do Lucas Ferreira, pedido a cada envio.** Commits locais são livres.
- **Git:** `git fetch` antes de começar e antes de cada commit; se entrou commit de outra pessoa na mesma área, pare e avise. Nunca `git add -A`, `--force`, `--no-verify`. Mensagens em PT-BR, no imperativo, com o trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Migrations só se acrescentam.** Nunca edite um arquivo de `supabase/migrations/` que já existe. Proibido `FORCE ROW LEVEL SECURITY`.
- **Banco local:** nunca `supabase db reset` numa máquina com dados de demonstração. Para aplicar mudança nova use `npx supabase migration up --local`.
- **TypeScript:** nunca `any`. Tipos do banco só por `npm run types`.
- **Dados:** dado real nunca entra em teste. Log só com código e mensagem curta.
- **Formatação:** depois de criar ou editar arquivo `.ts`/`.mjs`/`.json`, rode `npx biome check --write <arquivos>` antes do commit.
- **Verificação antes de dizer "feito":** `npx tsc --noEmit`, `npm run check`, `npm run test`, `npm run build`, com a saída conferida.

## O que NÃO entra nesta etapa

| Fica para | O quê |
|---|---|
| Etapa 2 | Alinhar as bibliotecas com as do Repply Imob; teste de comportamento do cadastro fechado (aqui só se confere o arquivo de configuração) |
| Etapa 3 | Admin exigir horário de funcionamento e o banco validar formato de horário e fuso |
| Etapa 4 | Trava do ambiente de desenvolvimento contra a nuvem no cliente de serviço; configuração do login na nuvem |
| Etapa 9 | O alarme por e-mail inteiro (`enviar-alerta`, confirmação de envio, aviso de "voltou") |

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `.gitattributes` | Criar | Fim de linha LF em toda máquina |
| `tests/repositorio/fim-de-linha.test.ts` | Criar | Reprova CRLF na pasta de trabalho |
| `scripts/gerar-tipos.mjs` | Modificar | Chamar a CLI também no Windows |
| `tests/gerar-tipos.test.ts` | Modificar | Teste portátil (sem `/tmp`, sem `sh`, sem link simbólico) |
| `.env.example` · `README.md` | Modificar | Como apontar o desenvolvimento para o banco local |
| `package.json` | Modificar | Tirar o atalho que muda o banco da nuvem |
| `scripts/gerador-dados-ficticios.ts` | Modificar | Recusar endereço de fora sem confirmação |
| `tests/gerador/trava-nuvem.test.ts` | Criar | Testa as duas travas |
| `supabase/migrations/20261013120000_funcoes_nascem_fechadas.sql` | Criar | Função nova nasce sem permissão para login nenhum |
| `tests/isolamento/funcoes-fechadas.test.ts` | Criar | Lista fechada de funções abertas |
| `tests/isolamento/todas-as-tabelas.test.ts` | Criar | Isolamento nas 8 tabelas |
| `supabase/functions/_shared/registro-erro.ts` | Modificar | 429 não conta como envio; nomes de campos desconhecidos |
| `supabase/functions/_shared/campos-permitidos.ts` | Criar | A lista do que a nuvem aceita guardar |
| `supabase/functions/receber-envio/index.ts` | Modificar | Usa a lista e o novo registro de erro |
| `supabase/migrations/20261013130000_recepcao_so_grava_campos_conhecidos.sql` | Criar | Coluna `envios.campos_desconhecidos` e `processar_envio` com a lista |
| `tests/recepcao/campos-permitidos.test.ts` | Criar | Teste de unidade da lista |
| `tests/recepcao/envio.test.ts` · `tests/recepcao/registro-erro.test.ts` · `tests/isolamento/rpc-privilegada.test.ts` | Modificar | Casos novos e assinaturas novas |
| `supabase/migrations/20261013140000_vigia_resiliente.sql` | Criar | `aberto_desde`, vigia que não para e não alarma na abertura |
| `tests/rotinas/aberto-desde.test.ts` | Criar | Casos de horário de funcionamento |
| `tests/rotinas/estados-retencao.test.ts` | Modificar | Casos novos do vigia |
| `supabase/config.toml` | Modificar | Cadastro público desligado, senha mínima 8 |
| `lib/auth/senha.ts` | Criar | A regra de senha num lugar só |
| `tests/auth/regra-de-senha.test.ts` | Criar | Configuração e código dizem o mesmo |
| `types/database.types.ts` | Gerar | Tipos do banco |
| `docs/decisoes.md` · `docs/integracao-scc/contrato-de-dados.md` · `docs/arquitetura/*.md` · `docs/operacao/publicar.md` · `docs/divida-tecnica.md` | Modificar | Documento acompanha o comportamento, no mesmo commit |

---

## Tarefa 0: Preparação

**Arquivos:** nenhum alterado, só o commit deste plano.

**Interfaces:** Consome: nada. Produz: repositório atualizado e este plano commitado.

- [ ] **Passo 1: Conferir o que entrou no repositório**

```bash
git fetch --all --prune
git status -sb
git log --oneline -5 origin/main
```

Esperado: `## main...origin/main` sem `[behind N]`. Se houver commits novos, leia-os (`git log -p HEAD..origin/main`) antes de seguir. Se mexerem em `supabase/`, `tests/` ou `scripts/`, pare e avise o Lucas Ferreira.

- [ ] **Passo 2: Commitar este plano**

```bash
git status --short
git add docs/superpowers/plans/2026-10-13-etapa-1-fechar-a-fundacao.md
git commit -m "Adiciona o plano da etapa 1: fechar a fundação" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 1: Fim de linha igual em toda máquina

**Por quê:** no Windows o git grava os arquivos com CRLF na pasta de trabalho, e o Biome reprova a formatação dos 42 arquivos. No Linux passa. Um `.gitattributes` faz as duas máquinas verem o mesmo.

**Arquivos:**
- Criar: `.gitattributes`
- Criar: `tests/repositorio/fim-de-linha.test.ts`

**Interfaces:** Consome: nada. Produz: `npm run check` verde no Windows.

- [ ] **Passo 1: Escrever o teste que falha**

Crie `tests/repositorio/fim-de-linha.test.ts`:

```ts
// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fim de linha do repositório", () => {
  it("o .gitattributes obriga LF em todo arquivo de texto", () => {
    const regras = readFileSync(".gitattributes", "utf8");
    expect(regras).toMatch(/^\* text=auto eol=lf$/m);
  });

  it("nenhum arquivo de texto versionado está com CRLF na pasta de trabalho", () => {
    const saida = execFileSync("git", ["ls-files", "--eol"], {
      encoding: "utf8",
    });
    const comCrlf = saida
      .split("\n")
      .filter((linha) => /\bw\/(crlf|mixed)\b/.test(linha))
      .map((linha) => linha.split("\t")[1]);
    expect(comCrlf).toEqual([]);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `npx vitest run tests/repositorio/fim-de-linha.test.ts`
Esperado no Windows: FALHA nos dois (`ENOENT ... .gitattributes` e uma lista de ~150 arquivos com CRLF). No Linux o segundo já passa.

- [ ] **Passo 3: Criar o `.gitattributes`**

```gitattributes
# Todo arquivo de texto entra e sai do git com LF, em qualquer sistema.
# Sem isto, o Windows (core.autocrlf=true) grava CRLF na pasta de trabalho e o
# Biome reprova a formatação de todos os arquivos.
* text=auto eol=lf

# Binários: nunca converter.
*.png binary
*.ico binary
*.webp binary
*.otf binary
*.ttf binary
```

- [ ] **Passo 4: Regravar a pasta de trabalho com a regra nova**

Só faça isto com a pasta sem mudanças pendentes em arquivos versionados. O comando reescreve os arquivos a partir do que já está no git; não descarta nada que esteja commitado.

```bash
git add .gitattributes tests/repositorio/fim-de-linha.test.ts
git diff --quiet || { echo "PARE: há mudança não preparada em arquivo versionado"; exit 1; }
git checkout-index --force --all
git status --short
```

Esperado: `git status --short` mostra só os dois arquivos novos (`A  .gitattributes` e `A  tests/repositorio/fim-de-linha.test.ts`).

- [ ] **Passo 5: Rodar e ver passar**

```bash
npx biome check --write tests/repositorio/fim-de-linha.test.ts
git add tests/repositorio/fim-de-linha.test.ts
npx vitest run tests/repositorio/fim-de-linha.test.ts
npm run check
```

Esperado: 2 testes passam; o Biome termina com `Checked NN files` e **nenhum** erro. Se sobrar erro que não seja de fim de linha, pare e relate: é problema real que estava escondido.

- [ ] **Passo 6: Commit**

```bash
git fetch && git status -sb
git commit -m "Padroniza o fim de linha com .gitattributes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 2: `npm run types` roda no Windows

**Por quê:** `scripts/gerar-tipos.mjs` chama `npx` direto, e no Windows o `npx` é um arquivo `.cmd` que o Node só executa através do `cmd.exe`. O teste usa `/tmp/opencode`, `sh` e link simbólico, que não existem aqui.

**Arquivos:**
- Modificar: `scripts/gerar-tipos.mjs`
- Modificar: `tests/gerar-tipos.test.ts`

**Interfaces:** Consome: nada. Produz: `npm run types [-- --db-url <url>]` funcionando em Windows e Linux. A URL aceita só os caracteres `A-Z a-z 0-9 . _ ~ : @ / ? = -`.

- [ ] **Passo 1: Reescrever o preparo do teste para ser portátil**

Em `tests/gerar-tipos.test.ts`, substitua **do início do arquivo até o fim da função `cenario`** (linhas 1 a 104) por:

```ts
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
  );
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
```

No mesmo arquivo, no último teste, troque a chamada `cenario(original, 0, original, "")` por `cenario(original, 0, original, [])`.

E acrescente, **antes do fechamento do `describe`**, estes dois testes:

```ts
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
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `npx vitest run tests/gerar-tipos.test.ts`
Esperado no Windows: os testes de "sucesso válido" e "saída igual" FALHAM (o script não consegue executar `npx`); o da URL passa por acaso, porque a CLI nunca é chamada. No Linux é o contrário: só o da URL falha (`cliChamada` vem `true`).

- [ ] **Passo 3: Fazer o script chamar a CLI nos dois sistemas**

Em `scripts/gerar-tipos.mjs`, logo abaixo de `const executar = promisify(execFile);`, acrescente:

```js
// O único argumento livre é a URL do banco. No Windows ela passa pelo cmd.exe,
// então só aceita caracteres sem significado especial para o shell.
const URL_SEGURA = /^postgres(?:ql)?:\/\/[A-Za-z0-9._~:@/?=-]+$/;

function comandoDaCli(argumentosCli) {
  if (process.platform === "win32") {
    // No Windows o npx é um arquivo .cmd: o Node só o executa pelo cmd.exe.
    return [
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", "npx", ...argumentosCli],
    ];
  }
  return ["npx", argumentosCli];
}
```

Na função `gerarTipos`, troque a validação dos argumentos por:

```js
  const argumentos = process.argv.slice(2);
  if (
    argumentos.length &&
    (argumentos.length !== 2 ||
      argumentos[0] !== "--db-url" ||
      !URL_SEGURA.test(argumentos[1] ?? ""))
  ) {
    throw new Error("argumentos_invalidos");
  }
```

E troque a chamada `executar("npx", [...], {...})` por:

```js
      const [comando, argumentosDoComando] = comandoDaCli([
        "supabase",
        "gen",
        "types",
        "typescript",
        ...(argumentos.length ? argumentos : ["--local"]),
      ]);
      resultado = await executar(comando, argumentosDoComando, {
        timeout: 120_000,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      });
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
npx biome check --write scripts/gerar-tipos.mjs tests/gerar-tipos.test.ts
npx vitest run tests/gerar-tipos.test.ts
npx tsc --noEmit
```

Esperado: os 16 testes do arquivo passam (12 da tabela, 2 de sucesso, 2 novos); `tsc` sem erros.

- [ ] **Passo 5: Commit**

```bash
git fetch && git status -sb
git status --short
git add scripts/gerar-tipos.mjs tests/gerar-tipos.test.ts
git commit -m "Faz a geração de tipos rodar no Windows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 3: Banco local do zero nesta máquina (a prova)

**Por quê:** as migrations foram aplicadas à mão no banco local do Lucas Duarte; nunca se provou que elas montam um banco vazio. Esta máquina nunca teve o banco local, então a primeira subida aqui **é** a prova. E o `.env.local` daqui aponta para a nuvem, o que precisa acabar antes de existir tela.

**Arquivos:**
- Modificar: `.env.example`
- Modificar: `README.md` (seção "Rodar localmente")
- Fora do git, só nesta máquina: `.env.local`, `.env.nuvem.local`

**Interfaces:** Consome: Tarefas 1 e 2. Produz: Supabase local no ar em `127.0.0.1:54321/54322`, função `receber-envio` servida, suíte inteira verde. Todas as tarefas seguintes dependem disto.

- [ ] **Passo 1: Conferir que o Rancher Desktop está ligado**

Rode: `docker ps`
Esperado: uma tabela (pode estar vazia). Se vier `failed to connect to the docker API`, peça ao Lucas Ferreira para abrir o Rancher Desktop (modo `dockerd (moby)`, Kubernetes desligado, D-49) e espere.

- [ ] **Passo 2: Guardar as chaves da nuvem fora do caminho**

O `.env.local` atual tem o endereço e a chave de serviço da nuvem. Ele vira `.env.nuvem.local`, que o Next.js não carrega e o git ignora. **Não imprima o conteúdo desses arquivos.**

```bash
test -f .env.nuvem.local && { echo "PARE: .env.nuvem.local já existe"; exit 1; }
grep -q 'supabase\.co' .env.local && mv .env.local .env.nuvem.local
git check-ignore .env.nuvem.local
```

Esperado: a última linha imprime `.env.nuvem.local` (está ignorado). Se o `grep` não achar `supabase.co`, o arquivo já é local: não mova, siga para o Passo 3 e **pule o Passo 5** (ele não sobrescreve um `.env.local` que já existe).

- [ ] **Passo 3: Subir o banco local pela primeira vez**

Rode: `npx supabase start` (a primeira vez baixa as imagens e pode levar mais de 10 minutos).
Esperado: termina com a lista de endereços (`API URL: http://127.0.0.1:54321`, `DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres`).

Se a subida falhar nos contêineres `vector` ou `logflare` (acontece no Windows), rode `npx supabase stop` e depois `npx supabase start -x vector,logflare`. Qualquer outro erro: pare, use `superpowers:systematic-debugging` e relate. Um erro ao aplicar migration aqui é exatamente o que esta tarefa existe para descobrir.

- [ ] **Passo 4: Provar que as migrations montaram o banco**

```bash
npx supabase migration list --local
```

Esperado: as 4 migrations existentes (`20261009120000`, `20261011201500`, `20261011213000`, `20261011213100`) aparecem como aplicadas na coluna local.

- [ ] **Passo 5: Apontar o desenvolvimento para o banco local**

As chaves locais são as de desenvolvimento do Supabase, iguais em qualquer máquina. O comando grava o arquivo sem mostrar os valores.

```bash
ARQ=$(mktemp)
npx supabase status -o env > "$ARQ" 2>/dev/null
node -e '
const fs = require("node:fs");
const v = Object.fromEntries(
  fs.readFileSync(process.argv[1], "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
  })
);
for (const nome of ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"]) {
  if (!v[nome]) { console.error("faltou " + nome); process.exit(1); }
}
fs.writeFileSync(".env.local", [
  "# Desenvolvimento: SEMPRE o banco local. As chaves da nuvem ficam em .env.nuvem.local.",
  "NEXT_PUBLIC_SUPABASE_URL=" + v.API_URL,
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=" + v.ANON_KEY,
  "SUPABASE_URL=" + v.API_URL,
  "SUPABASE_SERVICE_ROLE_KEY=" + v.SERVICE_ROLE_KEY,
  "NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000",
  "",
].join("\n"), { flag: "wx" });
console.log(".env.local criado apontando para", v.API_URL);
' "$ARQ"
rm "$ARQ"
```

Esperado: `.env.local criado apontando para http://127.0.0.1:54321`. Se sair `faltou <NOME>`, esta versão da CLI usa outro nome para a variável: veja os nomes com `npx supabase status -o env | cut -d= -f1` (sem imprimir os valores) e ajuste os três nomes no comando.

- [ ] **Passo 6: Servir a função de recepção**

Num terminal que fique aberto (em segundo plano): `npx supabase functions serve receber-envio`

Confira: `curl --max-time 5 -o /dev/null -s -w '%{http_code}\n' http://127.0.0.1:54321/functions/v1/receber-envio`
Esperado: `405`. Se vier `503`, espere a função terminar de carregar e repita.

- [ ] **Passo 7: Rodar a suíte inteira**

Rode: `npm run test`
Esperado: todos os arquivos passam, nenhum teste pulado. É a primeira vez que os testes de banco rodam nesta máquina, sobre um banco montado do zero. Se algum falhar, pare, use `superpowers:systematic-debugging` e relate antes de consertar.

- [ ] **Passo 8: Gerar os tipos de verdade (prova da Tarefa 2)**

Rode: `npm run types -- --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres`
Esperado: `Tipos válidos; destino já corresponde ao banco.`
Se disser `destino substituído`, rode `git diff --stat types/database.types.ts`. Se a diferença for o arquivo inteiro (versão diferente da CLI), **não commite**: desfaça com `git checkout -- types/database.types.ts` e relate ao Lucas Ferreira.

- [ ] **Passo 9: Documentar o ambiente local**

Em `.env.example`, troque a primeira linha por:

```bash
# DESENVOLVIMENTO USA SEMPRE O BANCO LOCAL. Preencha com os valores de `npx supabase status`.
# As chaves da NUVEM nunca ficam no .env.local: guarde-as em .env.nuvem.local (ignorado
# pelo git e não lido pelo Next.js) e use só na publicação, com autorização.
# Nunca exponha a chave de serviço com NEXT_PUBLIC_.
```

Em `README.md`, na seção "Rodar localmente (fundação)", troque o item de pré-requisito do Docker por:

```markdown
- **Contêineres:** Docker Engine (Linux) ou **Rancher Desktop** em modo `dockerd (moby)` com o Kubernetes desligado (Windows, D-49). No Windows, se a subida falhar nos contêineres `vector` ou `logflare`, use `npx supabase start -x vector,logflare`.
```

E troque o bloco "Passo a passo" por:

````markdown
**Passo a passo:**
```bash
# 1) Instalar dependências
npm i

# 2) Iniciar o banco local (a primeira vez aplica todas as migrations num banco vazio)
npx supabase start

# 3) Configurar variáveis: copie o exemplo e preencha com os valores de `npx supabase status`
cp .env.example .env.local

# 4) Rodar em desenvolvimento
npm run dev
```

O `.env.local` aponta **sempre** para o banco local. As chaves da nuvem ficam em `.env.nuvem.local`, que o git ignora e o Next.js não lê.
````

- [ ] **Passo 10: Verificar e commitar**

```bash
npm run check
git fetch && git status -sb
git status --short
git add .env.example README.md
git commit -m "Documenta o ambiente local e separa as chaves da nuvem" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Esperado em `git status --short`: só `.env.example` e `README.md`. Os arquivos `.env.local` e `.env.nuvem.local` **não** podem aparecer.

---

## Tarefa 4: Travas contra a nuvem

**Por quê:** `npm run supabase:migrate` é um nome inofensivo para um comando que muda o banco da nuvem, e o gerador envia para qualquer endereço que receber em `SCC_URL`.

**Arquivos:**
- Modificar: `package.json`
- Modificar: `scripts/gerador-dados-ficticios.ts` (cabeçalho e `lerConfig`)
- Modificar: `README.md` (tabela de opções do gerador)
- Criar: `tests/gerador/trava-nuvem.test.ts`

**Interfaces:** Consome: nada. Produz: `enderecoLocal(url: string): boolean` exportada do gerador; opção `--confirmo-nuvem`.

- [ ] **Passo 1: Escrever o teste que falha**

Crie `tests/gerador/trava-nuvem.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enderecoLocal,
  lerConfig,
} from "../../scripts/gerador-dados-ficticios";

const fuso = ["--fuso", "America/Fortaleza"];
const locais = [
  "http://127.0.0.1:54321/functions/v1/receber-envio",
  "http://localhost:54321/functions/v1/receber-envio",
  "http://[::1]:54321/functions/v1/receber-envio",
];
const deFora = [
  "https://exemplo.supabase.co/functions/v1/receber-envio",
  "http://192.168.0.10:54321/functions/v1/receber-envio",
  "http://127.0.0.1.exemplo.com/functions/v1/receber-envio",
  "endereco-invalido",
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("travas contra a nuvem", () => {
  it.each(locais)("reconhece %s como endereço desta máquina", (url) => {
    expect(enderecoLocal(url)).toBe(true);
  });

  it.each(deFora)("não reconhece %s como endereço desta máquina", (url) => {
    expect(enderecoLocal(url)).toBe(false);
  });

  it.each(locais)("o gerador envia sem confirmação para %s", (url) => {
    vi.stubEnv("SCC_URL", url);
    expect(lerConfig(fuso).url).toBe(url);
  });

  it.each(deFora)("o gerador recusa %s sem confirmação", (url) => {
    vi.stubEnv("SCC_URL", url);
    expect(() => lerConfig(fuso)).toThrow("--confirmo-nuvem");
  });

  it("o gerador aceita endereço de fora com --confirmo-nuvem", () => {
    vi.stubEnv("SCC_URL", deFora[0]);
    expect(lerConfig([...fuso, "--confirmo-nuvem"]).url).toBe(deFora[0]);
  });

  it("o dry-run não pede confirmação, porque não envia nada", () => {
    vi.stubEnv("SCC_URL", deFora[0]);
    expect(lerConfig(["--dry-run"]).dryRun).toBe(true);
  });

  it("o package.json não tem atalho que mexa na nuvem", () => {
    const pacote = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    for (const comando of Object.values(pacote.scripts)) {
      expect(comando).not.toMatch(
        /db push|--linked|functions deploy|secrets set|config push/
      );
    }
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `npx vitest run tests/gerador/trava-nuvem.test.ts`
Esperado: FALHA (`enderecoLocal is not a function`, o gerador não recusa endereço de fora, e o `package.json` tem `db push`).

- [ ] **Passo 3: Tirar o atalho do `package.json`**

Em `package.json`, apague a linha:

```json
    "supabase:migrate": "npx supabase db push",
```

Aplicar mudança de banco na nuvem passa a ser só o comando digitado por inteiro, no roteiro de publicação da etapa 4, com autorização.

- [ ] **Passo 4: Pôr a trava no gerador**

Em `scripts/gerador-dados-ficticios.ts`, no comentário do topo, acrescente depois da linha de `--fuso`:

```ts
 *   --confirmo-nuvem      obrigatória quando SCC_URL não é desta máquina
 *                         (127.0.0.1, localhost ou ::1). Enviar dados
 *                         fictícios para a nuvem exige a autorização do
 *                         Lucas Ferreira
```

Logo acima de `export function lerConfig`, acrescente:

```ts
/** O endereço é desta máquina? Só 127.0.0.1, localhost e ::1 contam. */
export function enderecoLocal(url: string): boolean {
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}
```

Dentro de `lerConfig`, depois do bloco que valida o fuso e antes do `return`, acrescente:

```ts
  const url =
    process.env.SCC_URL ?? "http://127.0.0.1:54321/functions/v1/receber-envio";
  if (!dryRun && !enderecoLocal(url) && !argv.includes("--confirmo-nuvem")) {
    throw new Error(
      "SCC_URL aponta para fora desta máquina. Enviar dados fictícios para a nuvem exige a autorização do Lucas Ferreira e a opção --confirmo-nuvem"
    );
  }
```

E, no objeto devolvido, troque a propriedade `url` inteira (as três linhas com `process.env.SCC_URL ?? ...`) por:

```ts
    url,
```

- [ ] **Passo 5: Documentar a opção**

Em `README.md`, na tabela de opções do gerador, acrescente a linha depois de `--dry-run`:

```markdown
| `--confirmo-nuvem` | Obrigatória quando `SCC_URL` não é desta máquina. Só com a autorização do Lucas Ferreira |
```

- [ ] **Passo 6: Rodar e ver passar**

```bash
npx biome check --write scripts/gerador-dados-ficticios.ts tests/gerador/trava-nuvem.test.ts package.json
npx vitest run tests/gerador
npx tsc --noEmit
```

Esperado: `trava-nuvem.test.ts` e `algoritmo.test.ts` passam inteiros; `tsc` sem erros.

- [ ] **Passo 7: Commit**

```bash
git fetch && git status -sb
git status --short
git add package.json scripts/gerador-dados-ficticios.ts tests/gerador/trava-nuvem.test.ts README.md
git commit -m "Trava o gerador e tira o atalho que muda o banco da nuvem" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 5: Função nova no banco nasce fechada

**Por quê:** no Postgres toda função nasce executável por qualquer um, e o Supabase ainda concede a `anon` e `authenticated`. Foi preciso uma migration só para fechar três funções. As métricas vêm aí: uma `metrica_*` esquecida aberta entregaria o faturamento de um restaurante a qualquer login.

**Arquivos:**
- Criar: `supabase/migrations/20261013120000_funcoes_nascem_fechadas.sql`
- Criar: `tests/isolamento/funcoes-fechadas.test.ts`
- Modificar: `docs/arquitetura/seguranca-e-isolamento.md`

**Interfaces:** Consome: Tarefa 3 (banco local). Produz: a regra "função nova nasce fechada" e a **lista fechada** de funções abertas: `tem_acesso(uuid)` e `eh_admin_repply()` para `anon` e `authenticated`; `atualizar_turnos(uuid, jsonb)` só para `authenticated`. Quem criar função que o painel chama precisa dar o `grant` na própria migration e acrescentá-la a essa lista.

- [ ] **Passo 1: Escrever o teste que falha**

Crie `tests/isolamento/funcoes-fechadas.test.ts`:

```ts
// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conectarBanco } from "../helpers/supabase-local";

/**
 * A lista inteira do que um login (ou alguém sem login) pode executar.
 * Função nova que o painel precise chamar entra aqui DE PROPÓSITO, junto
 * com o grant na migration. Se este teste falhar sem você ter mexido na
 * lista, uma função ficou aberta por engano.
 */
const abertas = [
  { funcao: "atualizar_turnos(uuid, jsonb)", anon: false, authenticated: true },
  { funcao: "eh_admin_repply()", anon: true, authenticated: true },
  { funcao: "tem_acesso(uuid)", anon: true, authenticated: true },
];

describe("funções do banco fechadas por padrão", () => {
  let banco: Client;

  beforeAll(async () => {
    banco = await conectarBanco();
  });

  afterAll(async () => {
    await banco?.end();
  });

  it("só as funções da lista podem ser executadas por anon ou authenticated", async () => {
    const resultado = await banco.query(
      `select p.proname || '(' || oidvectortypes(p.proargtypes) || ')' as funcao,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prorettype <> 'trigger'::regtype
          and not exists (
            select 1 from pg_depend d
             where d.classid = 'pg_proc'::regclass
               and d.objid = p.oid and d.deptype = 'e'
          )
          and (has_function_privilege('anon', p.oid, 'execute')
            or has_function_privilege('authenticated', p.oid, 'execute'))
        order by 1`
    );
    expect(resultado.rows).toEqual(abertas);
  });

  it("função criada daqui em diante nasce fechada para anon e authenticated", async () => {
    await banco.query("begin");
    try {
      await banco.query(
        "create function public.rf_teste_nasce_fechada() returns int language sql as 'select 1'"
      );
      const resultado = await banco.query(
        `select has_function_privilege('anon', 'public.rf_teste_nasce_fechada()', 'execute') as anon,
                has_function_privilege('authenticated', 'public.rf_teste_nasce_fechada()', 'execute') as authenticated,
                has_function_privilege('service_role', 'public.rf_teste_nasce_fechada()', 'execute') as service`
      );
      expect(resultado.rows[0]).toEqual({
        anon: false,
        authenticated: false,
        service: true,
      });
    } finally {
      await banco.query("rollback");
    }
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `npx vitest run tests/isolamento/funcoes-fechadas.test.ts`
Esperado: FALHA nos dois. O primeiro lista também `btrim_null(text)`, `dia_operacao_de(...)`, `esta_aberto_agora(jsonb, text)` e `normaliza_numeric(text)`; o segundo vem com `anon: true`.

- [ ] **Passo 3: Escrever a migration**

Crie `supabase/migrations/20261013120000_funcoes_nascem_fechadas.sql`:

```sql
-- Função nova nasce fechada.
--
-- No Postgres toda função nasce executável por PUBLIC, e o Supabase ainda
-- concede EXECUTE a anon e authenticated em tudo que é criado em "public".
-- Daqui em diante, quem cria função que o painel chama precisa dar o grant
-- de propósito, na própria migration, e a função precisa conferir o acesso
-- por dentro (seguranca-e-isolamento.md §2).
begin;

-- 1. Padrão para o que for criado daqui em diante. O padrão embutido (PUBLIC)
--    só sai sem "in schema"; o do Supabase (anon/authenticated) é por schema.
alter default privileges revoke execute on functions from public;
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- 2. Funções que já existem e nenhum login precisa chamar: só as funções
--    internas (security definer) as usam.
revoke execute on function public.btrim_null(text) from public, anon, authenticated;
revoke execute on function public.normaliza_numeric(text) from public, anon, authenticated;
revoke execute on function public.dia_operacao_de(timestamptz, text, time) from public, anon, authenticated;
revoke execute on function public.esta_aberto_agora(jsonb, text) from public, anon, authenticated;

-- 3. As que continuam abertas, de propósito:
--    tem_acesso e eh_admin_repply rodam dentro das políticas de RLS, inclusive
--    para quem não tem login (que assim recebe "vazio" em vez de erro);
--    atualizar_turnos confere o acesso por dentro (D-35).
revoke execute on function public.tem_acesso(uuid) from public;
revoke execute on function public.eh_admin_repply() from public;
grant execute on function public.tem_acesso(uuid) to anon, authenticated, service_role;
grant execute on function public.eh_admin_repply() to anon, authenticated, service_role;

commit;
```

- [ ] **Passo 4: Aplicar no banco local e ver passar**

```bash
npx supabase migration up --local
npx vitest run tests/isolamento
```

Esperado: a migration aparece como aplicada; `funcoes-fechadas`, `rls` e `rpc-privilegada` passam. Se o segundo teste vier com `service: false`, pare e relate (o padrão do Supabase para `service_role` não é o esperado nesta versão).

- [ ] **Passo 5: Documentar a regra**

Em `docs/arquitetura/seguranca-e-isolamento.md`, §2, acrescente depois do item 11:

```markdown
12. **Função nova nasce fechada.** Desde a migration `20261013120000`, função criada em `public` não pode ser executada por `anon` nem por `authenticated`. Se o painel precisa chamar:
    - dê o `grant execute ... to authenticated` na mesma migration;
    - a função confere `tem_acesso(restaurante_id)` por dentro, ou é `security invoker` e deixa a RLS trabalhar;
    - acrescente-a à lista do teste `tests/isolamento/funcoes-fechadas.test.ts`.
```

E no §4 (checklist de tabela nova), acrescente a linha no fim:

```markdown
- [ ] Função nova: `grant` explícito só para quem precisa, e entrada na lista de `funcoes-fechadas.test.ts`.
```

- [ ] **Passo 6: Commit**

```bash
npx biome check --write tests/isolamento/funcoes-fechadas.test.ts
git fetch && git status -sb
git status --short
git add supabase/migrations/20261013120000_funcoes_nascem_fechadas.sql tests/isolamento/funcoes-fechadas.test.ts docs/arquitetura/seguranca-e-isolamento.md
git commit -m "Faz função nova do banco nascer fechada para qualquer login" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 6: Isolamento testado nas 8 tabelas

**Por quê:** os testes de isolamento cobrem `entradas` e `metas`. Faltam as seis onde um vazamento seria pior: um cliente que conseguisse se inserir em `acessos` ou em `admins_repply` veria tudo.

**Arquivos:**
- Criar: `tests/isolamento/todas-as-tabelas.test.ts`

**Interfaces:** Consome: `criarFixture`, `comoAutenticado`, `conectarBanco`, `limparFixture` de `tests/helpers/supabase-local.ts`. Produz: nada para outras tarefas.

**Atenção:** estes testes descrevem a proteção que **já deveria existir**. O esperado é passarem de primeira. Se algum falhar, é vazamento de verdade: pare, não ajuste o teste, e avise o Lucas Ferreira.

- [ ] **Passo 1: Escrever os testes**

Crie `tests/isolamento/todas-as-tabelas.test.ts`:

```ts
// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  comoAutenticado,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";

type Identidade = "clienteA" | "semAcesso" | "anon" | "admin";

type Tabela = {
  nome: string;
  /** Coluna que diz de quem é a linha. */
  dono: string;
  parametros: (f: Fixture) => unknown[];
  clienteVe: (f: Fixture) => string[];
  adminVe: number;
};

const doRestaurante = (f: Fixture) => [f.idsRestaurantes];
const soODele = (f: Fixture) => [f.restauranteA];
const nada = () => [];

const tabelas: Tabela[] = [
  { nome: "restaurantes", dono: "id", parametros: doRestaurante, clienteVe: soODele, adminVe: 2 },
  { nome: "acessos", dono: "restaurante_id", parametros: doRestaurante, clienteVe: soODele, adminVe: 2 },
  { nome: "admins_repply", dono: "user_id", parametros: (f) => [f.idsUsuarios], clienteVe: nada, adminVe: 1 },
  { nome: "tokens_envio", dono: "restaurante_id", parametros: doRestaurante, clienteVe: nada, adminVe: 2 },
  { nome: "envios", dono: "restaurante_id", parametros: doRestaurante, clienteVe: nada, adminVe: 2 },
  { nome: "sinal_de_vida", dono: "restaurante_id", parametros: doRestaurante, clienteVe: soODele, adminVe: 2 },
  { nome: "entradas", dono: "restaurante_id", parametros: doRestaurante, clienteVe: soODele, adminVe: 2 },
  { nome: "metas", dono: "restaurante_id", parametros: doRestaurante, clienteVe: soODele, adminVe: 2 },
];

type Tentativa = {
  descricao: string;
  sql: string;
  parametros: (f: Fixture) => unknown[];
  esperado: "recusa" | "zero linhas" | "uma linha";
};

const sufixo = randomUUID();
const a = (f: Fixture) => [f.restauranteA];
const b = (f: Fixture) => [f.restauranteB];

const escritasDoCliente: Tentativa[] = [
  { descricao: "criar restaurante", sql: "insert into public.restaurantes (slug, nome) values ($1, 'invasor')", parametros: () => [`invasor-${sufixo}`], esperado: "recusa" },
  { descricao: "alterar o próprio restaurante", sql: "update public.restaurantes set nome = 'invadido' where id = $1", parametros: a, esperado: "zero linhas" },
  { descricao: "alterar o restaurante B", sql: "update public.restaurantes set nome = 'invadido' where id = $1", parametros: b, esperado: "zero linhas" },
  { descricao: "excluir o próprio restaurante", sql: "delete from public.restaurantes where id = $1", parametros: a, esperado: "zero linhas" },
  { descricao: "excluir o restaurante B", sql: "delete from public.restaurantes where id = $1", parametros: b, esperado: "zero linhas" },
  { descricao: "dar a si mesmo acesso ao restaurante B", sql: "insert into public.acessos (user_id, restaurante_id) values ($1, $2)", parametros: (f) => [f.usuarioA, f.restauranteB], esperado: "recusa" },
  { descricao: "alterar o próprio acesso", sql: "update public.acessos set criado_em = now() where restaurante_id = $1", parametros: a, esperado: "zero linhas" },
  { descricao: "excluir o acesso do restaurante B", sql: "delete from public.acessos where restaurante_id = $1", parametros: b, esperado: "zero linhas" },
  { descricao: "virar admin da Repply", sql: "insert into public.admins_repply (user_id) values ($1)", parametros: (f) => [f.usuarioA], esperado: "recusa" },
  { descricao: "excluir um admin da Repply", sql: "delete from public.admins_repply where user_id = $1", parametros: (f) => [f.admin], esperado: "zero linhas" },
  { descricao: "criar token para o próprio restaurante", sql: "insert into public.tokens_envio (restaurante_id, hash, prefixo) values ($1, $2, 'inv')", parametros: (f) => [f.restauranteA, `hash-a-${sufixo}`], esperado: "recusa" },
  { descricao: "criar token para o restaurante B", sql: "insert into public.tokens_envio (restaurante_id, hash, prefixo) values ($1, $2, 'inv')", parametros: (f) => [f.restauranteB, `hash-b-${sufixo}`], esperado: "recusa" },
  { descricao: "revogar o token do restaurante B", sql: "update public.tokens_envio set revogado_em = now() where restaurante_id = $1", parametros: b, esperado: "zero linhas" },
  { descricao: "excluir o próprio token", sql: "delete from public.tokens_envio where restaurante_id = $1", parametros: a, esperado: "zero linhas" },
  { descricao: "inserir envio", sql: "insert into public.envios (restaurante_id, http_status) values ($1, 200)", parametros: a, esperado: "recusa" },
  { descricao: "alterar envio", sql: "update public.envios set erro = 'adulterado' where restaurante_id = $1", parametros: a, esperado: "zero linhas" },
  { descricao: "excluir envio do restaurante B", sql: "delete from public.envios where restaurante_id = $1", parametros: b, esperado: "zero linhas" },
  { descricao: "inserir sinal de vida", sql: "insert into public.sinal_de_vida (restaurante_id) values ($1)", parametros: a, esperado: "recusa" },
  { descricao: "alterar o próprio sinal de vida", sql: "update public.sinal_de_vida set estado = 'em_dia' where restaurante_id = $1", parametros: a, esperado: "zero linhas" },
  { descricao: "excluir o sinal de vida do restaurante B", sql: "delete from public.sinal_de_vida where restaurante_id = $1", parametros: b, esperado: "zero linhas" },
  { descricao: "inserir conta no próprio restaurante", sql: "insert into public.entradas (restaurante_id, cod_entrada, aberta_em, dia_operacao, valor_consumido, pago, hash_origem) values ($1, 2, now(), current_date, 1, true, 'inv')", parametros: a, esperado: "recusa" },
  { descricao: "alterar conta do próprio restaurante", sql: "update public.entradas set valor_consumido = 1 where restaurante_id = $1", parametros: a, esperado: "zero linhas" },
  { descricao: "excluir conta do restaurante B", sql: "delete from public.entradas where restaurante_id = $1", parametros: b, esperado: "zero linhas" },
  { descricao: "criar meta para o restaurante B", sql: "insert into public.metas (restaurante_id, mes, valor) values ($1, '2026-11-01', 1)", parametros: b, esperado: "recusa" },
  { descricao: "alterar a meta do restaurante B", sql: "update public.metas set valor = 1 where restaurante_id = $1", parametros: b, esperado: "zero linhas" },
  { descricao: "excluir a meta do restaurante B", sql: "delete from public.metas where restaurante_id = $1", parametros: b, esperado: "zero linhas" },
];

const escritasDoAdmin: Tentativa[] = [
  { descricao: "inserir envio", sql: "insert into public.envios (restaurante_id, http_status) values ($1, 200)", parametros: a, esperado: "recusa" },
  { descricao: "inserir sinal de vida", sql: "insert into public.sinal_de_vida (restaurante_id) values ($1)", parametros: a, esperado: "recusa" },
  { descricao: "tornar outro login admin", sql: "insert into public.admins_repply (user_id) values ($1)", parametros: (f) => [f.usuarioA], esperado: "recusa" },
  { descricao: "alterar envio", sql: "update public.envios set erro = 'adulterado' where restaurante_id = $1", parametros: a, esperado: "zero linhas" },
  { descricao: "alterar sinal de vida", sql: "update public.sinal_de_vida set estado = 'em_dia' where restaurante_id = $1", parametros: a, esperado: "zero linhas" },
  { descricao: "sair da lista de admins", sql: "delete from public.admins_repply where user_id = $1", parametros: (f) => [f.admin], esperado: "zero linhas" },
  { descricao: "alterar o cadastro do restaurante", sql: "update public.restaurantes set nome = nome where id = $1", parametros: a, esperado: "uma linha" },
  { descricao: "criar token de envio", sql: "insert into public.tokens_envio (restaurante_id, hash, prefixo) values ($1, $2, 'adm')", parametros: (f) => [f.restauranteA, `hash-admin-${sufixo}`], esperado: "uma linha" },
  { descricao: "dar acesso a um login", sql: "insert into public.acessos (user_id, restaurante_id) values ($1, $2)", parametros: (f) => [f.usuarioSemAcesso, f.restauranteB], esperado: "uma linha" },
];

describe("isolamento nas 8 tabelas", () => {
  let banco: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
    const ids = [fixture.restauranteA, fixture.restauranteB];
    await banco.query(
      `insert into public.entradas (
         restaurante_id, cod_entrada, aberta_em, dia_operacao, valor_consumido, pago, hash_origem
       ) values ($1, 1, now(), current_date, 100, true, 'iso-a'),
                ($2, 1, now(), current_date, 100, true, 'iso-b')`,
      ids
    );
    await banco.query(
      "insert into public.metas (restaurante_id, mes, valor) values ($1, '2026-10-01', 1000), ($2, '2026-10-01', 2000)",
      ids
    );
    await banco.query(
      "insert into public.envios (restaurante_id, http_status) values ($1, 200), ($2, 200)",
      ids
    );
    await banco.query(
      "insert into public.sinal_de_vida (restaurante_id) values ($1), ($2)",
      ids
    );
  });

  afterAll(async () => {
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      await banco?.end();
    }
  });

  async function ler(identidade: Identidade, tabela: Tabela): Promise<string[]> {
    const sql = `select ${tabela.dono}::text as dono from public.${tabela.nome} where ${tabela.dono} = any($1::uuid[]) order by 1`;
    const parametros = tabela.parametros(fixture);
    if (identidade === "anon") {
      await banco.query("begin");
      try {
        await banco.query("set local role anon");
        const anonimo = await banco.query<{ dono: string }>(sql, parametros);
        return anonimo.rows.map((linha) => linha.dono);
      } finally {
        await banco.query("rollback");
      }
    }
    const usuario = {
      clienteA: fixture.usuarioA,
      semAcesso: fixture.usuarioSemAcesso,
      admin: fixture.admin,
    }[identidade];
    const resultado = await comoAutenticado(banco, usuario, () =>
      banco.query<{ dono: string }>(sql, parametros)
    );
    return resultado.rows.map((linha) => linha.dono);
  }

  async function tentar(usuario: string, tentativa: Tentativa): Promise<void> {
    const executar = () =>
      comoAutenticado(banco, usuario, () =>
        banco.query(tentativa.sql, tentativa.parametros(fixture))
      );
    if (tentativa.esperado === "recusa") {
      await expect(executar()).rejects.toMatchObject({ code: "42501" });
      return;
    }
    expect((await executar()).rowCount).toBe(
      tentativa.esperado === "uma linha" ? 1 : 0
    );
  }

  it.each(tabelas)("$nome: cada um lê só o que é seu", async (tabela) => {
    expect(await ler("clienteA", tabela)).toEqual(tabela.clienteVe(fixture));
    expect(await ler("semAcesso", tabela)).toEqual([]);
    expect(await ler("anon", tabela)).toEqual([]);
    expect(await ler("admin", tabela)).toHaveLength(tabela.adminVe);
  });

  it.each(escritasDoCliente)(
    "o cliente A não consegue $descricao ($esperado)",
    async (tentativa) => {
      await tentar(fixture.usuarioA, tentativa);
    }
  );

  it("depois de todas as tentativas do cliente, nada mudou", async () => {
    const estado = await banco.query(
      `select
         (select string_agg(nome, '|' order by nome) from public.restaurantes where id = any($1::uuid[])) as restaurantes,
         (select count(*)::int from public.acessos where restaurante_id = any($1::uuid[])) as acessos,
         (select count(*)::int from public.admins_repply where user_id = any($2::uuid[])) as admins,
         (select count(*)::int from public.tokens_envio where restaurante_id = any($1::uuid[]) and revogado_em is null) as tokens,
         (select count(*)::int from public.envios where restaurante_id = any($1::uuid[]) and erro is null) as envios,
         (select count(*)::int from public.sinal_de_vida where restaurante_id = any($1::uuid[]) and estado = 'aguardando') as sinais,
         (select sum(valor_consumido)::text from public.entradas where restaurante_id = any($1::uuid[])) as entradas,
         (select sum(valor)::text from public.metas where restaurante_id = any($1::uuid[])) as metas`,
      [fixture.idsRestaurantes, fixture.idsUsuarios]
    );
    expect(estado.rows[0]).toEqual({
      restaurantes: "Casa de teste A|Casa de teste B",
      acessos: 2,
      admins: 1,
      tokens: 2,
      envios: 2,
      sinais: 2,
      entradas: "200.00",
      metas: "3000.00",
    });
  });

  it.each(escritasDoAdmin)(
    "o admin ao $descricao: $esperado",
    async (tentativa) => {
      await tentar(fixture.admin, tentativa);
    }
  );
});
```

- [ ] **Passo 2: Rodar**

```bash
npx biome check --write tests/isolamento/todas-as-tabelas.test.ts
npx vitest run tests/isolamento/todas-as-tabelas.test.ts
```

Esperado: os 44 testes passam (8 de leitura, 26 de escrita do cliente, 1 de conferência, 9 do admin). **Se qualquer um falhar, pare e avise o Lucas Ferreira com o nome do teste e a saída:** é uma falha de isolamento real, e o conserto é uma política de RLS em migration nova, decidida com ele.

- [ ] **Passo 3: Provar que o teste pega vazamento**

Um teste que nunca falhou não prova nada. Abra uma brecha de propósito **no banco local**, veja o teste acusar e feche a brecha. Os quatro comandos vão juntos, para a brecha ser fechada mesmo se o teste falhar (que é o esperado):

```bash
sql() {
  node -e 'const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
  await c.connect();
  await c.query(process.argv[1]);
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });' "$1"
}
sql 'create policy "brecha de teste" on public.envios for select using (true)'
npx vitest run tests/isolamento/todas-as-tabelas.test.ts; echo "saída do teste com a brecha: $?"
sql 'drop policy "brecha de teste" on public.envios'
npx vitest run tests/isolamento/todas-as-tabelas.test.ts
```

Esperado: com a brecha, o teste "envios: cada um lê só o que é seu" FALHA (saída `1`); depois de fechada, os 44 passam de novo. Confirme que a brecha não ficou:

```bash
sql "do \$\$ begin if exists (select 1 from pg_policies where policyname = 'brecha de teste') then raise exception 'a brecha ficou aberta'; end if; end \$\$"
```

Esperado: nenhuma saída.

- [ ] **Passo 4: Commit**

```bash
git fetch && git status -sb
git status --short
git add tests/isolamento/todas-as-tabelas.test.ts
git commit -m "Testa o isolamento entre restaurantes nas 8 tabelas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 7: Um 429 não reinicia a contagem dos 20 segundos

**Por quê:** hoje toda resposta de erro grava `ultimo_envio_em = agora`, inclusive o 429. Um SCC configurado para enviar a cada 15 segundos nunca mais seria aceito. E o contrato não avisa o Pedro do intervalo mínimo.

**Arquivos:**
- Modificar: `supabase/functions/_shared/registro-erro.ts`
- Modificar: `supabase/functions/receber-envio/index.ts` (só `atualizarSinal`)
- Modificar: `tests/recepcao/registro-erro.test.ts`
- Modificar: `tests/recepcao/envio.test.ts`
- Modificar: `docs/integracao-scc/contrato-de-dados.md`, `docs/arquitetura/recepcao-de-dados.md`

**Interfaces:** Consome: Tarefa 3. Produz: `RegistroErroDb.atualizarSinal(restauranteId: string, agora: string, contaComoEnvio: boolean)`. A Tarefa 8 mexe nos mesmos dois arquivos de função.

- [ ] **Passo 1: Escrever os testes que falham**

Em `tests/recepcao/registro-erro.test.ts`, dentro de `registrarErroAnterior`, troque a chamada por `db.atualizarSinal(registro.restauranteId, momento, true)`. E acrescente antes do fechamento do `describe`:

```ts
  it("um 429 registra o erro sem contar como envio", async () => {
    const contouComoEnvio: boolean[] = [];
    const db: RegistroErroDb = {
      inserirEnvio: async () => ({ id: 1, error: null }),
      atualizarSinal: async (restauranteId, _agora, contaComoEnvio) => {
        contouComoEnvio.push(contaComoEnvio);
        return { restauranteId, error: null };
      },
    };
    const momento = "2026-10-12T12:00:00.000Z";
    await registrarErroNoBanco(db, { ...registro, httpStatus: 429 }, momento);
    await registrarErroNoBanco(db, { ...registro, httpStatus: 422 }, momento);
    expect(contouComoEnvio).toEqual([false, true]);
  });
```

Em `tests/recepcao/envio.test.ts`, acrescente depois do teste "limita o ritmo a uma chamada a cada vinte segundos":

```ts
  it("um 429 não reinicia a contagem dos vinte segundos", async () => {
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(200);
    await banco.query(
      "update public.sinal_de_vida set ultimo_envio_em = now() - interval '15 seconds' where restaurante_id = $1",
      [fixture.restauranteA]
    );
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(429);
    const sinal = await banco.query(
      `select ultimo_envio_em < now() - interval '14 seconds' as contagem_preservada,
              ultimo_erro_em > now() - interval '5 seconds' as erro_registrado
         from public.sinal_de_vida where restaurante_id = $1`,
      [fixture.restauranteA]
    );
    expect(sinal.rows[0]).toEqual({
      contagem_preservada: true,
      erro_registrado: true,
    });
    await banco.query(
      "update public.sinal_de_vida set ultimo_envio_em = ultimo_envio_em - interval '6 seconds' where restaurante_id = $1",
      [fixture.restauranteA]
    );
    expect((await enviar(fixture.tokenA, envelope([]))).status).toBe(200);
  });
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `npx vitest run tests/recepcao`
Esperado: o teste de unidade FALHA (`contouComoEnvio` vem `[undefined, undefined]`) e o de integração FALHA em `contagem_preservada: false`.

- [ ] **Passo 3: Ensinar o registro de erro a não contar o 429**

Substitua o conteúdo de `supabase/functions/_shared/registro-erro.ts` por:

```ts
export type RegistroEnvio = {
  restauranteId: string;
  httpStatus: number;
  erro: string;
  payload: unknown;
};

export type RegistroErroDb = {
  inserirEnvio: (
    registro: RegistroEnvio
  ) => Promise<{ id: number | null; error: unknown }>;
  atualizarSinal: (
    restauranteId: string,
    agora: string,
    contaComoEnvio: boolean
  ) => Promise<{ restauranteId: string | null; error: unknown }>;
};

/** O 429 é a recusa por ritmo: registra o erro, mas não é um envio. */
const HTTP_RITMO = 429;

export async function registrarErroNoBanco(
  db: RegistroErroDb,
  registro: RegistroEnvio,
  agora: string
): Promise<void> {
  const envio = await db.inserirEnvio(registro);
  if (envio.error || envio.id === null) {
    throw new Error("falha ao registrar envio");
  }
  // Se o 429 contasse como envio, ele reiniciaria a espera de 20 s e um SCC
  // apressado nunca mais seria aceito (contrato §3).
  const sinal = await db.atualizarSinal(
    registro.restauranteId,
    agora,
    registro.httpStatus !== HTTP_RITMO
  );
  if (sinal.error || sinal.restauranteId !== registro.restauranteId) {
    throw new Error("falha ao registrar sinal");
  }
}
```

Em `supabase/functions/receber-envio/index.ts`, dentro de `registrarErro`, substitua o método `atualizarSinal` por:

```ts
      async atualizarSinal(id, momento, contaComoEnvio) {
        const { data, error } = await db
          .from("sinal_de_vida")
          .upsert(
            contaComoEnvio
              ? {
                  restaurante_id: id,
                  ultimo_envio_em: momento,
                  ultimo_erro_em: momento,
                }
              : { restaurante_id: id, ultimo_erro_em: momento },
            { onConflict: "restaurante_id" }
          )
          .select("restaurante_id")
          .single();
        return { restauranteId: data?.restaurante_id ?? null, error };
      },
```

- [ ] **Passo 4: Rodar e ver passar**

A função servida recarrega sozinha ao salvar. Confira o `405` (Tarefa 3, Passo 6) e rode:

```bash
npx biome check --write supabase/functions/_shared/registro-erro.ts supabase/functions/receber-envio/index.ts tests/recepcao/registro-erro.test.ts tests/recepcao/envio.test.ts
npx vitest run tests/recepcao
npx tsc --noEmit
```

Esperado: todos os testes de `tests/recepcao` passam; `tsc` sem erros.

- [ ] **Passo 5: Avisar o Pedro no contrato (versão 0.2)**

Em `docs/integracao-scc/contrato-de-dados.md`:

No cabeçalho, troque `- **Versão:** 0.1, proposta da Repply, de 08/10/2026.` por `- **Versão:** 0.2, proposta da Repply, de 13/10/2026.`

No §3, depois do item "**Os ciclos nunca se sobrepõem.**", acrescente:

```markdown
- **No máximo um envio a cada 20 segundos por restaurante.** Abaixo disso a nuvem responde `429` e não grava nada. A contagem parte do último envio que a nuvem aceitou analisar: uma tentativa recusada com `429` **não** reinicia a contagem. Isso vale também para o envio extra do fechamento do caixa: se ele cair a menos de 20 s do ciclo anterior, espere completar os 20 s antes de mandar.
```

No §7, troque a linha do `429` por:

```markdown
| **429** | Envios rápidos demais: menos de 20 s desde o envio anterior | Não avança a data. Espera pelo menos 20 s (ou o próximo ciclo) e manda de novo a mesma janela |
```

No §12, acrescente a linha:

```markdown
| 0.2 | 13/10/2026 | Intervalo mínimo de 20 s entre envios explicado no §3 e no §7; o `429` não reinicia a contagem |
```

Em `docs/arquitetura/recepcao-de-dados.md`, §3, troque o passo 4 por:

```markdown
4. **Ritmo:** se o mesmo restaurante teve um envio analisado há menos de 20 s, devolve `429`. O `429` fica registrado em `envios` e em `ultimo_erro_em`, mas **não** mexe em `ultimo_envio_em`: se mexesse, um SCC enviando rápido demais nunca mais seria aceito.
```

E, no passo 10, troque "e atualiza `sinal_de_vida.ultimo_envio_em` e `ultimo_erro_em`" por "e atualiza `sinal_de_vida.ultimo_envio_em` e `ultimo_erro_em` (no `429`, só o `ultimo_erro_em`)".

- [ ] **Passo 6: Commit**

```bash
git fetch && git status -sb
git status --short
git add supabase/functions/_shared/registro-erro.ts supabase/functions/receber-envio/index.ts tests/recepcao/registro-erro.test.ts tests/recepcao/envio.test.ts docs/integracao-scc/contrato-de-dados.md docs/arquitetura/recepcao-de-dados.md
git commit -m "Impede que o 429 reinicie a contagem e avisa o intervalo no contrato" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 8: A nuvem só grava os campos que conhece (D-51)

**Por quê:** hoje o dado pessoal é barrado por quatro nomes exatos. Se o Pedro acrescentar `CPF`, `EmailCliente` ou qualquer campo novo, ele iria para `entradas.extras` e para o JSON guardado. Decisão do Lucas Ferreira em 13/10/2026: gravar só o que está na lista do contrato; do campo novo, guardar só o nome.

**Arquivos:**
- Criar: `supabase/functions/_shared/campos-permitidos.ts`
- Criar: `tests/recepcao/campos-permitidos.test.ts`
- Criar: `supabase/migrations/20261013130000_recepcao_so_grava_campos_conhecidos.sql`
- Modificar: `supabase/functions/_shared/registro-erro.ts`, `supabase/functions/receber-envio/index.ts`
- Modificar: `tests/recepcao/envio.test.ts`, `tests/recepcao/registro-erro.test.ts`, `tests/isolamento/rpc-privilegada.test.ts`
- Gerar: `types/database.types.ts`
- Modificar: `docs/decisoes.md`, `docs/integracao-scc/contrato-de-dados.md`, `docs/arquitetura/recepcao-de-dados.md`, `docs/arquitetura/modelo-de-dados.md`, `docs/arquitetura/seguranca-e-isolamento.md`

**Interfaces:**
- Consome: Tarefa 5 (função nova nasce fechada) e Tarefa 7 (`atualizarSinal` com 3 argumentos).
- Produz:
  - `filtrarEnvelope(bruto: unknown): { envelope: unknown; camposDesconhecidos: string[] }`;
  - `RegistroEnvio.camposDesconhecidos: string[]`;
  - coluna `envios.campos_desconhecidos text[] not null default '{}'` (o admin da etapa 3 mostra);
  - `processar_envio(p_restaurante_id uuid, p_envelope jsonb, p_campos_desconhecidos text[] default '{}') returns jsonb`;
  - `so_valor_simples(p_valor jsonb) returns jsonb`.

- [ ] **Passo 1: Escrever o teste de unidade que falha**

Crie `tests/recepcao/campos-permitidos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filtrarEnvelope } from "../../supabase/functions/_shared/campos-permitidos";

function entradaCompleta(parcial: Record<string, unknown> = {}) {
  return {
    codEntrada: 1,
    DataEntrada: "2026-10-09",
    HoraEntrada: "12:10:00",
    DataSaida: null,
    HoraSaida: null,
    ValorItens: 100,
    ValorDescontos: 0,
    ValorAcrescimos: 0,
    TaxaServico: 10,
    Complemento: 0,
    ValorConsumido: 110,
    Pago: "Não",
    codCartaoMesa: 15,
    CodGarcon: 27,
    codOperadorHab: 99,
    codOperadorDesab: null,
    codCliente: 1,
    NumeroOcupantes: 2,
    TipoOcupacao: "Mesa",
    TipoCartao: "Normal",
    ...parcial,
  };
}

function envelopeCompleto(entradas: unknown[], parcial = {}) {
  return {
    versao_formato: 1,
    versao_scc: "5.2.1",
    enviado_em: "2026-10-09T21:15:00",
    modo: "janela",
    janela: { desde: "2026-10-08", ate: "2026-10-09" },
    lote: { numero: 1, total: 1 },
    entradas,
    ...parcial,
  };
}

describe("lista do que a nuvem aceita guardar", () => {
  it("deixa passar intacto o envelope que só tem campos do contrato", () => {
    const extras = {
      Reabilitado: null,
      Flyer: null,
      ConferenciaDeMesa: null,
      HabilitacaoAutomatica: null,
      DesabilitacaoAutomatica: null,
      LimiteMinimo: 0,
      LimiteMaximo: 10000,
      ECF: 123456,
      CER: 123456,
      COO: 1,
    };
    const bruto = envelopeCompleto([entradaCompleta(extras)]);
    expect(filtrarEnvelope(bruto)).toEqual({
      envelope: bruto,
      camposDesconhecidos: [],
    });
  });

  it("descarta os dados pessoais em silêncio", () => {
    const resultado = filtrarEnvelope(
      envelopeCompleto([
        entradaCompleta({
          NomeCliente: "Pessoa de teste",
          RG: "000.000.000-00",
          FoneCliente: "(85) 99999-9999",
          Sexo: "X",
        }),
      ])
    );
    expect(resultado.camposDesconhecidos).toEqual([]);
    expect(resultado.envelope).toEqual(envelopeCompleto([entradaCompleta()]));
  });

  it("descarta o campo novo e guarda só o nome dele", () => {
    const resultado = filtrarEnvelope(
      envelopeCompleto([
        entradaCompleta({ CPF: "111.222.333-44" }),
        entradaCompleta({ EmailCliente: "pessoa@teste.repply.local" }),
      ])
    );
    expect(resultado.camposDesconhecidos).toEqual(["CPF", "EmailCliente"]);
    expect(JSON.stringify(resultado)).not.toContain("111.222.333-44");
    expect(JSON.stringify(resultado)).not.toContain("pessoa@teste");
  });

  it("um extra conhecido só passa se for valor simples", () => {
    const resultado = filtrarEnvelope(
      envelopeCompleto([
        entradaCompleta({ Flyer: { indicado_por: "Fulano de Tal" }, COO: 7 }),
      ])
    );
    expect(resultado.camposDesconhecidos).toEqual(["Flyer"]);
    expect(resultado.envelope).toEqual(
      envelopeCompleto([entradaCompleta({ COO: 7 })])
    );
  });

  it("campo novo fora das entradas aparece com o lugar de onde veio", () => {
    const resultado = filtrarEnvelope(
      envelopeCompleto([], {
        tenant_name: "Casa que não deveria vir",
        janela: { desde: "2026-10-08", ate: "2026-10-09", turno: "noite" },
        lote: { numero: 1, total: 1, origem: "caixa 2" },
      })
    );
    expect(resultado.camposDesconhecidos).toEqual([
      "envelope.tenant_name",
      "janela.turno",
      "lote.origem",
    ]);
    expect(resultado.envelope).toEqual(envelopeCompleto([]));
  });

  it("o que não é um envelope não é guardado", () => {
    for (const bruto of [null, "texto", 7, [entradaCompleta({ CPF: "1" })]]) {
      expect(filtrarEnvelope(bruto)).toEqual({
        envelope: null,
        camposDesconhecidos: [],
      });
    }
  });

  it("entrada que não é objeto vira null e não derruba o filtro", () => {
    const resultado = filtrarEnvelope(envelopeCompleto(["texto solto", 7]));
    expect(resultado.envelope).toEqual(envelopeCompleto([null, null]));
  });

  it("nome estranho de campo não é guardado como veio, e a lista tem limite", () => {
    const muitos = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`Campo${String(i).padStart(2, "0")}`, i])
    );
    const resultado = filtrarEnvelope(
      envelopeCompleto([
        entradaCompleta({ "Maria da Silva 85 99999-9999": 1, ...muitos }),
      ])
    );
    expect(resultado.camposDesconhecidos).toHaveLength(20);
    expect(resultado.camposDesconhecidos[0]).toBe("(nome fora do padrão)");
    expect(JSON.stringify(resultado)).not.toContain("Maria da Silva");
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `npx vitest run tests/recepcao/campos-permitidos.test.ts`
Esperado: FALHA (`Cannot find module ... campos-permitidos`).

- [ ] **Passo 3: Escrever a lista**

Crie `supabase/functions/_shared/campos-permitidos.ts`:

```ts
/**
 * A lista do que a nuvem aceita guardar de um envio do SCC (D-29, D-51).
 *
 * A regra é "só entra o que está na lista": um campo novo pode ser dado
 * pessoal (CPF, e-mail, endereço), então ele é descartado e só o NOME dele
 * fica registrado, para a Repply decidir se passa a aceitar.
 * A função `processar_envio` (SQL) repete esta lista, como segunda barreira.
 */

/** Campos do contrato §5 que viram coluna em `entradas`. */
export const CAMPOS_DA_ENTRADA: readonly string[] = [
  "codEntrada",
  "DataEntrada",
  "HoraEntrada",
  "DataSaida",
  "HoraSaida",
  "ValorItens",
  "ValorDescontos",
  "ValorAcrescimos",
  "TaxaServico",
  "Complemento",
  "ValorConsumido",
  "Pago",
  "codCartaoMesa",
  "CodGarcon",
  "codOperadorHab",
  "codOperadorDesab",
  "codCliente",
  "NumeroOcupantes",
  "TipoOcupacao",
  "TipoCartao",
];

/** Campos sem significado confirmado, guardados em `entradas.extras` (H3, B17). */
export const EXTRAS_CONHECIDOS: readonly string[] = [
  "Reabilitado",
  "Flyer",
  "ConferenciaDeMesa",
  "HabilitacaoAutomatica",
  "DesabilitacaoAutomatica",
  "LimiteMinimo",
  "LimiteMaximo",
  "ECF",
  "CER",
  "COO",
];

/** Dados pessoais: descartados em silêncio, porque o SCC ainda pode mandar (B12). */
export const CAMPOS_PESSOAIS: readonly string[] = [
  "NomeCliente",
  "RG",
  "FoneCliente",
  "Sexo",
];

const CAMPOS_SIMPLES_DO_ENVELOPE: readonly string[] = [
  "versao_formato",
  "versao_scc",
  "enviado_em",
  "modo",
];
const CAMPOS_DA_JANELA: readonly string[] = ["desde", "ate"];
const CAMPOS_DO_LOTE: readonly string[] = ["numero", "total"];

/** Um nome de campo só é guardado se tiver cara de nome de campo. */
const NOME_SEGURO = /^[A-Za-z0-9_.]{1,40}$/;
const LIMITE_DE_NOMES = 20;

export type EnvelopeFiltrado = {
  envelope: unknown;
  camposDesconhecidos: string[];
};

type Objeto = Record<string, unknown>;

function ehObjeto(valor: unknown): valor is Objeto {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

function ehSimples(valor: unknown): boolean {
  return (
    valor === null || ["string", "number", "boolean"].includes(typeof valor)
  );
}

function filtrarBloco(
  bloco: unknown,
  permitidos: readonly string[],
  prefixo: string,
  desconhecidos: Set<string>
): unknown {
  if (!ehObjeto(bloco)) {
    return ehSimples(bloco) ? bloco : null;
  }
  const limpo: Objeto = {};
  for (const [chave, valor] of Object.entries(bloco)) {
    if (permitidos.includes(chave) && ehSimples(valor)) {
      limpo[chave] = valor;
    } else {
      desconhecidos.add(`${prefixo}${chave}`);
    }
  }
  return limpo;
}

function filtrarEntrada(entrada: unknown, desconhecidos: Set<string>): unknown {
  if (!ehObjeto(entrada)) {
    return null;
  }
  const limpa: Objeto = {};
  for (const [chave, valor] of Object.entries(entrada)) {
    if (CAMPOS_PESSOAIS.includes(chave)) {
      continue;
    }
    const coluna = CAMPOS_DA_ENTRADA.includes(chave);
    if ((coluna || EXTRAS_CONHECIDOS.includes(chave)) && ehSimples(valor)) {
      limpa[chave] = valor;
    } else if (!coluna) {
      // Coluna com valor composto some sem aviso: a validação responde 422.
      desconhecidos.add(chave);
    }
  }
  return limpa;
}

function nomesSeguros(nomes: Set<string>): string[] {
  const seguros = new Set<string>();
  for (const nome of nomes) {
    seguros.add(NOME_SEGURO.test(nome) ? nome : "(nome fora do padrão)");
  }
  return [...seguros].sort().slice(0, LIMITE_DE_NOMES);
}

/**
 * Devolve o envelope só com os campos da lista e os nomes do que foi
 * descartado por não estar nela. Nunca devolve o valor de um campo descartado.
 */
export function filtrarEnvelope(bruto: unknown): EnvelopeFiltrado {
  if (!ehObjeto(bruto)) {
    return { envelope: null, camposDesconhecidos: [] };
  }
  const desconhecidos = new Set<string>();
  const envelope: Objeto = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    if (CAMPOS_SIMPLES_DO_ENVELOPE.includes(chave)) {
      envelope[chave] = ehSimples(valor) ? valor : null;
    } else if (chave === "janela") {
      envelope.janela = filtrarBloco(
        valor,
        CAMPOS_DA_JANELA,
        "janela.",
        desconhecidos
      );
    } else if (chave === "lote") {
      envelope.lote = filtrarBloco(valor, CAMPOS_DO_LOTE, "lote.", desconhecidos);
    } else if (chave === "entradas") {
      envelope.entradas = Array.isArray(valor)
        ? valor.map((item) => filtrarEntrada(item, desconhecidos))
        : null;
    } else {
      desconhecidos.add(`envelope.${chave}`);
    }
  }
  return { envelope, camposDesconhecidos: nomesSeguros(desconhecidos) };
}
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
npx biome check --write supabase/functions/_shared/campos-permitidos.ts tests/recepcao/campos-permitidos.test.ts
npx vitest run tests/recepcao/campos-permitidos.test.ts
```

Esperado: os 8 testes passam.

- [ ] **Passo 5: Escrever os testes de integração que falham**

Em `tests/recepcao/envio.test.ts`, acrescente depois do teste "descarta todos os dados pessoais das entradas e do payload":

```ts
  it("guarda só os campos conhecidos e registra o nome do campo novo, nunca o valor", async () => {
    const corpo = {
      ...envelope([
        entrada(511, {
          CPF: "111.222.333-44",
          EmailCliente: "pessoa@teste.repply.local",
          Flyer: { indicado_por: "Fulano de Tal" },
          ECF: 123456,
          NomeCliente: "Pessoa de teste",
        }),
      ]),
      tenant_name: "Casa que não deveria vir",
    };
    expect((await enviar(fixture.tokenA, corpo)).status).toBe(200);
    const dados = await banco.query(
      `select e.extras, v.payload, v.campos_desconhecidos
         from public.entradas e
         join public.envios v on v.restaurante_id = e.restaurante_id
        where e.restaurante_id = $1 and e.cod_entrada = 511 and v.http_status = 200
        order by v.id desc limit 1`,
      [fixture.restauranteA]
    );
    expect(dados.rows[0]?.extras).toEqual({ ECF: 123456 });
    expect(dados.rows[0]?.campos_desconhecidos).toEqual([
      "CPF",
      "EmailCliente",
      "Flyer",
      "envelope.tenant_name",
    ]);
    const gravado = JSON.stringify(dados.rows[0]);
    for (const valor of [
      "111.222.333-44",
      "pessoa@teste.repply.local",
      "Fulano de Tal",
      "Casa que não deveria vir",
      "Pessoa de teste",
      "NomeCliente",
    ]) {
      expect(gravado).not.toContain(valor);
    }
  });

  it("no envio recusado, o campo novo também não fica guardado", async () => {
    const corpo = envelope([entrada(512, { CPF: "111.222.333-44" })]) as {
      versao_formato: number;
    };
    corpo.versao_formato = 2;
    expect((await enviar(fixture.tokenA, corpo)).status).toBe(422);
    const registro = await banco.query(
      `select payload, campos_desconhecidos from public.envios
        where restaurante_id = $1 and http_status = 422
        order by id desc limit 1`,
      [fixture.restauranteA]
    );
    expect(registro.rows[0]?.campos_desconhecidos).toEqual(["CPF"]);
    expect(JSON.stringify(registro.rows[0]?.payload)).not.toContain(
      "111.222.333-44"
    );
  });

  it("a função do banco barra o campo novo mesmo sem passar pela recepção", async () => {
    const corpo = JSON.stringify({
      ...envelope([
        entrada(513, {
          CPF: "111.222.333-44",
          Flyer: { indicado_por: "Fulano de Tal" },
          COO: 7,
        }),
      ]),
      versao_scc: { nome: "Beltrano de Tal" },
    });
    await banco.query("select public.processar_envio($1, $2::jsonb)", [
      fixture.restauranteA,
      corpo,
    ]);
    const dados = await banco.query(
      `select e.extras, v.payload, v.campos_desconhecidos, v.versao_scc, v.modo
         from public.entradas e
         join public.envios v on v.restaurante_id = e.restaurante_id
        where e.restaurante_id = $1 and e.cod_entrada = 513
        order by v.id desc limit 1`,
      [fixture.restauranteA]
    );
    expect(dados.rows[0]?.extras).toEqual({ COO: 7 });
    expect(dados.rows[0]?.campos_desconhecidos).toEqual(["CPF", "Flyer"]);
    expect(dados.rows[0]?.versao_scc).toBeNull();
    expect(dados.rows[0]?.modo).toBe("janela");
    const gravado = JSON.stringify(dados.rows[0]);
    for (const valor of ["111.222.333-44", "Fulano de Tal", "Beltrano de Tal"]) {
      expect(gravado).not.toContain(valor);
    }
  });
```

Em `tests/recepcao/registro-erro.test.ts`, acrescente a propriedade ao objeto `registro` do topo:

```ts
const registro = {
  restauranteId: "00000000-0000-0000-0000-000000000001",
  httpStatus: 422,
  erro: "formato inválido",
  payload: null,
  camposDesconhecidos: [],
};
```

Em `tests/isolamento/rpc-privilegada.test.ts`, troque `"public.processar_envio(uuid,jsonb)"` por `"public.processar_envio(uuid,jsonb,text[])"`.

- [ ] **Passo 6: Rodar e ver falhar**

Rode: `npx vitest run tests/recepcao/envio.test.ts tests/isolamento/rpc-privilegada.test.ts`
Esperado: os três testes novos FALHAM (`column v.campos_desconhecidos does not exist`) e o de RPC FALHA (`function public.processar_envio(uuid,jsonb,text[]) does not exist`).

- [ ] **Passo 7: Escrever a migration**

Crie `supabase/migrations/20261013130000_recepcao_so_grava_campos_conhecidos.sql`:

```sql
-- A nuvem só grava os campos que conhece (D-29, D-51).
--
-- Antes, processar_envio tirava 4 nomes exatos (NomeCliente, RG, FoneCliente,
-- Sexo) e levava QUALQUER outro campo para entradas.extras e para o JSON
-- guardado. Um campo novo do SCC (CPF, e-mail...) seria gravado.
-- Agora só entra o que está na lista do contrato §5; do campo novo fica só o
-- nome, em envios.campos_desconhecidos. A recepção (Edge Function) aplica a
-- mesma lista antes; esta é a segunda barreira.
begin;

alter table public.envios
  add column campos_desconhecidos text[] not null default '{}';

comment on column public.envios.campos_desconhecidos is
  'Nomes (nunca valores) dos campos que vieram do SCC fora da lista do contrato §5 e foram descartados (D-51).';

-- Só texto, número, booleano ou null: um objeto no lugar de um valor simples
-- não é guardado.
create function public.so_valor_simples(p_valor jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when jsonb_typeof(p_valor) in ('string', 'number', 'boolean', 'null') then p_valor
  end
$$;

drop function public.processar_envio(uuid, jsonb);

create function public.processar_envio(
  p_restaurante_id uuid,
  p_envelope jsonb,
  p_campos_desconhecidos text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  -- A mesma lista de supabase/functions/_shared/campos-permitidos.ts.
  c_colunas  constant text[] := array[
    'codEntrada', 'DataEntrada', 'HoraEntrada', 'DataSaida', 'HoraSaida',
    'ValorItens', 'ValorDescontos', 'ValorAcrescimos', 'TaxaServico',
    'Complemento', 'ValorConsumido', 'Pago', 'codCartaoMesa', 'CodGarcon',
    'codOperadorHab', 'codOperadorDesab', 'codCliente', 'NumeroOcupantes',
    'TipoOcupacao', 'TipoCartao'
  ];
  c_extras   constant text[] := array[
    'Reabilitado', 'Flyer', 'ConferenciaDeMesa', 'HabilitacaoAutomatica',
    'DesabilitacaoAutomatica', 'LimiteMinimo', 'LimiteMaximo', 'ECF', 'CER', 'COO'
  ];
  c_pessoais constant text[] := array['NomeCliente', 'RG', 'FoneCliente', 'Sexo'];

  v_inicio        timestamptz := clock_timestamp();
  v_fuso          text;
  v_virada        time;
  v_intervalo     int;
  v_pedido        date;
  v_desde         date;
  v_ate           date;
  v_brutas        jsonb;
  v_entradas      jsonb;
  v_desconhecidos text[];
  v_item          jsonb;
  v_cods          bigint[] := '{}'::bigint[];
  v_cod           bigint;
  v_aberta_em     timestamptz;
  v_fechada_em    timestamptz;
  v_dia           date;
  v_pago          boolean;
  v_extras        jsonb;
  v_hash          text;
  v_hash_gravado  text;
  v_removida      boolean := false;
  v_recebidas     int := 0;
  v_gravadas      int := 0;
  v_inalteradas   int := 0;
  v_removidas     int := 0;
  v_modo          text;
  v_versao        int;
  v_versao_scc    text;
  v_reenviar      date;
  v_duracao       int;
begin
  -- 1. trava por restaurante: dois envios simultâneos entram em fila
  perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text, 0));

  -- 2. contexto do restaurante (o id vem do token, nunca do corpo)
  select fuso, hora_virada, intervalo_envio_segundos, pedido_reenvio_desde
    into v_fuso, v_virada, v_intervalo, v_pedido
    from public.restaurantes
   where id = p_restaurante_id;
  if not found then
    raise exception 'restaurante inexistente';
  end if;

  -- 3. janela e metadados do envelope
  --    (modo e versao_scc viram coluna de texto: só valor simples, nunca um objeto)
  v_desde      := (p_envelope -> 'janela' ->> 'desde')::date;
  v_ate        := (p_envelope -> 'janela' ->> 'ate')::date;
  v_modo       := public.so_valor_simples(p_envelope -> 'modo') #>> '{}';
  v_versao     := (p_envelope ->> 'versao_formato')::int;
  v_versao_scc := public.so_valor_simples(p_envelope -> 'versao_scc') #>> '{}';

  -- 4. só entra o que está na lista (D-29, D-51), ANTES de qualquer gravação
  v_brutas := case
    when jsonb_typeof(p_envelope -> 'entradas') = 'array' then p_envelope -> 'entradas'
    else '[]'::jsonb
  end;

  select coalesce(jsonb_agg(
           (select coalesce(jsonb_object_agg(c.chave, c.valor), '{}'::jsonb)
              from jsonb_each(b.item) as c(chave, valor)
             where c.chave = any (c_colunas)
                or (c.chave = any (c_extras)
                    and public.so_valor_simples(c.valor) is not null))
           order by b.ordem), '[]'::jsonb)
    into v_entradas
    from jsonb_array_elements(v_brutas) with ordinality as b(item, ordem)
   where jsonb_typeof(b.item) = 'object';

  -- nomes do que foi descartado por não estar na lista (os pessoais saem em silêncio)
  select coalesce(array_agg(distinct c.chave), '{}')
    into v_desconhecidos
    from jsonb_array_elements(v_brutas) as b(item)
    cross join lateral jsonb_each(
      case when jsonb_typeof(b.item) = 'object' then b.item else '{}'::jsonb end
    ) as c(chave, valor)
   where not (c.chave = any (c_colunas))
     and not (c.chave = any (c_pessoais))
     and not (c.chave = any (c_extras)
              and public.so_valor_simples(c.valor) is not null);

  -- junta com os nomes que a recepção já achou; nome estranho não é guardado
  select coalesce(array_agg(n.nome order by n.nome collate "C"), '{}')
    into v_desconhecidos
    from (
      select m.nome
        from (
          select distinct
                 case when u.bruto ~ '^[A-Za-z0-9_.]{1,40}$' then u.bruto
                      else '(nome fora do padrão)'
                 end as nome
            from unnest(coalesce(p_campos_desconhecidos, '{}') || v_desconhecidos) as u(bruto)
        ) as m
       order by m.nome collate "C"
       limit 20
    ) as n;

  v_recebidas := jsonb_array_length(v_entradas);

  -- 5. normaliza e faz o upsert de cada entrada
  for v_item in select * from jsonb_array_elements(v_entradas) loop
    v_cod := (v_item ->> 'codEntrada')::bigint;
    v_cods := v_cods || v_cod;

    -- data + hora local do restaurante -> timestamptz
    v_aberta_em := ((v_item ->> 'DataEntrada')::date + (v_item ->> 'HoraEntrada')::time)
                   at time zone v_fuso;

    if (v_item ->> 'DataSaida') is not null and (v_item ->> 'HoraSaida') is not null then
      v_fechada_em := ((v_item ->> 'DataSaida')::date + (v_item ->> 'HoraSaida')::time)
                      at time zone v_fuso;
    else
      v_fechada_em := null;
    end if;

    v_dia := public.dia_operacao_de(v_aberta_em, v_fuso, v_virada);

    -- "Sim"/"S"/"true"/"1" -> true; "Não"/"Nao"/"N"/"false"/"0" -> false
    v_pago := lower(btrim(coalesce(v_item ->> 'Pago', 'false'))) in
              ('sim', 's', 'true', '1');

    -- extras: só os conhecidos (H3, B17); o resto já foi descartado no passo 4
    select coalesce(jsonb_object_agg(c.chave, c.valor), '{}'::jsonb)
      into v_extras
      from jsonb_each(v_item) as c(chave, valor)
     where c.chave = any (c_extras);

    -- hash idempotente: o mesmo conteúdo lógico produz o mesmo hash
    v_hash := md5(jsonb_build_object(
      'codEntrada', v_cod,
      'aberta_em', v_aberta_em,
      'fechada_em', v_fechada_em,
      'dia_operacao', v_dia,
      'cod_cartao_mesa', btrim_null((v_item ->> 'codCartaoMesa')::text),
      'cod_garcom', btrim_null((v_item ->> 'CodGarcon')::text),
      'cod_cliente', btrim_null((v_item ->> 'codCliente')::text),
      'cod_operador_abertura', btrim_null((v_item ->> 'codOperadorHab')::text),
      'cod_operador_fechamento', btrim_null((v_item ->> 'codOperadorDesab')::text),
      'valor_itens', normaliza_numeric(v_item ->> 'ValorItens'),
      'valor_descontos', normaliza_numeric(v_item ->> 'ValorDescontos'),
      'valor_acrescimos', normaliza_numeric(v_item ->> 'ValorAcrescimos'),
      'taxa_servico', normaliza_numeric(v_item ->> 'TaxaServico'),
      'complemento', normaliza_numeric(v_item ->> 'Complemento'),
      'valor_consumido', normaliza_numeric(v_item ->> 'ValorConsumido'),
      'pago', v_pago,
      'numero_ocupantes', btrim_null((v_item ->> 'NumeroOcupantes')::text),
      'tipo_ocupacao', btrim(coalesce(v_item ->> 'TipoOcupacao', '')),
      'tipo_cartao', btrim(coalesce(v_item ->> 'TipoCartao', '')),
      'extras', v_extras
    )::text);

    -- já existe? compara o hash
    select e.hash_origem, e.removida_em is not null
      into v_hash_gravado, v_removida
      from public.entradas e
     where e.restaurante_id = p_restaurante_id and e.cod_entrada = v_cod
     for update;

    if v_hash_gravado = v_hash then
      -- mesmo conteúdo: se estava removida e voltou, volta a aparecer
      if v_removida then
        update public.entradas
           set removida_em = null, atualizada_em = now()
         where restaurante_id = p_restaurante_id and cod_entrada = v_cod;
      end if;
      v_inalteradas := v_inalteradas + 1;
    else
      insert into public.entradas (
        restaurante_id, cod_entrada, cod_cartao_mesa, cod_garcom, cod_cliente,
        cod_operador_abertura, cod_operador_fechamento, aberta_em, fechada_em,
        dia_operacao, valor_itens, valor_descontos, valor_acrescimos, taxa_servico,
        complemento, valor_consumido, pago, numero_ocupantes, tipo_ocupacao,
        tipo_cartao, extras, hash_origem
      ) values (
        p_restaurante_id, v_cod,
        (v_item ->> 'codCartaoMesa')::int,
        (v_item ->> 'CodGarcon')::int,
        (v_item ->> 'codCliente')::int,
        (v_item ->> 'codOperadorHab')::int,
        (v_item ->> 'codOperadorDesab')::int,
        v_aberta_em, v_fechada_em, v_dia,
        round(coalesce((v_item ->> 'ValorItens')::numeric, 0), 2),
        round(coalesce((v_item ->> 'ValorDescontos')::numeric, 0), 2),
        round(coalesce((v_item ->> 'ValorAcrescimos')::numeric, 0), 2),
        round(coalesce((v_item ->> 'TaxaServico')::numeric, 0), 2),
        round(coalesce((v_item ->> 'Complemento')::numeric, 0), 2),
        round(coalesce((v_item ->> 'ValorConsumido')::numeric, 0), 2),
        v_pago,
        (v_item ->> 'NumeroOcupantes')::int,
        btrim(v_item ->> 'TipoOcupacao'),
        btrim(v_item ->> 'TipoCartao'),
        v_extras, v_hash
      )
      on conflict (restaurante_id, cod_entrada) do update set
        cod_cartao_mesa          = excluded.cod_cartao_mesa,
        cod_garcom               = excluded.cod_garcom,
        cod_cliente              = excluded.cod_cliente,
        cod_operador_abertura    = excluded.cod_operador_abertura,
        cod_operador_fechamento  = excluded.cod_operador_fechamento,
        aberta_em                = excluded.aberta_em,
        fechada_em               = excluded.fechada_em,
        dia_operacao             = excluded.dia_operacao,
        valor_itens              = excluded.valor_itens,
        valor_descontos          = excluded.valor_descontos,
        valor_acrescimos         = excluded.valor_acrescimos,
        taxa_servico             = excluded.taxa_servico,
        complemento              = excluded.complemento,
        valor_consumido          = excluded.valor_consumido,
        pago                     = excluded.pago,
        numero_ocupantes         = excluded.numero_ocupantes,
        tipo_ocupacao            = excluded.tipo_ocupacao,
        tipo_cartao              = excluded.tipo_cartao,
        extras                   = excluded.extras,
        hash_origem              = excluded.hash_origem,
        removida_em              = null,               -- voltou (reapareceu na janela)
        atualizada_em            = now();
      v_gravadas := v_gravadas + 1;
    end if;
  end loop;

  -- 6. reconciliação: o que pertence à janela (ou está aberto) e não veio, marca removido
  update public.entradas e
     set removida_em = now(), atualizada_em = now()
   where e.restaurante_id = p_restaurante_id
     and e.removida_em is null
     and not (e.cod_entrada = any (v_cods))
     and (
       e.fechada_em is null
       or (e.aberta_em at time zone v_fuso)::date between v_desde and v_ate
       or (e.fechada_em at time zone v_fuso)::date between v_desde and v_ate
     );
  get diagnostics v_removidas = row_count;

  -- 7. sinal de vida
  insert into public.sinal_de_vida (restaurante_id, primeiro_envio_em, ultimo_envio_em, ultimo_envio_ok_em)
  values (p_restaurante_id, now(), now(), now())
  on conflict (restaurante_id) do update set
    ultimo_envio_em    = now(),
    ultimo_envio_ok_em = now(),
    primeiro_envio_em  = coalesce(sinal_de_vida.primeiro_envio_em, now());

  -- 8. marca o uso do token (todos os válidos do restaurante são dele)
  update public.tokens_envio
     set ultimo_uso_em = now()
   where restaurante_id = p_restaurante_id
     and revogado_em is null
     and (expira_em is null or expira_em > now());

  -- 9. pedido de reenvio: se a janela já cobriu a data pedida, limpa
  if v_pedido is not null and v_desde <= v_pedido then
    update public.restaurantes set pedido_reenvio_desde = null where id = p_restaurante_id;
  else
    v_reenviar := v_pedido;
  end if;

  -- 10. resumo do envio: o JSON guardado é remontado só com o que está na lista
  v_duracao := greatest(1, round(extract(epoch from (clock_timestamp() - v_inicio)) * 1000)::int);

  insert into public.envios (
    restaurante_id, http_status, modo, versao_formato, versao_scc,
    janela_desde, janela_ate, recebidas, gravadas, inalteradas, removidas,
    payload, campos_desconhecidos, duracao_ms
  ) values (
    p_restaurante_id, 200, v_modo, v_versao, v_versao_scc,
    v_desde, v_ate, v_recebidas, v_gravadas, v_inalteradas, v_removidas,
    jsonb_build_object(
      'versao_formato', public.so_valor_simples(p_envelope -> 'versao_formato'),
      'versao_scc', public.so_valor_simples(p_envelope -> 'versao_scc'),
      'enviado_em', public.so_valor_simples(p_envelope -> 'enviado_em'),
      'modo', public.so_valor_simples(p_envelope -> 'modo'),
      'janela', jsonb_build_object(
        'desde', public.so_valor_simples(p_envelope -> 'janela' -> 'desde'),
        'ate', public.so_valor_simples(p_envelope -> 'janela' -> 'ate')
      ),
      'lote', jsonb_build_object(
        'numero', public.so_valor_simples(p_envelope -> 'lote' -> 'numero'),
        'total', public.so_valor_simples(p_envelope -> 'lote' -> 'total')
      ),
      'entradas', v_entradas
    ),
    v_desconhecidos, v_duracao
  );

  if v_reenviar is not null then
    return jsonb_build_object(
      'recebidas', v_recebidas,
      'gravadas', v_gravadas,
      'inalteradas', v_inalteradas,
      'removidas', v_removidas,
      'janela_confirmada', jsonb_build_object('desde', v_desde, 'ate', v_ate),
      'proximo_envio_em_segundos', v_intervalo,
      'reenviar_desde', v_reenviar
    );
  end if;

  return jsonb_build_object(
    'recebidas', v_recebidas,
    'gravadas', v_gravadas,
    'inalteradas', v_inalteradas,
    'removidas', v_removidas,
    'janela_confirmada', jsonb_build_object('desde', v_desde, 'ate', v_ate),
    'proximo_envio_em_segundos', v_intervalo
  );
end;
$$;

revoke execute on function public.processar_envio(uuid, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.processar_envio(uuid, jsonb, text[]) to service_role;

commit;
```

- [ ] **Passo 8: Aplicar no banco local e gerar os tipos**

```bash
npx supabase migration up --local
npm run types -- --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
git diff --stat types/database.types.ts
```

Esperado: migration aplicada; `Tipos válidos; destino substituído atomicamente.`; o diff de tipos mostra só a coluna `campos_desconhecidos`, o argumento `p_campos_desconhecidos` e a função `so_valor_simples`.

- [ ] **Passo 9: Levar os nomes dos campos para o registro de erro**

Em `supabase/functions/_shared/registro-erro.ts`, troque o tipo `RegistroEnvio` por:

```ts
export type RegistroEnvio = {
  restauranteId: string;
  httpStatus: number;
  erro: string;
  payload: unknown;
  /** Nomes (nunca valores) dos campos descartados por não estarem na lista. */
  camposDesconhecidos: string[];
};
```

- [ ] **Passo 10: Usar a lista na recepção**

Substitua o conteúdo de `supabase/functions/receber-envio/index.ts` por:

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../../types/database.types.ts";
import { filtrarEnvelope } from "../_shared/campos-permitidos.ts";
import { validarEnvelope } from "../_shared/recepcao.ts";
import { registrarErroNoBanco } from "../_shared/registro-erro.ts";

// Limites e ritmo (contrato-de-dados.md §3 e §7, recepcao-de-dados.md §3).
const LIMITE_BYTES = 2 * 1024 * 1024; // 2 MB
const LIMITE_ENTRADAS = 2000;
const RITMO_MS = 20 * 1000; // 20 s entre envios do mesmo restaurante

const url = Deno.env.get("SUPABASE_URL") ?? "";
const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient<Database>(url, chaveServico, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function responder(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function extrairToken(req: Request): string {
  const autorizacao = req.headers.get("authorization") ?? "";
  const partes = /^Bearer\s+(.+)$/i.exec(autorizacao);
  return partes?.[1]?.trim() ?? "";
}

async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(texto)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Erro depois do passo 3 (recepcao-de-dados.md §3.10): registra em envios com
 * mensagem curta e sem dado pessoal e atualiza o sinal de vida.
 */
async function registrarErro(
  restauranteId: string,
  httpStatus: number,
  erro: string,
  envelope?: unknown,
  camposDesconhecidos: string[] = []
): Promise<void> {
  const agora = new Date().toISOString();
  await registrarErroNoBanco(
    {
      async inserirEnvio(registro) {
        const { data, error } = await db
          .from("envios")
          .insert({
            restaurante_id: registro.restauranteId,
            http_status: registro.httpStatus,
            erro: registro.erro,
            payload:
              registro.payload === undefined
                ? null
                : (registro.payload as Json),
            campos_desconhecidos: registro.camposDesconhecidos,
          })
          .select("id")
          .single();
        return { id: data?.id ?? null, error };
      },
      async atualizarSinal(id, momento, contaComoEnvio) {
        const { data, error } = await db
          .from("sinal_de_vida")
          .upsert(
            contaComoEnvio
              ? {
                  restaurante_id: id,
                  ultimo_envio_em: momento,
                  ultimo_erro_em: momento,
                }
              : { restaurante_id: id, ultimo_erro_em: momento },
            { onConflict: "restaurante_id" }
          )
          .select("restaurante_id")
          .single();
        return { restauranteId: data?.restaurante_id ?? null, error };
      },
    },
    {
      restauranteId,
      httpStatus,
      erro,
      payload: envelope,
      camposDesconhecidos,
    },
    agora
  );
}

function contarEntradas(envelope: unknown): number {
  if (
    envelope === null ||
    typeof envelope !== "object" ||
    Array.isArray(envelope)
  ) {
    return 0;
  }
  const entradas = (envelope as Record<string, unknown>).entradas;
  return Array.isArray(entradas) ? entradas.length : 0;
}

async function receberEnvio(req: Request): Promise<Response> {
  // 1. Só POST (recepcao-de-dados.md §3.1).
  if (req.method !== "POST") {
    return responder({ ok: false, erro: "use POST" }, 405);
  }

  // 2. Tamanho (contrato §7): mais de 2 MB responde 413 antes de autenticar.
  const texto = await req.text();
  if (new TextEncoder().encode(texto).byteLength > LIMITE_BYTES) {
    return responder({ ok: false, erro: "envio grande demais" }, 413);
  }

  // 3. Token: SHA-256 e procura em tokens_envio (passo 3).
  const token = extrairToken(req);
  if (!token) {
    console.error("[receber-envio] token inválido");
    return responder({ ok: false, erro: "não autorizado" }, 401);
  }
  const hash = await sha256Hex(token);
  const { data: linhaToken } = await db
    .from("tokens_envio")
    .select("restaurante_id, prefixo, expira_em, revogado_em")
    .eq("hash", hash)
    .maybeSingle();

  const agoraIso = new Date().toISOString();
  const tokenValido =
    linhaToken !== null &&
    linhaToken.revogado_em === null &&
    (linhaToken.expira_em === null || linhaToken.expira_em > agoraIso);
  if (!tokenValido) {
    console.error("[receber-envio] token inválido");
    return responder({ ok: false, erro: "não autorizado" }, 401);
  }
  const restauranteId = linhaToken.restaurante_id;

  // 4. Ritmo (passo 4): mesmo restaurante enviou há menos de 20 s. O 429 não
  //    reinicia a contagem (registro-erro.ts).
  const { data: sinal } = await db
    .from("sinal_de_vida")
    .select("ultimo_envio_em")
    .eq("restaurante_id", restauranteId)
    .maybeSingle();
  const ultimoEnvio = sinal?.ultimo_envio_em
    ? Date.parse(sinal.ultimo_envio_em)
    : Number.NaN;
  if (!Number.isNaN(ultimoEnvio) && Date.now() - ultimoEnvio < RITMO_MS) {
    await registrarErro(restauranteId, 429, "envios rápidos demais");
    return responder(
      { ok: false, erro: "envios rápidos demais; aguarde o próximo ciclo" },
      429
    );
  }

  // 5. JSON válido (passo 5).
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    await registrarErro(restauranteId, 400, "json inválido");
    return responder({ ok: false, erro: "json inválido" }, 400);
  }

  // 6. Só entra o que está na lista do contrato (passo 6, D-29 e D-51): dado
  //    pessoal e campo desconhecido saem antes de validar e antes de guardar.
  const { envelope, camposDesconhecidos } = filtrarEnvelope(bruto);

  // 2.001+ entradas responde 413 (contrato §7), não 422.
  if (contarEntradas(envelope) > LIMITE_ENTRADAS) {
    await registrarErro(
      restauranteId,
      413,
      "mais de 2.000 entradas",
      envelope,
      camposDesconhecidos
    );
    return responder({ ok: false, erro: "envio grande demais" }, 413);
  }

  // 7. Valida o envelope (passo 7).
  const resultado = validarEnvelope(envelope);
  if (!resultado.success) {
    const erros = resultado.error.issues.map((problema) => ({
      campo: problema.path.join("."),
      mensagem: problema.message,
    }));
    await registrarErro(
      restauranteId,
      422,
      "formato inválido",
      envelope,
      camposDesconhecidos
    );
    return responder({ ok: false, erros }, 422);
  }

  // 8. Processa: upsert, reconciliação, sinal de vida, envios (passo 8).
  const { data: contagens, error: erroRpc } = await db.rpc("processar_envio", {
    p_restaurante_id: restauranteId,
    p_envelope: envelope as Json,
    p_campos_desconhecidos: camposDesconhecidos,
  });
  if (erroRpc) {
    console.error("[receber-envio] processar_envio falhou");
    await registrarErro(
      restauranteId,
      500,
      "erro interno",
      envelope,
      camposDesconhecidos
    );
    return responder({ ok: false, erro: "erro interno" }, 500);
  }

  // 9. Resposta 200 com as contagens e o próximo intervalo (passo 9).
  const detalhes = (contagens ?? {}) as unknown as Record<string, unknown>;
  return responder({ ok: true, ...detalhes }, 200);
}

Deno.serve(async (req) => {
  try {
    return await receberEnvio(req);
  } catch (erro) {
    // Log curto e sem dado pessoal; o SCC repete no próximo ciclo.
    console.error("[receber-envio] falha inesperada");
    return responder({ ok: false, erro: "erro interno" }, 500);
  }
});
```

- [ ] **Passo 11: Rodar e ver passar**

Confira o `405` da função (Tarefa 3, Passo 6) e rode:

```bash
npx biome check --write supabase/functions tests/recepcao tests/isolamento/rpc-privilegada.test.ts
npx tsc --noEmit
npx vitest run tests/recepcao tests/isolamento tests/metricas
```

Esperado: tudo passa, inclusive o teste antigo "descarta todos os dados pessoais" e `funcoes-fechadas` (as funções novas nasceram fechadas, então a lista de abertas não mudou).

- [ ] **Passo 12: Registrar a decisão e atualizar os documentos**

Em `docs/decisoes.md`, acrescente no fim da tabela:

```markdown
| D-51 | 13/10/2026 | **A nuvem só grava os campos que conhece.** Campo novo vindo do SCC, fora da lista do [contrato §5](integracao-scc/contrato-de-dados.md), é descartado na recepção. Fica registrado só o **nome** do campo, para aparecer no admin e a Repply decidir se passa a aceitar. Os "extras" já listados no contrato continuam guardados. *Ajusta a recepção, que antes levava qualquer campo desconhecido para `extras`.* | B12 | Um campo novo pode ser dado pessoal (CPF, e-mail, endereço). Barrar por quatro nomes exatos não protege contra o que ainda não existe (D-29). |
```

Em `docs/integracao-scc/contrato-de-dados.md`, §5, acrescente depois da lista "Não envie":

```markdown
**Campo fora das duas tabelas acima não é guardado.** Se o SCC passar a mandar um campo novo, a nuvem descarta o valor e registra só o nome do campo, que aparece para a Repply no admin. Para um campo novo passar a valer, combine antes: ele entra nesta lista numa versão nova do contrato.
```

E no §12, acrescente à linha da versão 0.2: `; campo fora da lista do §5 é descartado (D-51)`.

Em `docs/arquitetura/recepcao-de-dados.md`, §3:
- troque o passo 6 por:

```markdown
6. **Só entra o que está na lista** (D-29, D-51): fica o que o contrato §5 descreve. `NomeCliente`, `RG`, `FoneCliente` e `Sexo` saem em silêncio; qualquer outro campo desconhecido sai e tem **só o nome** registrado em `envios.campos_desconhecidos`. Isso acontece **antes de qualquer outra coisa**, inclusive antes de guardar o JSON original. A lista vive em `supabase/functions/_shared/campos-permitidos.ts`, e o `processar_envio` a repete como segunda barreira.
```

- no passo 8.2, troque "leva os campos desconhecidos para `extras`;" por "leva para `extras` só os campos listados como extras no contrato §5;".
- no §4, acrescente à tabela de casos:

```markdown
| Envio com campo novo (`CPF`) | Valor em lugar nenhum; nome em `envios.campos_desconhecidos` |
| Segundo envio em menos de 20 s, depois de um `429` | A contagem não reinicia: aceito quando completar 20 s do envio anterior |
```

Em `docs/arquitetura/modelo-de-dados.md`:
- no SQL de `envios`, acrescente depois de `payload`: `  campos_desconhecidos text[] not null default '{}', -- nomes (nunca valores) de campos fora da lista (D-51)`
- na tabela de funções, troque a linha de `processar_envio` por:

```markdown
| `processar_envio(restaurante_id, envelope, campos_desconhecidos)` | Toda a gravação de um envio numa transação só; grava apenas os campos da lista do contrato (ver [`recepcao-de-dados.md`](recepcao-de-dados.md)) |
| `so_valor_simples(valor)` | Devolve o valor só se for texto, número, booleano ou null |
```

Em `docs/arquitetura/seguranca-e-isolamento.md`, §6, troque o último item por:

```markdown
- **Só entra o que está na lista** do contrato §5 (D-29, D-51). Nome, RG, telefone e sexo são descartados; campo desconhecido também, e dele fica só o nome. Vale para as contas e para o JSON original.
```

- [ ] **Passo 13: Commit**

```bash
git fetch && git status -sb
git status --short
git add supabase/functions/_shared/campos-permitidos.ts supabase/functions/_shared/registro-erro.ts supabase/functions/receber-envio/index.ts supabase/migrations/20261013130000_recepcao_so_grava_campos_conhecidos.sql types/database.types.ts tests/recepcao/campos-permitidos.test.ts tests/recepcao/envio.test.ts tests/recepcao/registro-erro.test.ts tests/isolamento/rpc-privilegada.test.ts docs/decisoes.md docs/integracao-scc/contrato-de-dados.md docs/arquitetura/recepcao-de-dados.md docs/arquitetura/modelo-de-dados.md docs/arquitetura/seguranca-e-isolamento.md
git commit -m "Grava só os campos conhecidos do SCC e registra o nome dos novos (D-51)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 9: Vigia que não para e não alarma na abertura

**Por quê:** três defeitos no `atualizar_estados`:
1. um restaurante com horário ou fuso malformado derruba a rotina para todos;
2. o atraso é contado desde o último envio, mesmo que ele tenha sido ontem: se o computador do restaurante é desligado à noite, a casa aparece "parada" no minuto em que abre;
3. o esboço do alarme marca "avisado" sem ter enviado nada, avisa "voltou" quando a casa fecha, e chama sem identificação uma função que não existe.

O alarme de verdade é a etapa 9. Aqui o esboço **sai** do vigia, para ele parar de mentir; o vigia fica só com o que sabe fazer: calcular o estado.

**Arquivos:**
- Criar: `supabase/migrations/20261013140000_vigia_resiliente.sql`
- Criar: `tests/rotinas/aberto-desde.test.ts`
- Modificar: `tests/rotinas/estados-retencao.test.ts`
- Gerar: `types/database.types.ts`
- Modificar: `docs/arquitetura/recepcao-de-dados.md`, `docs/arquitetura/modelo-de-dados.md`

**Interfaces:**
- Consome: Tarefa 5 (funções novas nascem fechadas).
- Produz:
  - `abertura_do_intervalo(p_horario jsonb, p_fuso text, p_momento timestamptz) returns timestamptz` — abertura do intervalo que contém o momento; `null` se fechado;
  - `aberto_desde(p_horario jsonb, p_fuso text, p_agora timestamptz default now()) returns timestamptz` — desde quando a casa está aberta sem interrupção; `null` se fechada; `-infinity` se não há horário configurado;
  - `atualizar_estados()` sem tocar em `alarme_enviado_em`;
  - `esta_aberto_agora` deixa de existir.

- [ ] **Passo 1: Escrever os testes de horário que falham**

Crie `tests/rotinas/aberto-desde.test.ts`:

```ts
// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conectarBanco } from "../helpers/supabase-local";

// America/Fortaleza é UTC-3 o ano todo. 09/10/2026 é uma sexta (dia 5).
const fuso = "America/Fortaleza";
const sextaAteSabado = [{ dia: 5, abre: "11:00", fecha: "02:00" }];
const doisTurnosColados = [
  { dia: 5, abre: "11:00", fecha: "17:00" },
  { dia: 5, abre: "17:00", fecha: "23:00" },
];
const doisTurnosComIntervalo = [
  { dia: 5, abre: "11:00", fecha: "15:00" },
  { dia: 5, abre: "18:00", fecha: "23:00" },
];
const sempreAberto = Array.from({ length: 7 }, (_, dia) => ({
  dia,
  abre: "00:00",
  fecha: "00:00",
}));

describe("desde quando a casa está aberta", () => {
  let banco: Client;

  beforeAll(async () => {
    banco = await conectarBanco();
  });

  afterAll(async () => {
    await banco?.end();
  });

  async function abertoDesde(
    horario: unknown,
    agora: string
  ): Promise<string | null> {
    const resultado = await banco.query<{ desde: string | null }>(
      `select to_char(
                public.aberto_desde($1::jsonb, $2, $3::timestamptz) at time zone 'UTC',
                'YYYY-MM-DD"T"HH24:MI"Z"'
              ) as desde`,
      [JSON.stringify(horario), fuso, agora]
    );
    return resultado.rows[0]?.desde ?? null;
  }

  it.each([
    ["sexta 21h40, casa aberta desde as 11h", sextaAteSabado, "2026-10-10T00:40:00Z", "2026-10-09T14:00Z"],
    ["sábado 1h30, ainda o expediente de sexta", sextaAteSabado, "2026-10-10T04:30:00Z", "2026-10-09T14:00Z"],
    ["sábado 2h em ponto, já fechou", sextaAteSabado, "2026-10-10T05:00:00Z", null],
    ["sexta 10h59, ainda não abriu", sextaAteSabado, "2026-10-09T13:59:00Z", null],
    ["dois turnos colados contam como uma abertura só", doisTurnosColados, "2026-10-09T21:00:00Z", "2026-10-09T14:00Z"],
    ["dois turnos com intervalo: vale a abertura do segundo", doisTurnosComIntervalo, "2026-10-09T21:30:00Z", "2026-10-09T21:00Z"],
    ["no intervalo entre os turnos, fechado", doisTurnosComIntervalo, "2026-10-09T19:00:00Z", null],
  ])("%s", async (_, horario, agora, esperado) => {
    expect(await abertoDesde(horario, agora)).toBe(esperado);
  });

  it("casa 24 horas não ganha uma 'abertura' nova a cada meia-noite", async () => {
    const resultado = await banco.query<{ antiga: boolean }>(
      `select public.aberto_desde($1::jsonb, $2, $3::timestamptz)
                <= $3::timestamptz - interval '7 days' as antiga`,
      [JSON.stringify(sempreAberto), fuso, "2026-10-10T03:05:00Z"]
    );
    expect(resultado.rows[0]?.antiga).toBe(true);
  });

  it.each([
    ["lista vazia", "[]"],
    ["nulo", "null"],
    ["texto no lugar da lista", '"sempre"'],
  ])("sem horário configurado (%s) nunca é 'fechado'", async (_, horario) => {
    const resultado = await banco.query<{ sem_inicio: boolean }>(
      `select public.aberto_desde($1::jsonb, $2, now()) = '-infinity'::timestamptz as sem_inicio`,
      [horario, fuso]
    );
    expect(resultado.rows[0]?.sem_inicio).toBe(true);
  });
});
```

- [ ] **Passo 2: Escrever os testes do vigia que falham**

Em `tests/rotinas/estados-retencao.test.ts`, acrescente antes do teste "mantém jobs ativos com comando e horários contratados":

```ts
  it("um restaurante com horário ou fuso malformado não impede o cálculo dos outros", async () => {
    const dados = fixture as Fixture;
    await comSinaisEstaveis(banco as Client, async (cliente) => {
      await cliente.query("savepoint efeitos_vigia");
      const estados = async () =>
        (
          await cliente.query<{ restaurante_id: string; estado: string }>(
            "select restaurante_id::text, estado from public.sinal_de_vida where restaurante_id = any($1::uuid[])",
            [dados.idsRestaurantes]
          )
        ).rows;
      await cliente.query(
        `insert into public.sinal_de_vida (restaurante_id, primeiro_envio_em, ultimo_envio_ok_em)
         values ($1, now() - interval '10 minutes', now() - interval '10 minutes'),
                ($2, now() - interval '10 minutes', now() - interval '10 minutes')`,
        [dados.restauranteA, dados.restauranteB]
      );
      await cliente.query(
        "update public.restaurantes set horario_funcionamento = $2::jsonb where id = $1",
        [
          dados.restauranteA,
          JSON.stringify([{ dia: "sexta", abre: "25:99", fecha: "oi" }]),
        ]
      );
      await cliente.query("select public.atualizar_estados()");
      expect(await estados()).toEqual(
        expect.arrayContaining([
          { restaurante_id: dados.restauranteA, estado: "aguardando" },
          { restaurante_id: dados.restauranteB, estado: "em_dia" },
        ])
      );
      // Horário válido, fuso que não existe. (Com a lista de horários vazia o
      // fuso nem é consultado, então o horário precisa estar preenchido.)
      await cliente.query(
        "update public.restaurantes set horario_funcionamento = $2::jsonb, fuso = 'Marte/Olimpo' where id = $1",
        [
          dados.restauranteA,
          JSON.stringify(
            Array.from({ length: 7 }, (_, dia) => ({
              dia,
              abre: "00:00",
              fecha: "00:00",
            }))
          ),
        ]
      );
      await cliente.query(
        "update public.sinal_de_vida set estado = 'aguardando' where restaurante_id = $1",
        [dados.restauranteB]
      );
      await cliente.query("select public.atualizar_estados()");
      expect(await estados()).toEqual(
        expect.arrayContaining([
          { restaurante_id: dados.restauranteA, estado: "aguardando" },
          { restaurante_id: dados.restauranteB, estado: "em_dia" },
        ])
      );
      await cliente.query("rollback to savepoint efeitos_vigia");
    });
  });

  it("não conta como atraso o tempo em que a casa estava fechada", async () => {
    const dados = fixture as Fixture;
    await comSinaisEstaveis(banco as Client, async (cliente) => {
      await cliente.query("savepoint efeitos_vigia");
      await cliente.query(
        `insert into public.sinal_de_vida (restaurante_id, primeiro_envio_em, ultimo_envio_ok_em)
         values ($1, now() - interval '3 days', now() - interval '9 hours')`,
        [dados.restauranteA]
      );
      // A casa abriu há N minutos e fecha daqui a uma hora, no fuso dela.
      const estadoComCasaAbertaHa = async (minutos: number) => {
        await cliente.query(
          `update public.restaurantes r
              set horario_funcionamento = jsonb_build_array(jsonb_build_object(
                    'dia', extract(dow from (now() - make_interval(mins => $2::int)) at time zone r.fuso)::int,
                    'abre', to_char((now() - make_interval(mins => $2::int)) at time zone r.fuso, 'HH24:MI'),
                    'fecha', to_char((now() + interval '60 minutes') at time zone r.fuso, 'HH24:MI')))
            where r.id = $1`,
          [dados.restauranteA, minutos]
        );
        await cliente.query("select public.atualizar_estados()");
        const linha = await cliente.query<{ estado: string }>(
          "select estado from public.sinal_de_vida where restaurante_id = $1",
          [dados.restauranteA]
        );
        return linha.rows[0]?.estado;
      };
      expect(await estadoComCasaAbertaHa(5)).toBe("em_dia");
      expect(await estadoComCasaAbertaHa(25)).toBe("atrasado");
      expect(await estadoComCasaAbertaHa(50)).toBe("parado");
      await cliente.query("rollback to savepoint efeitos_vigia");
    });
  });

  it("o vigia só calcula o estado: não marca alarme como enviado", async () => {
    const dados = fixture as Fixture;
    await comSinaisEstaveis(banco as Client, async (cliente) => {
      await cliente.query("savepoint efeitos_vigia");
      await cliente.query(
        `insert into public.sinal_de_vida (restaurante_id, primeiro_envio_em, ultimo_envio_ok_em)
         values ($1, now() - interval '3 days', now() - interval '2 hours')`,
        [dados.restauranteA]
      );
      await cliente.query("select public.atualizar_estados()");
      const linha = await cliente.query<{
        estado: string;
        alarme_enviado_em: string | null;
      }>(
        "select estado, alarme_enviado_em from public.sinal_de_vida where restaurante_id = $1",
        [dados.restauranteA]
      );
      expect(linha.rows[0]).toEqual({
        estado: "parado",
        alarme_enviado_em: null,
      });
      await cliente.query("rollback to savepoint efeitos_vigia");
    });
  });
```

- [ ] **Passo 3: Rodar e ver falhar**

Rode: `npx vitest run tests/rotinas`
Esperado: `aberto-desde` FALHA inteiro (`function public.aberto_desde(jsonb, unknown, timestamp with time zone) does not exist`). Em `estados-retencao`, os três testes novos FALHAM: o primeiro com erro de conversão (`invalid input syntax for type integer`), o segundo com `parado` no lugar de `em_dia`, o terceiro com `alarme_enviado_em` preenchido.

- [ ] **Passo 4: Escrever a migration**

Crie `supabase/migrations/20261013140000_vigia_resiliente.sql`:

```sql
-- Vigia do sinal de vida: não para por causa de um cadastro ruim e não conta
-- como atraso o tempo em que a casa estava fechada.
--
-- Três correções em relação à fundação:
--   1. cada restaurante é calculado isolado: horário ou fuso malformado em um
--      não derruba o cálculo dos outros;
--   2. o atraso conta do que for mais recente: o último envio sem erro OU a
--      abertura da casa. Sem isso, o restaurante que desliga o computador à
--      noite aparecia "parado" no minuto em que abria;
--   3. o esboço do alarme sai daqui. Ele marcava "avisado" sem ter enviado,
--      avisava "voltou" quando a casa fechava e chamava, sem identificação,
--      uma função que não existe. O alarme de verdade é uma rotina própria
--      (divida-tecnica.md, item do alarme por e-mail).
begin;

-- Abertura do intervalo de funcionamento que contém p_momento; null se fechado.
-- horario_funcionamento: [{ "dia": 5, "abre": "11:00", "fecha": "02:00" }, ...],
-- com 0 = domingo. Se fecha <= abre, o intervalo atravessa a meia-noite
-- (abre = fecha significa 24 horas).
create function public.abertura_do_intervalo(
  p_horario jsonb,
  p_fuso text,
  p_momento timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_local    timestamp := p_momento at time zone p_fuso;
  v_dia      int       := extract(dow from v_local)::int;
  v_hora     time      := v_local::time;
  v_item     jsonb;
  v_dia_abre int;
  v_abre     time;
  v_fecha    time;
begin
  for v_item in select * from jsonb_array_elements(p_horario) loop
    v_dia_abre := (v_item ->> 'dia')::int;
    v_abre     := (v_item ->> 'abre')::time;
    v_fecha    := (v_item ->> 'fecha')::time;

    if v_fecha > v_abre then
      if v_dia = v_dia_abre and v_hora >= v_abre and v_hora < v_fecha then
        return (v_local::date + v_abre) at time zone p_fuso;
      end if;
    else
      if v_dia = v_dia_abre and v_hora >= v_abre then
        return (v_local::date + v_abre) at time zone p_fuso;
      end if;
      if v_dia = (v_dia_abre + 1) % 7 and v_hora < v_fecha then
        return ((v_local::date - 1) + v_abre) at time zone p_fuso;
      end if;
    end if;
  end loop;

  return null;
end;
$$;

-- Desde quando a casa está aberta sem interrupção.
--   null       = fechada agora;
--   -infinity  = sem horário configurado: desconhecido nunca é "fechado";
--   momento    = abertura do expediente atual. Intervalos colados (um termina
--                quando o outro começa, ou casa 24 h) contam como um só.
create function public.aberto_desde(
  p_horario jsonb,
  p_fuso text,
  p_agora timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_desde    timestamptz;
  v_anterior timestamptz;
begin
  if p_horario is null
     or jsonb_typeof(p_horario) <> 'array'
     or jsonb_array_length(p_horario) = 0 then
    return '-infinity'::timestamptz;
  end if;

  v_desde := public.abertura_do_intervalo(p_horario, p_fuso, p_agora);
  if v_desde is null then
    return null;
  end if;

  for v_passo in 1..8 loop
    v_anterior := public.abertura_do_intervalo(
      p_horario, p_fuso, v_desde - interval '1 second'
    );
    exit when v_anterior is null;
    v_desde := v_anterior;
  end loop;

  return v_desde;
end;
$$;

create or replace function public.atualizar_estados()
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rec    record;
  v_estado text;
  v_delta  interval;
  v_desde  timestamptz;
begin
  for v_rec in
    select s.restaurante_id, s.primeiro_envio_em, s.ultimo_envio_ok_em,
           s.estado as estado_atual, r.fuso, r.horario_funcionamento
      from public.sinal_de_vida s
      join public.restaurantes r on r.id = s.restaurante_id
  loop
    begin
      if v_rec.primeiro_envio_em is null then
        v_estado := 'aguardando';
      else
        v_desde := public.aberto_desde(v_rec.horario_funcionamento, v_rec.fuso, now());
        if v_desde is null then
          v_estado := 'fechado';
        else
          -- conta do que for mais recente: o último envio sem erro ou a abertura
          v_delta := now() - greatest(
            coalesce(v_rec.ultimo_envio_ok_em, v_rec.primeiro_envio_em),
            v_desde
          );
          if v_delta <= interval '15 minutes' then
            v_estado := 'em_dia';
          elsif v_delta <= interval '45 minutes' then
            v_estado := 'atrasado';
          else
            v_estado := 'parado';
          end if;
        end if;
      end if;

      if v_estado <> v_rec.estado_atual then
        update public.sinal_de_vida
           set estado = v_estado, estado_desde = now()
         where restaurante_id = v_rec.restaurante_id;
      end if;
    exception when others then
      -- cadastro malformado (horário ou fuso) de UM restaurante: registra e
      -- segue. O estado dele fica como estava; os outros são calculados.
      raise warning 'rf-vigia: restaurante % ignorado (%)', v_rec.restaurante_id, sqlstate;
    end;
  end loop;
end;
$$;

drop function public.esta_aberto_agora(jsonb, text);

commit;
```

- [ ] **Passo 5: Aplicar no banco local, gerar os tipos e ver passar**

```bash
npx supabase migration up --local
npm run types -- --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
git diff --stat types/database.types.ts
npx biome check --write tests/rotinas
npx tsc --noEmit
npx vitest run tests/rotinas tests/isolamento
```

Esperado: migration aplicada; o diff de tipos tira `esta_aberto_agora` e acrescenta `aberto_desde` e `abertura_do_intervalo`; todos os testes de `tests/rotinas` e `tests/isolamento` passam (as duas funções novas nasceram fechadas, então `funcoes-fechadas` não muda).

- [ ] **Passo 6: Atualizar os documentos**

Em `docs/arquitetura/recepcao-de-dados.md`, §7, substitua do parágrafo "`atualizar_estados()` roda a cada 5 minutos" até o fim da lista "**Alarme:**" por:

```markdown
`atualizar_estados()` roda a cada 5 minutos e calcula, para cada restaurante:

| Estado | Regra |
|---|---|
| `aguardando` | Nunca enviou |
| `fechado` | Agora está fora do horário de funcionamento. Nunca alarma |
| `em_dia` | Atraso ≤ 15 min |
| `atrasado` | Atraso entre 15 e 45 min |
| `parado` | Atraso acima de 45 min |

- **Atraso:** conta do que for mais recente, o último envio sem erro **ou a abertura da casa**. O tempo em que a casa estava fechada não conta: o restaurante que desliga o computador à noite não aparece "parado" no minuto em que abre.
- **Horário de funcionamento:** pode atravessar a meia-noite (ex.: 11h–2h), e o dia que vale é o da abertura. Dois intervalos colados, ou uma casa 24 horas, contam como uma abertura só. A regra está na função `aberto_desde`.
- **Sem horário cadastrado**, o restaurante conta como sempre aberto: desconhecido não vira "fechado". Por isso o admin precisa exigir o horário no cadastro (etapa 3).
- **Cadastro malformado** (horário ou fuso inválido) em um restaurante não para a rotina: ele é pulado, com um aviso no log do banco, e os outros são calculados.
- **Alarme por e-mail:** ainda **não existe**. O vigia só calcula o estado e não mexe em `alarme_enviado_em`. O envio do e-mail de "parado" e de "voltou" é uma rotina própria, da etapa do alarme (ver `docs/divida-tecnica.md`), com duas regras: só marca como avisado depois de confirmar que o e-mail saiu, e só avisa "voltou" quando os dados voltam, nunca porque a casa fechou.
```

Em `docs/arquitetura/modelo-de-dados.md`, na tabela de funções, troque a linha de `atualizar_estados()` por:

```markdown
| `atualizar_estados()` | O vigia: calcula o estado de cada restaurante (pg_cron a cada 5 min). Não envia alarme |
| `aberto_desde(horario, fuso, agora)` | Desde quando a casa está aberta sem interrupção; `null` se fechada |
| `abertura_do_intervalo(horario, fuso, momento)` | Abertura do intervalo de funcionamento que contém o momento |
```

- [ ] **Passo 7: Commit**

```bash
git fetch && git status -sb
git status --short
git add supabase/migrations/20261013140000_vigia_resiliente.sql types/database.types.ts tests/rotinas/aberto-desde.test.ts tests/rotinas/estados-retencao.test.ts docs/arquitetura/recepcao-de-dados.md docs/arquitetura/modelo-de-dados.md
git commit -m "Torna o vigia resiliente e para de contar atraso com a casa fechada" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 10: Cadastro fechado e senha mínima 8

**Por quê:** o `config.toml` está com cadastro público aberto e senha mínima 6. O combinado é conta criada só pelo admin (D-11) e mínimo de 8 (D-46), com a regra num lugar só.

**Arquivos:**
- Modificar: `supabase/config.toml`
- Criar: `lib/auth/senha.ts`
- Criar: `tests/auth/regra-de-senha.test.ts`
- Modificar: `docs/operacao/publicar.md`

**Interfaces:** Consome: nada. Produz: `SENHA_MINIMA` (número, `8`) exportada de `lib/auth/senha.ts`, que a etapa 2 usa nos formulários.

**Cuidado:** no `config.toml`, `[auth.email] enable_signup` **não** é "permitir cadastro por e-mail": é o interruptor do login por e-mail inteiro. Ele precisa continuar `true`. Quem fecha o cadastro público é o `enable_signup` da seção `[auth]`. Conta criada pelo admin (chave de serviço) continua funcionando com o cadastro fechado.

- [ ] **Passo 1: Escrever o teste que falha**

Crie `tests/auth/regra-de-senha.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SENHA_MINIMA } from "../../lib/auth/senha";

const toml = readFileSync("supabase/config.toml", "utf8");

/** Corpo de uma seção do config.toml, até a próxima seção. */
function secao(nome: string): string {
  const linhas = toml.split(/\r?\n/);
  const inicio = linhas.indexOf(`[${nome}]`);
  if (inicio < 0) throw new Error(`seção [${nome}] não encontrada`);
  const fim = linhas.findIndex(
    (linha, indice) => indice > inicio && linha.startsWith("[")
  );
  return linhas.slice(inicio + 1, fim < 0 ? undefined : fim).join("\n");
}

function valor(corpo: string, chave: string): string | undefined {
  return new RegExp(`^${chave}\\s*=\\s*(.+)$`, "m").exec(corpo)?.[1]?.trim();
}

describe("regra de senha e de cadastro", () => {
  it("a senha mínima é 8 (D-46)", () => {
    expect(SENHA_MINIMA).toBe(8);
  });

  it("o Supabase Auth usa a mesma senha mínima do código", () => {
    expect(valor(secao("auth"), "minimum_password_length")).toBe(
      String(SENHA_MINIMA)
    );
  });

  it("o cadastro público está desligado: a conta é criada pelo admin (D-11)", () => {
    expect(valor(secao("auth"), "enable_signup")).toBe("false");
  });

  it("o login por e-mail continua ligado", () => {
    expect(valor(secao("auth.email"), "enable_signup")).toBe("true");
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rode: `npx vitest run tests/auth/regra-de-senha.test.ts`
Esperado: FALHA (`Cannot find module ... lib/auth/senha`).

- [ ] **Passo 3: Criar a regra e ajustar a configuração**

Crie `lib/auth/senha.ts`:

```ts
/**
 * A regra de senha num lugar só (seguranca-e-isolamento.md §5, D-46).
 * O Supabase Auth usa o mesmo número em `supabase/config.toml`
 * (`minimum_password_length`); o teste `tests/auth/regra-de-senha.test.ts`
 * reprova se os dois divergirem.
 */
export const SENHA_MINIMA = 8;
```

Em `supabase/config.toml`, na seção `[auth]`:

- troque `enable_signup = true` por:

```toml
# repply food.: a conta é criada pela Repply, no admin (D-11). Ninguém se cadastra sozinho.
enable_signup = false
```

- troque `minimum_password_length = 6` por:

```toml
# repply food.: mesmo número de lib/auth/senha.ts (D-46).
minimum_password_length = 8
```

Na seção `[auth.email]`, acima da linha `enable_signup = true` (que **fica como está**), acrescente:

```toml
# repply food.: ATENÇÃO, este é o interruptor do login por e-mail inteiro, não só do
# cadastro. Precisa ficar true. Quem fecha o cadastro público é o [auth] enable_signup.
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
npx biome check --write lib/auth/senha.ts tests/auth/regra-de-senha.test.ts
npx vitest run tests/auth/regra-de-senha.test.ts
npx tsc --noEmit
```

Esperado: os 4 testes passam.

- [ ] **Passo 5: Conferir o comportamento de verdade no banco local**

A configuração de login só é lida na subida. Reinicie (os dados ficam guardados) e sirva a função de novo:

```bash
npx supabase stop
npx supabase start
```

(se na Tarefa 3 foi preciso `-x vector,logflare`, use de novo.) Depois, em segundo plano: `npx supabase functions serve receber-envio`.

Tente se cadastrar sem ser admin:

```bash
ANON=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2-)
curl -s -o /dev/null -w '%{http_code}\n' -X POST "http://127.0.0.1:54321/auth/v1/signup" \
  -H "apikey: $ANON" -H "content-type: application/json" \
  -d '{"email":"cadastro-publico@teste.repply.local","password":"senha-de-teste-123"}'
```

Esperado: `422` ou `403`, conforme a versão do serviço de login (os dois querem dizer "cadastro não permitido"). Se vier `200`, o cadastro continua aberto: pare e relate.

- [ ] **Passo 6: Documentar para a publicação**

Em `docs/operacao/publicar.md`, §1, troque o item "**Auth:**" e sua lista por:

```markdown
- **Auth** (os mesmos valores de `supabase/config.toml`; na nuvem se configura no painel ou por `config push`, com autorização):
  - **cadastro público desligado**: a conta é criada pelo admin (D-11);
  - o login por e-mail continua ligado;
  - senha mínima de 8 (`lib/auth/senha.ts`);
  - URL do site = `food.repplyhub.com.br`;
  - modelos de e-mail na marca;
  - **SMTP próprio (Resend)** antes do primeiro cliente, porque o SMTP padrão do Supabase tem limite baixo de envios.
```

- [ ] **Passo 7: Commit**

```bash
git fetch && git status -sb
git status --short
git add supabase/config.toml lib/auth/senha.ts tests/auth/regra-de-senha.test.ts docs/operacao/publicar.md
git commit -m "Fecha o cadastro público e fixa a senha mínima em 8" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 11: Fechamento

**Arquivos:**
- Modificar: `docs/divida-tecnica.md`, `README.md`, este plano (checkboxes)

**Interfaces:** Consome: todas as tarefas. Produz: a evidência de que a etapa fechou e o pedido de autorização para enviar ao GitHub.

- [ ] **Passo 1: Verificação completa, com a saída à vista**

Confira o `405` da função (Tarefa 3, Passo 6) e rode os quatro, um por vez:

```bash
npx tsc --noEmit
npm run check
npm run test
npm run build
```

Esperado: `tsc` sem saída; Biome sem erros; Vitest com todos os arquivos passando e **nenhum teste pulado**; build completa. Anote o total de testes e de arquivos para o Passo 2. Qualquer falha: `superpowers:systematic-debugging` antes de consertar.

- [ ] **Passo 2: Atualizar a dívida técnica**

Em `docs/divida-tecnica.md`, acrescente à tabela "Abertos":

```markdown
| 8 | **Alarme por e-mail não existe.** O vigia calcula o estado, mas ninguém é avisado quando um restaurante vira "parado". Regras para quando for feito: marcar como avisado só depois de confirmar que o e-mail saiu (`net._http_response`); avisar "voltou" só quando os dados voltam, nunca porque a casa fechou; a chamada da rotina para a função leva um segredo guardado no Vault | Média | Demonstração (passo 9 do roteiro) | Etapa 1, Tarefa 9 |
| 9 | Restaurante sem horário de funcionamento conta como sempre aberto e apareceria "parado" toda madrugada. O admin precisa exigir o horário, e o banco precisa validar o formato do horário e o fuso na gravação | Média | Admin (etapa 3) | Etapa 1, Tarefa 9 |
| 10 | O ambiente de desenvolvimento não tem trava no código contra apontar para a nuvem com a chave de serviço; hoje a proteção é o `.env.local` local e a documentação. Decidir a trava quando a nuvem tiver dados | Média | Primeira publicação (etapa 4) | Etapa 1, Tarefa 3 |
| 11 | No banco local do Lucas Duarte as migrations da fundação foram aplicadas à mão. Antes de `npx supabase migration up --local`, ele precisa marcar as quatro como aplicadas (`npx supabase migration repair --local --status applied <versão>`) | Baixa | Não | Fundação |
| 12 | O cadastro fechado é testado só pelo arquivo de configuração. O teste de comportamento (tentar se cadastrar e ser recusado) entra com os testes de login | Baixa | Não | Etapa 1, Tarefa 10 |
| 13 | As bibliotecas do Food estão uma geração atrás das do Repply Imob (gráficos, validação, login). Alinhar antes de copiar as peças do Imob | Média | Telas (etapa 2) | Estudo de 13/10/2026 |
```

E substitua a seção "Resolvidos" por (troque `<commit>` pelo código curto de cada commit, de `git log --oneline`):

```markdown
## Resolvidos

| Item | Resolvido em | Commit |
|---|---|---|
| A verificação não fechava no Windows (fim de linha, caminho fixo de Linux no teste de tipos, `npm run types`) | 13/10/2026 | `<commit>` e `<commit>` |
| Não havia prova de que as migrations montam um banco do zero | 13/10/2026 | `<commit>` |
| `npm run supabase:migrate` mudava o banco da nuvem; o gerador enviava para qualquer endereço | 13/10/2026 | `<commit>` |
| Função nova no banco nascia aberta para qualquer login | 13/10/2026 | `<commit>` |
| Testes de isolamento cobriam só 2 das 8 tabelas | 13/10/2026 | `<commit>` |
| O `429` reiniciava a contagem dos 20 s, e o contrato não avisava do intervalo | 13/10/2026 | `<commit>` |
| Dado pessoal barrado por 4 nomes exatos de campo (D-51) | 13/10/2026 | `<commit>` |
| O vigia parava para todos se um restaurante tivesse horário ou fuso malformado; alarmava na abertura; o esboço do alarme marcava "avisado" sem enviar | 13/10/2026 | `<commit>` |
| Cadastro público aberto e senha mínima 6 no `config.toml` | 13/10/2026 | `<commit>` |
```

- [ ] **Passo 3: Atualizar o estado no README**

Em `README.md`, substitua os dois blocos de citação do topo ("**Estado em 13/10/2026:**" e "**Pendências externas:**") por (preencha os dois números com a saída do Passo 1):

```markdown
> **Estado em 13/10/2026:** fundação **fechada localmente** (etapa 1 do plano do MVP). A verificação (tipos, lint, testes e build) passa no Windows e no Linux, com **<N> testes em <M> arquivos**, sobre um banco local montado do zero pelas migrations. Telas, login, admin, PDF e alarme por e-mail não estão implementados. Nada foi publicado na nuvem.

> **O que falta:** ver [`docs/divida-tecnica.md`](docs/divida-tecnica.md) e os planos em [`docs/superpowers/plans/`](docs/superpowers/plans/).
```

- [ ] **Passo 4: Marcar o plano e commitar**

Marque os checkboxes deste arquivo como feitos e commite:

```bash
git fetch && git status -sb
git status --short
git add docs/divida-tecnica.md README.md docs/superpowers/plans/2026-10-13-etapa-1-fechar-a-fundacao.md
git commit -m "Registra o fechamento da etapa 1" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Passo 5: Revisão de código**

Use `superpowers:requesting-code-review` sobre o intervalo `origin/main..HEAD`. Trate o que vier com `superpowers:receiving-code-review`. Conserto gera commit novo e nova rodada do Passo 1.

- [ ] **Passo 6: Pedir autorização para enviar ao GitHub**

**Não rode `git push` sem o ok.** Mostre ao Lucas Ferreira:

```bash
git fetch && git status -sb
git log --oneline origin/main..HEAD
```

e pergunte, em português simples, se pode enviar esses commits para o `main`. Se o `git status -sb` mostrar `[behind N]`, traga o que entrou (`git pull --rebase`), rode de novo o Passo 1 e só então peça.

- [ ] **Passo 7: Recado para o Lucas Duarte**

Entregue ao Lucas Ferreira este texto para repassar, depois que os commits estiverem no GitHub:

```
Subi a etapa 1 do plano do MVP (docs/superpowers/plans/2026-10-13-etapa-1-fechar-a-fundacao.md).
Para atualizar o seu banco local sem perder a demonstração:
1) git pull
2) como as 4 migrations da fundação foram aplicadas à mão aí, marque-as como aplicadas:
   npx supabase migration repair --local --status applied 20261009120000 20261011201500 20261011213000 20261011213100
3) npx supabase migration up --local
4) npx supabase stop && npx supabase start   (o cadastro público foi desligado no config.toml)
5) npm run test
Mudou: processar_envio ganhou um 3º argumento opcional; esta_aberto_agora virou aberto_desde;
função nova no banco agora nasce fechada (ver seguranca-e-isolamento.md §2, item 12);
npm run supabase:migrate não existe mais.
```

---

## Critérios de aceite da etapa 1

- [ ] `npx tsc --noEmit`, `npm run check`, `npm run test` e `npm run build` passam nesta máquina (Windows), sem teste pulado.
- [ ] O banco local desta máquina foi montado do zero pelas migrations, e a suíte inteira passa sobre ele.
- [ ] `.env.local` desta máquina aponta para `127.0.0.1`; as chaves da nuvem estão em `.env.nuvem.local`, fora do git.
- [ ] Não existe atalho no `package.json` que mexa na nuvem; o gerador recusa endereço de fora sem `--confirmo-nuvem`.
- [ ] Função criada em `public` nasce sem permissão para `anon` e `authenticated`; a lista de funções abertas tem exatamente três.
- [ ] As 8 tabelas têm teste de leitura e de escrita por cliente, login sem acesso, sem login e admin.
- [ ] Campo desconhecido do SCC não é gravado em lugar nenhum; o nome dele fica em `envios.campos_desconhecidos` (D-51).
- [ ] Um `429` não mexe em `ultimo_envio_em`; o contrato está na versão 0.2 com a regra dos 20 segundos.
- [ ] O vigia calcula os outros restaurantes quando um tem cadastro malformado, não conta atraso com a casa fechada e não toca em `alarme_enviado_em`.
- [ ] Cadastro público recusado no banco local (`422`); senha mínima 8 no código e na configuração.
- [ ] Nada foi enviado à nuvem. Nenhum `git push` sem o ok do Lucas Ferreira.
