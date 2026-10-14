/**
 * Leitura dos parâmetros da URL das telas de entrada.
 *
 * O Next entrega cada parâmetro como `string`, `string[]` (quando se repete,
 * como em `?next=a&next=b`) ou `undefined`. Quem chama `.startsWith` num
 * `string[]` derruba a página com erro 500, e a tela de entrada é pública.
 */

export type ParametroDaUrl = string | string[] | undefined;

/** O texto do parâmetro, ou `null` se ele não veio ou veio repetido. */
export function textoDoParametro(valor: ParametroDaUrl): string | null {
  return typeof valor === "string" ? valor : null;
}

const AVISOS_DA_ENTRADA: Readonly<Record<string, string>> = {
  link_invalido: "Este link não vale mais. Peça um novo em “Esqueci a senha”.",
};

/**
 * A frase do `?erro=` de `/entrar`. Só vale código que a tela conhece:
 * nomes herdados de `Object.prototype` (`__proto__`, `constructor`…) não
 * viram aviso.
 */
export function avisoDaEntrada(erro: string | null): string | undefined {
  if (erro === null || !Object.hasOwn(AVISOS_DA_ENTRADA, erro))
    return undefined;
  return AVISOS_DA_ENTRADA[erro];
}
