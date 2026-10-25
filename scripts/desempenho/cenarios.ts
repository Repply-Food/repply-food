/**
 * Cenários determinísticos para baseline reproduzível (Task 0).
 * Sem RNG, sem Date.now.
 */

export interface CenarioConfig {
  casas?: number;
  semente?: number;
}

export interface Cenario {
  nome: string;
  tipo: "vazio" | "historico" | "estresse";
  casas: number;
  dias: number;
  entradasPorDia?: number;
  descricao: string;
  semente: number;
}

export const SEMENTE_CENARIO = 20261024;

export function gerarCenarios(config: CenarioConfig = {}): Cenario[] {
  const casas = config.casas ?? 2;
  const semente = config.semente ?? SEMENTE_CENARIO;

  const cenarios: Cenario[] = [
    {
      nome: "vazio",
      tipo: "vazio",
      casas,
      dias: 0,
      descricao: "Restaurantes recém-cadastrados sem dados (cenário sintético)",
      semente,
    },
    {
      nome: "90d_x100",
      tipo: "historico",
      casas,
      dias: 90,
      entradasPorDia: 100,
      descricao:
        "90 dias × ~100 contas/dia (cenário sintético, parâmetros projetados - não é medição real)",
      semente,
    },
    {
      nome: "365d_x500",
      tipo: "historico",
      casas,
      dias: 365,
      entradasPorDia: 500,
      descricao:
        "365 dias × ~500 contas/dia (cenário sintético, parâmetros projetados - não é medição real)",
      semente,
    },
    {
      nome: "730d_x1000_estresse",
      tipo: "estresse",
      casas,
      dias: 730,
      entradasPorDia: 1000,
      descricao:
        "730 dias × 1000 contas/dia (cenário sintético ESTRESSE - opcional, reduzir se faltar recurso; não é medição real)",
      semente,
    },
  ];

  return cenarios;
}
