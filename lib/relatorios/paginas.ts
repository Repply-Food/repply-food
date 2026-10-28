import type { FiltrosRelatorio } from "./tipos";

export type ParametrosDeBusca = Record<string, string | string[] | undefined>;

export function parametrosComoUrl(entrada: ParametrosDeBusca): URLSearchParams {
  const parametros = new URLSearchParams();
  for (const [chave, valor] of Object.entries(entrada)) {
    if (typeof valor === "string") parametros.append(chave, valor);
    else if (Array.isArray(valor)) {
      for (const item of valor) parametros.append(chave, item);
    }
  }
  return parametros;
}

export function temFiltroAdicional(filtros: FiltrosRelatorio): boolean {
  return Object.entries(filtros).some(
    ([chave, valor]) =>
      chave !== "inicio" &&
      chave !== "fim" &&
      chave !== "fonte" &&
      valor !== undefined &&
      valor !== ""
  );
}
