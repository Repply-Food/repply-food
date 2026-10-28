import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Relatorio } from "@/lib/validators/relatorios";
import { z } from "zod";
import { consultaValidada } from "./leitura";
import {
  ErroRelatorio,
  erroDaRpc,
  falhaLeitura,
  rpcRelatorios,
} from "./leitura";
import type { FiltrosRelatorio } from "./tipos";

const opcoesSchema = z
  .object({
    opcoes: z.array(
      z.object({ codigo: z.string(), rotulo: z.string() }).strict()
    ),
    mais: z.boolean(),
  })
  .strict();

export type OpcoesRelatorio = z.infer<typeof opcoesSchema>;

const dimensoes: Record<Relatorio, readonly string[]> = {
  produtos: ["pdv", "grupo", "garcom"],
  comissao: ["operador"],
  caixa: ["operador", "tipo", "categoria"],
  auditoria: ["operador", "tipo"],
  "notas-assinadas": ["cliente"],
  financeiro: [],
};

export async function obterOpcoes(
  casaId: string,
  relatorio: Relatorio,
  filtros: FiltrosRelatorio,
  dimensao: string,
  busca: string,
  pagina: number
): Promise<OpcoesRelatorio> {
  try {
    if (
      !dimensoes[relatorio].includes(dimensao) ||
      busca.length > 80 ||
      !Number.isInteger(pagina) ||
      pagina < 1 ||
      pagina > 2_147_483_647
    )
      throw new ErroRelatorio("filtro_indisponivel");
    const filtrosValidados = consultaValidada(relatorio, {
      filtros,
      pagina: 1,
    }).filtros;
    const cliente = await createClient();
    const { data, error } = await rpcRelatorios(cliente)("opcoes_relatorio", {
      p_restaurante_id: casaId,
      p_relatorio: relatorio,
      p_filtros: filtrosValidados,
      p_dimensao: dimensao,
      p_busca: busca,
      p_pagina: pagina,
    });
    if (error) throw erroDaRpc(error.message);
    return opcoesSchema.parse(data);
  } catch (erro) {
    return falhaLeitura(erro);
  }
}
