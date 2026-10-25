export function validarEnderecoLocalBenchmark(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (parsed.username || parsed.password) return false;
    if (parsed.port !== "55421") return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "127.0.0.1" || host === "::1") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function validarPostgresLocalBenchmark(connStr: string): boolean {
  if (!connStr) return false;
  try {
    if (
      !connStr.startsWith("postgres://") &&
      !connStr.startsWith("postgresql://")
    ) {
      return false;
    }
    const urlFormatada = connStr.startsWith("postgres://")
      ? connStr.replace("postgres://", "http://")
      : connStr.replace("postgresql://", "http://");

    const parsed = new URL(urlFormatada);
    if (parsed.port !== "55422") return false;
    if (parsed.search || parsed.hash) return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "127.0.0.1" || host === "::1") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export type ValidacaoAmbienteOpcoes = {
  httpUrl: string;
  dbUrl: string;
};

export const MARCADOR_BANCO_DESCARTAVEL = "repply-food-perf-20261025-55422";

type ClienteMarcador = {
  query: (
    texto: string,
    valores: string[]
  ) => Promise<{ rows: Array<{ marcador: string }> }>;
};

export async function validarBancoDescartavel(
  cliente: ClienteMarcador
): Promise<void> {
  try {
    const resultado = await cliente.query(
      "select marcador from public.benchmark_isolation_guard where marcador = $1",
      [MARCADOR_BANCO_DESCARTAVEL]
    );
    if (resultado.rows.length !== 1) throw new Error("marcador ausente");
  } catch {
    throw new Error(
      "Benchmark bloqueado: banco sem marcador da instância descartável autorizada."
    );
  }
}

type ClienteCron = {
  query: (
    texto: string
  ) => Promise<{ rows: Array<{ ativos: string | number }> }>;
};

export async function validarJobsCronInativos(
  cliente: ClienteCron
): Promise<void> {
  try {
    const resultado = await cliente.query(
      "select count(*)::text as ativos from cron.job where active"
    );
    if (Number(resultado.rows[0]?.ativos) !== 0) {
      throw new Error("cron ativo");
    }
  } catch {
    throw new Error(
      "Benchmark bloqueado: não foi possível confirmar que os jobs cron estão inativos."
    );
  }
}

export function validarAmbienteBenchmark(
  opcoes: ValidacaoAmbienteOpcoes
): void {
  const { httpUrl, dbUrl } = opcoes;

  if (!httpUrl || !validarEnderecoLocalBenchmark(httpUrl)) {
    throw new Error(
      "[Benchmark Trava Nuvem] Endpoint HTTP remoto ou invalido recusado. O benchmark aceita APENAS IPs de loopback literais (127.0.0.1/[::1]) na porta isolada 55421. Excecoes sao proibidas."
    );
  }

  if (!dbUrl || !validarPostgresLocalBenchmark(dbUrl)) {
    throw new Error(
      "[Benchmark Trava Nuvem] Conexao Postgres remota ou invalida recusada. O benchmark aceita APENAS IPs de loopback literais (127.0.0.1/[::1]) na porta isolada 55422. Excecoes sao proibidas."
    );
  }
}
