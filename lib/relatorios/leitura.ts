import "server-only";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import type { Relatorio } from "@/lib/validators/relatorios";
import { parseConsulta, serializarConsulta } from "./filtros";
import { resultadoSchemas } from "./schemas-saida";
import type { ConsultaRelatorio, ResultadoDoRelatorio } from "./tipos";

export type CodigoErroRelatorio = "dados_alterados" | "filtro_indisponivel";

/** Erros que a tela pode tratar separadamente. */
export class ErroRelatorio extends Error {
  constructor(readonly codigo: CodigoErroRelatorio) {
    super(codigo);
    this.name = "ErroRelatorio";
  }
}

type RespostaRpc = {
  data: unknown;
  error: { message: string; code?: string } | null;
};
type ChamadaRpcRelatorio = {
  (
    nome: "consultar_relatorio",
    args: {
      p_restaurante_id: string;
      p_relatorio: Relatorio;
      p_filtros: ConsultaRelatorio["filtros"];
      p_pagina: number;
      p_tamanho: number;
      p_revisao: string | null;
    }
  ): PromiseLike<RespostaRpc>;
  (
    nome: "opcoes_relatorio",
    args: {
      p_restaurante_id: string;
      p_relatorio: Relatorio;
      p_filtros: ConsultaRelatorio["filtros"];
      p_dimensao: string;
      p_busca: string;
      p_pagina: number;
    }
  ): PromiseLike<RespostaRpc>;
};

/**
 * Os tipos gerados ainda não têm essas duas RPCs. Esta fronteira só amplia o
 * nome/argumentos de chamada; o retorno continua unknown até validação Zod.
 */
export function rpcRelatorios(
  cliente: Awaited<ReturnType<typeof createClient>>
) {
  return cliente.rpc.bind(cliente) as unknown as ChamadaRpcRelatorio;
}

export function erroDaRpc(mensagem: string): ErroRelatorio | Error {
  if (mensagem === "dados_alterados" || mensagem === "filtro_indisponivel")
    return new ErroRelatorio(mensagem);
  return new Error("falha_leitura_relatorios");
}

export function falhaLeitura(causa?: unknown): never {
  if (causa instanceof ErroRelatorio) throw causa;
  logError("falha_leitura_relatorios");
  throw new Error("falha_leitura_relatorios");
}

export function consultaValidada(
  relatorio: Relatorio,
  consulta: ConsultaRelatorio
): ConsultaRelatorio {
  return parseConsulta(
    relatorio,
    new URLSearchParams(serializarConsulta(consulta))
  );
}

export async function obterRelatorio<R extends Relatorio>(
  casaId: string,
  relatorio: R,
  consulta: ConsultaRelatorio,
  tamanho = 50
): Promise<ResultadoDoRelatorio<R>> {
  try {
    if (!Number.isInteger(tamanho) || tamanho < 1 || tamanho > 100)
      throw new Error("consulta_invalida");
    const validada = consultaValidada(relatorio, consulta);
    const cliente = await createClient();
    const { data, error } = await rpcRelatorios(cliente)(
      "consultar_relatorio",
      {
        p_restaurante_id: casaId,
        p_relatorio: relatorio,
        p_filtros: validada.filtros,
        p_pagina: validada.pagina,
        p_tamanho: tamanho,
        p_revisao: validada.revisao ?? null,
      }
    );
    if (error) throw erroDaRpc(error.message);
    // O schema selecionado pelo mesmo slug corresponde ao tipo mapeado de R.
    // TS não preserva essa correlação ao indexar o mapa de schemas.
    return resultadoSchemas[relatorio].parse(data) as ResultadoDoRelatorio<R>;
  } catch (erro) {
    return falhaLeitura(erro);
  }
}
