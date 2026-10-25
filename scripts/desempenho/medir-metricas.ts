import { gerarCenarios } from "./cenarios.ts";
import { validarAmbienteBenchmark } from "./trava-nuvem.ts";

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

  // Sem reset/migration. Probe real - se indisponível, manter BLOQUEADO.
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
        "SERVICO_LOCAL_INDISPONIVEL_OU_SEM_PROBE - sem medição real; baseline permanece BLOQUEADO",
    })),
    bloqueado: true,
    motivoBloqueio:
      "Serviço local indisponível ou não autorizado a iniciar/resetar/migrar DB compartilhado. Nenhuma métrica foi inventada.",
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
  } catch {
    console.error(
      JSON.stringify(
        { erro: "[Benchmark] Falha na validação ou execução." },
        null,
        2
      )
    );
    process.exitCode = 1;
  }
}

const isESMMain =
  typeof import.meta !== "undefined" &&
  typeof import.meta.url === "string" &&
  typeof process !== "undefined" &&
  typeof process.argv?.[1] === "string" &&
  import.meta.url === `file://${process.argv[1]}`;

if (isESMMain) {
  main().catch(() => {
    console.error(
      JSON.stringify({ erro: "[Benchmark] Falha na execução." }, null, 2)
    );
    process.exitCode = 1;
  });
}

export { main };
