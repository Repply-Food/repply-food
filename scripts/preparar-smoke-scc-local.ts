import { pathToFileURL } from "node:url";
import { Client, type ClientConfig } from "pg";
import { gerarToken, hashDoToken, prefixoDoToken } from "../lib/admin/token";
import { ACESSO_LOCAL } from "./acesso-local";

type Conexao = {
  query: (
    sql: string,
    parametros?: string[]
  ) => Promise<{ rows: { id?: string }[]; rowCount: number | null }>;
  end: () => Promise<void>;
};
type Conectar = (config: ClientConfig) => Promise<Conexao>;

async function conectarBanco(config: ClientConfig): Promise<Conexao> {
  const cliente = new Client(config);
  await cliente.connect();
  return {
    query: async (sql, parametros) => {
      const resultado = await cliente.query<{ id?: string }>(sql, parametros);
      return { rows: resultado.rows, rowCount: resultado.rowCount };
    },
    end: () => cliente.end(),
  };
}

function configLocal(destino: string): ClientConfig {
  try {
    const url = new URL(destino);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.href.includes("?") ||
      url.href.includes("#") ||
      !url.username ||
      !url.pathname.slice(1) ||
      url.pathname.slice(1).includes("/")
    )
      throw new Error();
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!/^[A-Za-z0-9_-]+$/.test(database)) throw new Error();
    return {
      host:
        url.hostname === "localhost"
          ? "127.0.0.1"
          : url.hostname.replace(/^\[|\]$/g, ""),
      port: url.port ? Number(url.port) : 5432,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database,
      ssl: false,
      connectionTimeoutMillis: 5000,
    };
  } catch {
    throw new Error(
      "Configure uma URL de banco local de loopback, sem parâmetros."
    );
  }
}

class CasaExistente extends Error {
  constructor() {
    super(
      "A casa dedicada smoke-scc-local já existe; nenhum dado foi alterado."
    );
  }
}

export async function prepararSmokeLocal(
  args: string[],
  ambiente: Record<string, string | undefined> = process.env,
  conectar: Conectar = conectarBanco
): Promise<{
  slug: string;
  token: string;
  donoVinculado: boolean;
  adminDisponivel: boolean;
}> {
  if (args.length) throw new Error("Este comando não aceita argumentos.");
  const config = configLocal(ambiente.RF_SMOKE_DATABASE_URL ?? "");
  const slug = "smoke-scc-local";
  const token = gerarToken();
  let conexao: Conexao | undefined;
  try {
    conexao = await conectar(config);
    await conexao.query("begin");
    const existente = await conexao.query(
      "select id from public.restaurantes where slug = $1",
      [slug]
    );
    if (existente.rows.length) throw new CasaExistente();
    const dono = await conexao.query(
      "select id from auth.users where lower(email) = lower($1)",
      [ACESSO_LOCAL.dono.email]
    );
    const admin = await conexao.query(
      "select u.id from auth.users u join public.admins_repply a on a.user_id = u.id where lower(u.email) = lower($1)",
      [ACESSO_LOCAL.admin.email]
    );
    const casa = await conexao.query(
      "insert into public.restaurantes (slug, nome) values ($1, $2) on conflict (slug) do nothing returning id",
      [slug, "Casa de Smoke SCC Local"]
    );
    const id = casa.rows[0]?.id;
    if (casa.rowCount === 0) throw new CasaExistente();
    if (casa.rowCount !== 1 || !id) throw new Error();
    const registro = await conexao.query(
      "insert into public.tokens_envio (restaurante_id, hash, prefixo) values ($1, $2, $3)",
      [id, hashDoToken(token), prefixoDoToken(token)]
    );
    if (registro.rowCount !== 1) throw new Error();
    const donoId = dono.rows[0]?.id;
    if (donoId) {
      const acesso = await conexao.query(
        "insert into public.acessos (user_id, restaurante_id) values ($1, $2)",
        [donoId, id]
      );
      if (acesso.rowCount !== 1) throw new Error();
    }
    await conexao.query("commit");
    return {
      slug,
      token,
      donoVinculado: Boolean(donoId),
      adminDisponivel: Boolean(admin.rows[0]?.id),
    };
  } catch (erro) {
    if (conexao) {
      try {
        await conexao.query("rollback");
      } catch {
        /* falha de conexão */
      }
    }
    if (erro instanceof CasaExistente) throw erro;
    throw new Error("Não foi possível preparar a casa de smoke local.");
  } finally {
    if (conexao) {
      try {
        await conexao.end();
      } catch {
        /* falha de conexão */
      }
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const resultado = await prepararSmokeLocal(process.argv.slice(2));
    console.log(
      `Casa local: ${resultado.slug}\nToken local (mostrado uma vez): ${resultado.token}`
    );
    if (!resultado.donoVinculado || !resultado.adminDisponivel)
      console.log(
        "Contas locais ausentes ou sem acesso. Veja docs/integracao-scc/smoke-scc-local-preparacao.md para conceder acesso com segurança."
      );
  } catch (erro) {
    console.error(
      erro instanceof Error
        ? erro.message
        : "Não foi possível preparar a casa de smoke local."
    );
    process.exitCode = 1;
  }
}
