"use server";

import { exigirCasa } from "@/lib/auth/sessao";
import { ErroRelatorio } from "@/lib/relatorios/leitura";
import { obterOpcoes } from "@/lib/relatorios/opcoes";
import type { FiltrosRelatorio } from "@/lib/relatorios/tipos";
import type { Relatorio } from "@/lib/validators/relatorios";
import { RELATORIOS } from "@/supabase/functions/_shared/relatorios/schemas";
import { z } from "zod";

export async function obterOpcoesAction(
  slug: string,
  relatorio: Relatorio,
  filtros: FiltrosRelatorio,
  dimensao: string,
  busca: string,
  pagina: number
) {
  const { casa } = await exigirCasa(slug);
  const relatorioValidado = z.enum(RELATORIOS).safeParse(relatorio);
  if (!relatorioValidado.success)
    return { ok: false as const, error: "filtro_indisponivel" };
  try {
    return {
      ok: true as const,
      data: await obterOpcoes(
        casa.id,
        relatorioValidado.data,
        filtros,
        dimensao,
        busca,
        pagina
      ),
    };
  } catch (erro) {
    if (erro instanceof ErroRelatorio)
      return { ok: false as const, error: erro.codigo };
    return { ok: false as const, error: "falha_leitura_relatorios" };
  }
}
