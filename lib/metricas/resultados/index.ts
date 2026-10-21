import "server-only";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import type { FiltrosResultados } from "./filtros";
import { montarDadosDeResultados } from "./montar-resultados";
import type { DadosDeResultados } from "./tipos";

export async function obterResultados(
  restauranteId: string,
  filtros: FiltrosResultados
): Promise<DadosDeResultados> {
  try {
    const supabase = await createClient();
    const agora = new Date().toISOString();
    const parametros = {
      p_restaurante_id: restauranteId,
      p_inicio: filtros.inicio,
      p_fim: filtros.fim,
    };
    const [
      resumo,
      vendasDiarias,
      ocupacao,
      horas,
      mapa,
      turnos,
      equipe,
      descontos,
      meta,
    ] = await Promise.all([
      supabase.rpc("metrica_resultados_resumo", {
        ...parametros,
        p_comparacao: filtros.comparacao,
      }),
      supabase.rpc("metrica_resultados_vendas_diarias", parametros),
      supabase.rpc("metrica_resultados_ocupacao", parametros),
      supabase.rpc("metrica_resultados_horas", parametros),
      supabase.rpc("metrica_resultados_mapa_calor", parametros),
      supabase.rpc("metrica_resultados_turnos", parametros),
      supabase.rpc("metrica_resultados_equipe", parametros),
      supabase.rpc("metrica_resultados_descontos", parametros),
      filtros.atalho === "mes"
        ? supabase.rpc("metrica_meta_do_mes", {
            p_restaurante_id: restauranteId,
            p_agora: agora,
          })
        : Promise.resolve(null),
    ]);

    if (
      resumo.error ||
      vendasDiarias.error ||
      ocupacao.error ||
      horas.error ||
      mapa.error ||
      turnos.error ||
      equipe.error ||
      descontos.error ||
      meta?.error
    ) {
      throw new Error("falha_leitura_resultados");
    }

    return montarDadosDeResultados({
      resumo: resumo.data,
      vendasDiarias: vendasDiarias.data,
      ocupacao: ocupacao.data,
      horas: horas.data,
      mapa: mapa.data,
      turnos: turnos.data,
      equipe: equipe.data,
      descontos: descontos.data,
      meta: meta?.data ?? [],
    });
  } catch {
    logError("falha_metricas_resultados");
    throw new Error("falha_leitura_resultados");
  }
}
