import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Client } from "pg";
import { hashToken } from "../../tests/helpers/supabase-local.ts";
import {
  validarAmbienteBenchmark,
  validarBancoDescartavel,
  validarJobsCronInativos,
} from "./trava-nuvem.ts";

export type ReservaIngestao = {
  quantidade: 10 | 500 | 2000;
  restauranteId: string;
  slug: string;
};

export const RESERVAS_INGESTAO: readonly ReservaIngestao[] = [
  {
    quantidade: 10,
    restauranteId: "00000000-0000-4000-8000-000000001010",
    slug: "benchmark-ingest-10-20261025",
  },
  {
    quantidade: 500,
    restauranteId: "00000000-0000-4000-8000-000000001500",
    slug: "benchmark-ingest-500-20261025",
  },
  {
    quantidade: 2000,
    restauranteId: "00000000-0000-4000-8000-000000003000",
    slug: "benchmark-ingest-2000-20261025",
  },
] as const;

type ResultadoQuery<T extends Record<string, unknown>> = {
  rows: T[];
  rowCount: number | null;
};

export type ClienteIngestao = {
  connect: () => Promise<void>;
  end: () => Promise<void>;
  query: <T extends Record<string, unknown>>(
    texto: string,
    valores?: readonly string[]
  ) => Promise<ResultadoQuery<T>>;
};

type ConfiguracaoIngestao = {
  reservas: Array<ReservaIngestao & { token: string }>;
};

type OpcoesPrepararIngestao = {
  httpUrl: string;
  dbUrl: string;
  caminhoConfig?: string;
  criarCliente?: (dbUrl: string) => ClienteIngestao;
  validarBanco?: (cliente: ClienteIngestao) => Promise<void>;
  validarCron?: (cliente: ClienteIngestao) => Promise<void>;
  gerarToken?: () => string;
};

const CAMINHO_CONFIG_PADRAO =
  ".superpowers/desempenho/ingestao-acessos.local.json";
const execFile = promisify(execFileCallback);

type CaminhoConfiguracaoValidado = {
  caminho: string;
  raizSuperpowers: string;
};

function estaAbaixoDaRaiz(raiz: string, caminho: string): boolean {
  const diferenca = relative(raiz, caminho);
  return (
    diferenca !== "" &&
    !diferenca.startsWith(`..${sep}`) &&
    diferenca !== ".." &&
    !isAbsolute(diferenca)
  );
}

function codigoDoProcesso(erro: unknown): number | string | undefined {
  if (erro && typeof erro === "object" && "code" in erro) {
    const { code } = erro as { code: unknown };
    return typeof code === "number" || typeof code === "string"
      ? code
      : undefined;
  }
  return undefined;
}

async function arquivoRastreado(
  raiz: string,
  caminhoRelativo: string
): Promise<boolean> {
  try {
    await execFile(
      "git",
      ["ls-files", "--error-unmatch", "--", caminhoRelativo],
      { cwd: raiz }
    );
    return true;
  } catch (erro) {
    if (codigoDoProcesso(erro) === 1) return false;
    throw new Error(
      "Caminho da configuração não pôde ser conferido no repositório."
    );
  }
}

async function arquivoIgnorado(
  raiz: string,
  caminhoRelativo: string
): Promise<boolean> {
  try {
    await execFile("git", ["check-ignore", "--quiet", "--", caminhoRelativo], {
      cwd: raiz,
    });
    return true;
  } catch (erro) {
    if (codigoDoProcesso(erro) === 1) return false;
    throw new Error(
      "Caminho da configuração não pôde ser conferido no repositório."
    );
  }
}

async function validarAncestraisSemSymlink(
  raiz: string,
  raizSuperpowers: string,
  caminho: string
): Promise<void> {
  const partes = relative(raiz, caminho).split(sep);
  let atual = raiz;
  for (const parte of partes) {
    atual = join(atual, parte);
    let estado: Stats;
    try {
      estado = await lstat(atual);
    } catch (erro) {
      if (codigoDoProcesso(erro) === "ENOENT") break;
      throw erro;
    }
    if (estado.isSymbolicLink())
      throw new Error(
        "Caminho da configuração não pode atravessar link simbólico."
      );
    const resolvido = await realpath(atual);
    if (atual !== caminho && !estado.isDirectory())
      throw new Error(
        "Caminho da configuração tem ancestral que não é diretório."
      );
    if (
      (atual === raizSuperpowers && resolvido !== raizSuperpowers) ||
      (atual !== raiz &&
        !estaAbaixoDaRaiz(raizSuperpowers, resolvido) &&
        resolvido !== raizSuperpowers)
    )
      throw new Error("Caminho da configuração sai de .superpowers.");
  }
}

