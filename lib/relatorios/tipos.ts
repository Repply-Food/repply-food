import type { Relatorio } from "@/lib/validators/relatorios";
import type { z } from "zod";
import type {
  coberturaSchema,
  linhaAuditoriaSaidaSchema,
  linhaCaixaSaidaSchema,
  linhaComissaoSaidaSchema,
  linhaFinanceiroSaidaSchema,
  linhaNotaSaidaSchema,
  linhaProdutosSaidaSchema,
  resultadoSchemas,
  resumoAuditoriaSchema,
  resumoCaixaSchema,
  resumoComissaoSchema,
  resumoFinanceiroSchema,
  resumoNotasSchema,
  resumoProdutosSchema,
} from "./schemas-saida";

export type FiltrosRelatorio = {
  inicio: string;
  fim: string;
  fonte: "historico" | "online";
  pdv?: string;
  grupo?: string;
  garcom?: string;
  mesaDe?: number;
  mesaAte?: number;
  operador?: string;
  tipo?: string;
  categoria?: string;
  cliente?: string;
};
export type ConsultaRelatorio = {
  filtros: FiltrosRelatorio;
  pagina: number;
  revisao?: string;
};
export type Cobertura = z.infer<typeof coberturaSchema>;
export type ResultadoRelatorio<L, R> = {
  situacao: "sem_dados" | "parcial" | "completo";
  revisao: string;
  cobertura: Cobertura;
  linhas: L[];
  resumo: R;
  paginacao: { pagina: number; tamanho: number; totalLinhas: number };
};
export type LinhaProdutos = z.infer<typeof linhaProdutosSaidaSchema>;
export type LinhaComissao = z.infer<typeof linhaComissaoSaidaSchema>;
export type LinhaCaixa = z.infer<typeof linhaCaixaSaidaSchema>;
export type LinhaAuditoria = z.infer<typeof linhaAuditoriaSaidaSchema>;
export type LinhaNota = z.infer<typeof linhaNotaSaidaSchema>;
export type LinhaFinanceiro = z.infer<typeof linhaFinanceiroSaidaSchema>;
export type ResumoProdutos = z.infer<typeof resumoProdutosSchema>;
export type ResumoComissao = z.infer<typeof resumoComissaoSchema>;
export type ResumoCaixa = z.infer<typeof resumoCaixaSchema>;
export type ResumoAuditoria = z.infer<typeof resumoAuditoriaSchema>;
export type ResumoNotas = z.infer<typeof resumoNotasSchema>;
export type ResumoFinanceiro = z.infer<typeof resumoFinanceiroSchema>;
export type ResultadosPorRelatorio = {
  [R in Relatorio]: z.infer<(typeof resultadoSchemas)[R]>;
};
export type ResultadoDoRelatorio<R extends Relatorio> =
  ResultadosPorRelatorio[R];
