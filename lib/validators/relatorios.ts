export {
  fotografiaSchema,
  pedidoRelatoriosSchema,
  RELATORIOS,
  type Fotografia,
  type LinhaAuditoria,
  type LinhaCaixa,
  type LinhaComissao,
  type LinhaFinanceiro,
  type LinhaNota,
  type LinhaProdutos,
  type Manifesto,
  type PedidoRelatorios,
  type Relatorio,
} from "../../supabase/functions/_shared/relatorios/schemas";

import { pedidoRelatoriosSchema } from "../../supabase/functions/_shared/relatorios/schemas";

export function validarPedidoRelatorios(entrada: unknown) {
  return pedidoRelatoriosSchema.safeParse(entrada);
}
