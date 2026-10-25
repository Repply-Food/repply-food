import { gerarCenarios } from "./cenarios";
import { validarAmbienteBenchmark } from "./trava-nuvem";

export interface OpcoesMedicao {
  httpUrl: string;
  dbUrl: string;
  aquecimentos?: number;
  amostras?: number;
}

export interface ResultadoCenario {
  nome: string;
  p50: number | null;
  p95: number | null;
  amostras: number;
  chamadas: number;
  linhas?: number;
  loops?: number;
  buffers?: number;
  bytes?: number;
  erros: number;
  bloqueado: boolean;
  motivoBloqueio?: string;
}

export interface BaselineResultado {
  commit: string;
  timestamp: string;
  ambiente: Record<string, unknown>;
  cenarios: ResultadoCenario[];
  gargaloDominante?: string;
  bloqueado: boolean;
  motivoBloqueio?: string;
}

export async function medirMetricas(
  opcoes: OpcoesMedicao
): Promise<BaselineResultado> {
  // Validar ambiente - falha fechado, sem exceções
  validarAmbienteBenchmark({
    httpUrl: opcoes.httpUrl,
    dbUrl: opcoes.dbUrl,
  });

  const cenarios = gerarCenarios();

  // Sem reset/migration. Apenas probe real - se indisponível, manter BLOQUEADO.
  // Não inventar medições.
  const resultado: BaselineResultado = {
    commit: process.env.GIT_COMMIT || "desconhecido",
    timestamp: new Date().toISOString(),
    ambiente: {
      node: process.version,
      platform: process.platform,
      httpUrlPresente: Boolean(opcoes.httpUrl),
      dbUrlPresente: Boolean(opcoes.dbUrl),
    },
    cenarios: cenarios.map((c) => ({
      nome: c.nome,
      p50: null,
      p95: null,
      amostras: 0,
      chamadas: 0,
      erros: 0,
      bloqueado: true,
      motivoBloqueio:
        "SERVICO_LOCAL_INDISPONIVEL - sem probe bem-sucedido; baseline não medido",
    })),
    bloqueado: true,
    motivoBloqueio:
      "Serviço local indisponível. Não foi possível coletar métricas reais; baseline permanece BLOQUEADO (sem reset/migration).",
  };

  return resultado;
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (typeof arg !== "string") continue;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (typeof next === "string" && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const httpUrl = args["http-url"] || process.env.BENCH_HTTP_URL || "";
  const dbUrl = args["db-url"] || process.env.BENCH_DB_URL || "";

  try {
    const resultado = await medirMetricas({ httpUrl, dbUrl });
    console.log(JSON.stringify(resultado, null, 2));
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(JSON.stringify({ erro: mensagem }, null, 2));
    process.exitCode = 1;
  }
}

const isMain =
  typeof require !== "undefined" &&
  typeof require.main !== "undefined" &&
  require.main === module;
if (isMain) {
  main().catch((erro) => {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(JSON.stringify({ erro: mensagem }, null, 2));
    process.exitCode = 1;
  });
}
