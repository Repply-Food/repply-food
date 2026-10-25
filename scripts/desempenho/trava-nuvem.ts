export function validarEnderecoLocalBenchmark(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
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
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
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

export function validarAmbienteBenchmark(
  opcoes: ValidacaoAmbienteOpcoes
): void {
  const { httpUrl, dbUrl } = opcoes;

  if (!httpUrl || !validarEnderecoLocalBenchmark(httpUrl)) {
    throw new Error(
      "[Benchmark Trava Nuvem] Endpoint HTTP remoto ou invalido recusado. O benchmark aceita APENAS endpoints HTTP(S) em loopback literal (127.0.0.1, localhost, [::1]). Excecoes sao proibidas."
    );
  }

  if (!dbUrl || !validarPostgresLocalBenchmark(dbUrl)) {
    throw new Error(
      "[Benchmark Trava Nuvem] Conexao Postgres remota ou invalida recusada. O benchmark aceita APENAS conexoes postgres/postgresql em loopback literal (127.0.0.1, localhost, [::1]). Excecoes sao proibidas."
    );
  }
}
