export {
  fotografiaSchema,
  pedidoRelatoriosSchema,
  RELATORIOS,
  type Fotografia,
  type Manifesto,
  type PedidoRelatorios,
  type Relatorio,
} from "../../supabase/functions/_shared/relatorios/schemas";

import { pedidoRelatoriosSchema } from "../../supabase/functions/_shared/relatorios/schemas";

export function validarPedidoRelatorios(entrada: unknown) {
  return pedidoRelatoriosSchema.safeParse(entrada);
}

export type {
  LinhaAuditoria,
  LinhaCaixa,
  LinhaComissao,
  LinhaFinanceiro,
  LinhaNota,
  LinhaProdutos,
} from "../../supabase/functions/_shared/scc/schemas.ts";
