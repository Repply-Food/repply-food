import type { Client } from "pg";
import type { PedidoRelatorios } from "../../supabase/functions/_shared/relatorios/schemas";

/** Chama as RPCs reais que serão criadas na tarefa de ingestão. */
export async function publicarDireto(
  banco: Client,
  casa: string,
  pedido: PedidoRelatorios
): Promise<unknown> {
  const resultado =
    pedido.acao === "pagina"
      ? await banco.query(
          "select public.receber_pagina_relatorio($1::uuid,$2::jsonb) as resultado",
          [casa, JSON.stringify(pedido)]
        )
      : await banco.query(
          "select public.publicar_relatorio($1::uuid,$2::uuid) as resultado",
          [casa, pedido.carga_id]
        );
  return resultado.rows[0].resultado;
}
