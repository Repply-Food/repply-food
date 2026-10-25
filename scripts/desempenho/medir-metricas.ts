import { gerarCenarios } from "./cenarios";
// @ts-nocheck
/**
 * Medidor de métricas para baseline reproduzível (Task 0).
 *
 * IMPORTANTE: Este script NÃO faz medições reais se o serviço local
 * estiver indisponível. O baseline deve ficar BLOQUEADO com justificativa.
 *
 * Reutiliza helpers existentes e respeita as travas contra nuvem.
 */
import { validarAmbienteBenchmark } from "./trava-nuvem";

export interface OpcoesMedicao {
  httpUrl: string;
  dbUrl: string;
  aquecimentos?: number;
  amostras?: number;
  semente?: string;
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
  bloqueado?: boolean;
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

  const cenarios = gerarCenarios({ semente: opcoes.semente });

  const resultado: BaselineResultado = {
    commit: process.env.GIT_COMMIT || "desconhecido",
    timestamp: new Date().toISOString(),
    ambiente: {
      node: process.version,
      platform: process.platform,
      httpUrl: opcoes.httpUrl,
      dbUrl: "[REDACTED]",
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
        "SERVICO_LOCAL_INDISPONIVEL - baseline não medido nesta execução",
    })),
    bloqueado: true,
    motivoBloqueio:
      "Supabase local não disponível ou não inicializado. Não foi possível coletar métricas reais.",
  };

  return resultado;
}

if (require.main === module) {
  console.log(
    JSON.stringify(
      { erro: "Execute via API programática. Este script apenas estrutura." },
      null,
      2
    )
  );
}
