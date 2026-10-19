import "server-only";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { montarDadosDoHoje } from "./montar-hoje";
import type { DadosDoHoje } from "./tipos";

/** Falha de leitura vira a tela de erro, nunca número errado nem lista vazia. */
function falhou(): never {
  logError("falha_metricas_hoje");
  throw new Error("falha_leitura_hoje");
}

/**
 * Os números da tela "Hoje": uma chamada a cada função SQL `metrica_*`, todas
 * com o mesmo "agora", em paralelo. Aqui não se calcula nada (CLAUDE.md §5).
 *
 * O `restauranteId` tem de vir já conferido pela página (`exigirCasa`); a RLS de
 * `entradas` ainda protege o resto. O fuso é tratado dentro das funções SQL, por
 * `dia_operacao_de`. `limiteEsquecida` é o `limite_conta_esquecida` da casa
 * (interval em texto, ex.: "04:00:00").
 */
export async function obterHoje(
  restauranteId: string,
  limiteEsquecida: string
): Promise<DadosDoHoje> {
  const supabase = await createClient();
  const agora = new Date().toISOString();

  const [fat, cmp, mesas, curva, esquecidas, meta] = await Promise.all([
    supabase.rpc("metrica_faturamento_do_dia", {
      p_restaurante_id: restauranteId,
      p_ate: agora,
    }),
    supabase.rpc("metrica_comparacao_do_dia", {
      p_restaurante_id: restauranteId,
      p_agora: agora,
    }),
    supabase.rpc("metrica_mesas_abertas", {
      p_restaurante_id: restauranteId,
      p_agora: agora,
    }),
    supabase.rpc("metrica_curva_do_dia", {
      p_restaurante_id: restauranteId,
      p_agora: agora,
    }),
    supabase.rpc("metrica_contas_esquecidas", {
      p_restaurante_id: restauranteId,
      p_agora: agora,
      p_limite: limiteEsquecida,
    }),
    supabase.rpc("metrica_meta_do_mes", {
      p_restaurante_id: restauranteId,
      p_agora: agora,
    }),
  ]);

  if (
    fat.error ||
    cmp.error ||
    mesas.error ||
    curva.error ||
    esquecidas.error ||
    meta.error
  ) {
    falhou();
  }

  try {
    return montarDadosDoHoje({
      faturamento: fat.data,
      comparacao: cmp.data,
      mesasAbertas: mesas.data,
      curva: curva.data,
      contasEsquecidas: esquecidas.data,
      meta: meta.data,
    });
  } catch {
    // Uma função que devia devolver 1 linha e não devolveu: contrato quebrado.
    falhou();
  }
}