async function validarCaminhoConfiguracao(
  caminhoInformado: string
): Promise<CaminhoConfiguracaoValidado> {
  const raiz = await realpath(process.cwd());
  const raizSuperpowers = resolve(raiz, ".superpowers");
  const caminho = resolve(raiz, caminhoInformado);
  if (!estaAbaixoDaRaiz(raizSuperpowers, caminho))
    throw new Error(
      "Caminho da configuração deve ficar estritamente sob .superpowers."
    );

  await validarAncestraisSemSymlink(raiz, raizSuperpowers, caminho);
  const caminhoRelativo = relative(raiz, caminho);
  if (await arquivoRastreado(raiz, caminhoRelativo))
    throw new Error(
      "Caminho da configuração não pode apontar para arquivo rastreado."
    );
  if (!(await arquivoIgnorado(raiz, caminhoRelativo)))
    throw new Error(
      "Caminho da configuração precisa ser ignorado pelo repositório."
    );
  return { caminho, raizSuperpowers };
}

function criarClientePadrao(dbUrl: string): ClienteIngestao {
  const cliente = new Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 3000,
  });
  return {
    connect: async () => {
      await cliente.connect();
    },
    end: () => cliente.end(),
    query: async <T extends Record<string, unknown>>(
      texto: string,
      valores?: readonly string[]
    ): Promise<ResultadoQuery<T>> => {
      const resultado = await cliente.query<T>(
        texto,
        valores ? [...valores] : undefined
      );
      return { rows: resultado.rows, rowCount: resultado.rowCount };
    },
  };
}

async function validarBancoPadrao(cliente: ClienteIngestao): Promise<void> {
  await validarBancoDescartavel({
    query: (texto, valores) =>
      cliente.query<{ marcador: string }>(texto, valores),
  });
}

async function validarCronPadrao(cliente: ClienteIngestao): Promise<void> {
  await validarJobsCronInativos({
    query: (texto) => cliente.query<{ ativos: string | number }>(texto),
  });
}

function gerarToken(): string {
  return `rf_${randomUUID().replaceAll("-", "")}`;
}

async function recusarColisao(cliente: ClienteIngestao): Promise<void> {
  const resultado = await cliente.query<{ id: string }>(
    `select id from public.restaurantes
      where id = any($1::uuid[]) or slug = any($2::text[])`,
    [
      `{${RESERVAS_INGESTAO.map((reserva) => reserva.restauranteId).join(",")}}`,
      `{${RESERVAS_INGESTAO.map((reserva) => reserva.slug).join(",")}}`,
    ]
  );
  if (resultado.rows.length > 0)
    throw new Error("Colisão: uma reserva exclusiva de ingestão já existe.");
}

