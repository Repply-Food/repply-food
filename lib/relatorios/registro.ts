import type { Relatorio } from "@/lib/validators/relatorios";

export type FiltroAdicional =
  | "pdv"
  | "grupo"
  | "garcom"
  | "mesaDe"
  | "mesaAte"
  | "operador"
  | "tipo"
  | "categoria"
  | "cliente";
export const REGISTRO_RELATORIOS = {
  produtos: {
    slug: "produtos",
    titulo: "Produtos",
    descricao: "Vendas, quantidades e custos por produto.",
    filtros: ["pdv", "grupo", "garcom", "mesaDe", "mesaAte"],
  },
  comissao: {
    slug: "comissao",
    titulo: "Comissão",
    descricao: "Vendas elegíveis e comissão informada pela SCC.",
    filtros: ["operador"],
  },
  caixa: {
    slug: "caixa",
    titulo: "Caixa",
    descricao: "Créditos, débitos e saldo dos lançamentos.",
    filtros: ["operador", "tipo", "categoria"],
  },
  auditoria: {
    slug: "auditoria",
    titulo: "Auditoria",
    descricao: "Ocorrências e valores por tipo de evento.",
    filtros: ["operador", "tipo"],
  },
  "notas-assinadas": {
    slug: "notas-assinadas",
    titulo: "Notas assinadas",
    descricao: "Notas informadas para o movimento e código do cliente.",
    filtros: ["cliente"],
  },
  financeiro: {
    slug: "financeiro",
    titulo: "Financeiro",
    descricao: "Componentes, totais oficiais e público da casa.",
    filtros: [],
  },
} as const satisfies Record<
  Relatorio,
  {
    slug: Relatorio;
    titulo: string;
    descricao: string;
    filtros: readonly FiltroAdicional[];
  }
>;
