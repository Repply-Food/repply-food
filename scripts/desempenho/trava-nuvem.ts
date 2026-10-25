export function validarEnderecoLocalBenchmark(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "::1" ||
      host === "[::1]"
    );
  } catch {
    return false;
  }
}

export function validarPostgresLocalBenchmark(connStr: string): boolean {
  if (!connStr) return false;
  try {
    // Normalizar postgresql:// ou postgres:// para URL parser
    const urlFormatada = connStr.startsWith("postgres://")
      ? connStr.replace("postgres://", "http://")
      : connStr.startsWith("postgresql://")
        ? connStr.replace("postgresql://", "http://")
        : connStr;

    const parsed = new URL(urlFormatada);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "::1" ||
      host === "[::1]"
    );
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
      `[Benchmark Trava Nuvem] Endpoint HTTP remoto ou invalido recusado ('${httpUrl}'). O benchmark aceita APENAS endpoints locais (127.0.0.1, localhost, [::1]). Excecoes como PERMITIR_NUVEM_NO_DEV sao proibidas.`
    );
  }

  if (!dbUrl || !validarPostgresLocalBenchmark(dbUrl)) {
    throw new Error(
      `[Benchmark Trava Nuvem] Conexao Postgres remota ou invalida recusada (remoto: '${dbUrl}'). O benchmark aceita APENAS conexoes locais Postgres (127.0.0.1, localhost, [::1]). Excecoes sao proibidas.`
    );
  }
}
