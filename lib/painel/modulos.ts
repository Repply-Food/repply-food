/**
 * Módulos OPCIONAIS da casa. Os módulos centrais do MVP (Hoje, Resultados,
 * Ajustes) estão sempre ligados e NÃO entram aqui. A lista `modulos` da casa
 * (coluna em `restaurantes`) guarda só os opcionais que o admin ligou.
 */
export const MODULOS_OPCIONAIS = ["mentor"] as const;
export type ModuloOpcional = (typeof MODULOS_OPCIONAIS)[number];

/** A casa tem o módulo opcional ligado? `modulos` vem SEMPRE da casa da sessão. */
export function casaTemModulo(
  modulos: readonly string[],
  modulo: ModuloOpcional
): boolean {
  return modulos.includes(modulo);
}
