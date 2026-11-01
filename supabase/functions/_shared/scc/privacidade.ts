import { CAMPOS_PESSOAIS } from "../campos-permitidos.ts";

export function sanitizarAntesDeValidar(bruto: unknown): unknown {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return bruto;
  const envelope = bruto as Record<string, unknown>;
  if (envelope.tipo_envio !== "entradas" || !Array.isArray(envelope.dados))
    return bruto;
  return {
    ...envelope,
    dados: envelope.dados.map((linha: unknown) => {
      if (!linha || typeof linha !== "object" || Array.isArray(linha))
        return linha;
      return Object.fromEntries(
        Object.entries(linha).filter(
          ([chave]) => !CAMPOS_PESSOAIS.includes(chave)
        )
      );
    }),
  };
}
