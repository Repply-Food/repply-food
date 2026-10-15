import { plural } from "./texto";

export type EnvioResumo = {
  id: number;
  recebidoEm: string;
  httpStatus: number;
  erro: string | null;
  recebidas: number | null;
  gravadas: number | null;
  inalteradas: number | null;
  removidas: number | null;
  versaoScc: string | null;
  camposDesconhecidos: string[];
};

export function envioOk(e: Pick<EnvioResumo, "httpStatus">): boolean {
  return e.httpStatus === 200;
}

/** "212 recebidas · 8 gravadas · 203 iguais · 1 removida". */
export function contagensDoEnvio(
  e: Pick<EnvioResumo, "recebidas" | "gravadas" | "inalteradas" | "removidas">
): string {
  return [
    plural(e.recebidas ?? 0, "recebida", "recebidas"),
    plural(e.gravadas ?? 0, "gravada", "gravadas"),
    plural(e.inalteradas ?? 0, "igual", "iguais"),
    plural(e.removidas ?? 0, "removida", "removidas"),
  ].join(" · ");
}

export function detalheDoEnvio(e: EnvioResumo): string {
  if (!envioOk(e)) return `${e.erro ?? "erro"} (${e.httpStatus})`;
  const contagens = contagensDoEnvio(e);
  return e.versaoScc ? `${contagens} · SCC ${e.versaoScc}` : contagens;
}

/** Campos fora do contrato que o SCC mandou (só o nome, D-51). */
export function camposNovosDoEnvio(
  e: Pick<EnvioResumo, "camposDesconhecidos">
): string | null {
  return e.camposDesconhecidos.length > 0
    ? `campos novos: ${e.camposDesconhecidos.join(", ")}`
    : null;
}
