/**
 * Cenários determinísticos para baseline reproduzível (Task 0).
 * Sem RNG não utilizado nem Date.now para configuração.
 */

export interface CenarioConfig {
  casas?: number;
}

export interface Cenario {
  nome: string;
  tipo: "vazio" | "historico" | "estresse";
  casas: number;
  dias: number;
  entradasPorDia?: number;
  descricao: string;
}

export function gerarCenarios(config: CenarioConfig = {}): Cenario[] {
  const casas = config.casas ?? 2;

  const cenarios: Cenario[] = [
    {
      nome: "vazio",
      tipo: "vazio",
      casas,
      dias: 0,
      descricao: "Restaurantes recém-cadastrados sem dados (cenário sintético)",
    },
    {
      nome: "90d_x100",
      tipo: "historico",
      casas,
      dias: 90,
      entradasPorDia: 100,
      descricao:
        "90 dias × ~100 contas/dia (cenário sintético, distribuição projetada - não é medição real)",
    },
    {
      nome: "365d_x500",
      tipo: "historico",
      casas,
      dias: 365,
      entradasPorDia: 500,
      descricao:
        "365 dias × ~500 contas/dia (cenário sintético, distribuição projetada - não é medição real)",
    },
  ];

  cenarios.push({
    nome: "730d_x1000_estresse",
    tipo: "estresse",
    casas,
    dias: 730,
    entradasPorDia: 1000,
    descricao:
      "730 dias × 1000 contas/dia (cenário sintético ESTRESSE - opcional, reduzir se faltar recurso; não é medição real)",
  });

  return cenarios;
}
