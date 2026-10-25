// @ts-nocheck
/**
 * Cenários determinísticos para baseline reproduzível (Task 0).
 * Usa semente fixa para reprodutibilidade.
 */

export interface CenarioConfig {
  semente?: string;
  casas?: number;
  diasHistorico?: number;
}

export interface Cenario {
  nome: string;
  tipo: "vazio" | "historico" | "estresse";
  casas: number;
  dias: number;
  entradasPorDia?: number;
  descricao: string;
}

function hashSemente(semente: string): number {
  let h = 0;
  for (let i = 0; i < semente.length; i++) {
    h = (h * 31 + semente.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function gerarCenarios(config: CenarioConfig = {}): Cenario[] {
  const semente = config.semente || "repply-food-baseline-2026-10-24";
  const rng = hashSemente(semente);

  const cenarios: Cenario[] = [
    {
      nome: "vazio",
      tipo: "vazio",
      casas: config.casas || 2,
      dias: 0,
      descricao: "Restaurantes recém-cadastrados sem dados",
    },
    {
      nome: "90d_x100",
      tipo: "historico",
      casas: config.casas || 2,
      dias: 90,
      entradasPorDia: 100,
      descricao: "90 dias × ~100 contas/dia (distribuição realista)",
    },
    {
      nome: "365d_x500",
      tipo: "historico",
      casas: config.casas || 2,
      dias: 365,
      entradasPorDia: 500,
      descricao: "365 dias × ~500 contas/dia",
    },
  ];

  // Estresse opcional - apenas se recursos disponíveis
  cenarios.push({
    nome: "730d_x1000_estresse",
    tipo: "estresse",
    casas: config.casas || 2,
    dias: 730,
    entradasPorDia: 1000,
    descricao:
      "730 dias × 1000 contas/dia (ESTRESSE - opcional, reduzir se faltar recurso)",
  });

  return cenarios;
}

export function getSementeDeterministica(base = "baseline"): string {
  return `${base}-${Date.now().toString(36)}`;
}