async function gravarConfiguracaoExclusiva(
  caminhoValidado: CaminhoConfiguracaoValidado,
  configuracao: ConfiguracaoIngestao
): Promise<void> {
  const { caminho, raizSuperpowers } = caminhoValidado;
  await mkdir(dirname(caminho), { recursive: true });
  await validarAncestraisSemSymlink(
    await realpath(process.cwd()),
    raizSuperpowers,
    caminho
  );
  await writeFile(caminho, `${JSON.stringify(configuracao, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
}

async function inserirReservas(
  cliente: ClienteIngestao,
  configuracao: ConfiguracaoIngestao
): Promise<void> {
  const restaurantes = await cliente.query(
    `insert into public.restaurantes (id, slug, nome, fuso, hora_virada)
     values ($1::uuid, $2, $3, 'America/Fortaleza', '05:00'),
            ($4::uuid, $5, $6, 'America/Fortaleza', '05:00'),
            ($7::uuid, $8, $9, 'America/Fortaleza', '05:00')`,
    RESERVAS_INGESTAO.flatMap((reserva) => [
      reserva.restauranteId,
      reserva.slug,
      `Benchmark de ingestão ${reserva.quantidade}`,
    ])
  );
  if (restaurantes.rowCount !== RESERVAS_INGESTAO.length)
    throw new Error("Não foram criadas exatamente três reservas de ingestão.");

  const tokens = await cliente.query(
    `insert into public.tokens_envio (restaurante_id, hash, prefixo)
     values ($1::uuid, $2, $3), ($4::uuid, $5, $6), ($7::uuid, $8, $9)`,
    configuracao.reservas.flatMap((reserva) => [
      reserva.restauranteId,
      hashToken(reserva.token),
      reserva.token.slice(0, 7),
    ])
  );
  if (tokens.rowCount !== RESERVAS_INGESTAO.length)
    throw new Error("Não foram criados exatamente três tokens de ingestão.");

  const verificacao = await cliente.query<{
    restaurante_id: string;
    slug: string;
    token_restaurante_id: string;
  }>(
    `select r.id as restaurante_id, r.slug, t.restaurante_id as token_restaurante_id
       from public.restaurantes r
       join public.tokens_envio t on t.restaurante_id = r.id
      where r.id = any($1::uuid[])
      order by r.id`,
    [`{${RESERVAS_INGESTAO.map((reserva) => reserva.restauranteId).join(",")}}`]
  );
  const corretas =
    verificacao.rows.length === RESERVAS_INGESTAO.length &&
    verificacao.rows.every((linha) =>
      RESERVAS_INGESTAO.some(
        (reserva) =>
          reserva.restauranteId === linha.restaurante_id &&
          reserva.slug === linha.slug &&
          reserva.restauranteId === linha.token_restaurante_id
      )
    );
  if (!corretas)
    throw new Error("As associações das reservas de ingestão não conferem.");
}

export async function prepararIngestao(
  opcoes: OpcoesPrepararIngestao
): Promise<{ quantidadeDeReservas: number }> {
  validarAmbienteBenchmark({ httpUrl: opcoes.httpUrl, dbUrl: opcoes.dbUrl });
  const caminhoConfig = await validarCaminhoConfiguracao(
    opcoes.caminhoConfig ?? CAMINHO_CONFIG_PADRAO
  );
  const cliente = (opcoes.criarCliente ?? criarClientePadrao)(opcoes.dbUrl);
  const validarBanco = opcoes.validarBanco ?? validarBancoPadrao;
  const validarCron = opcoes.validarCron ?? validarCronPadrao;
  const criarToken = opcoes.gerarToken ?? gerarToken;
  let iniciouTransacao = false;
  let criouConfiguracao = false;

  await cliente.connect();
  try {
    await validarBanco(cliente);
    await validarCron(cliente);
    await recusarColisao(cliente);
    const configuracao: ConfiguracaoIngestao = {
      reservas: RESERVAS_INGESTAO.map((reserva) => ({
        ...reserva,
        token: criarToken(),
      })),
    };
    await gravarConfiguracaoExclusiva(caminhoConfig, configuracao);
    criouConfiguracao = true;
    await cliente.query("begin");
    iniciouTransacao = true;
    await inserirReservas(cliente, configuracao);
    await cliente.query("commit");
    iniciouTransacao = false;
    return { quantidadeDeReservas: RESERVAS_INGESTAO.length };
  } catch (erro) {
    if (iniciouTransacao)
      await cliente.query("rollback").catch(() => undefined);
    if (criouConfiguracao)
      await rm(caminhoConfig.caminho, { force: true }).catch(() => undefined);
    throw erro;
  } finally {
    await cliente.end().catch(() => undefined);
  }
}

export async function main(): Promise<void> {
  const resultado = await prepararIngestao({
    httpUrl: process.env.BENCH_HTTP_URL ?? "",
    dbUrl: process.env.BENCH_DB_URL ?? "",
  });
  console.log(JSON.stringify({ preparado: "ingestao", ...resultado }));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    console.error(
      JSON.stringify({ erro: "Reservas locais de ingestão não preparadas." })
    );
    process.exitCode = 1;
  });
}
