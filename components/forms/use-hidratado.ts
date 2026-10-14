import { useSyncExternalStore } from "react";

const semAssinatura = () => () => {};

/**
 * `false` no servidor e na hidratação; `true` assim que o navegador terminou de
 * carregar o JavaScript da página.
 *
 * Existe por causa do envio nativo: se o dono digita e aperta Enter antes de a
 * página carregar, o navegador envia o formulário sozinho e os campos vão para
 * o endereço (inclusive a senha, que acaba no histórico, no registro do
 * servidor e no Referer). Pela especificação do HTML, Enter num campo não envia
 * o formulário quando o botão de enviar está desabilitado; então os formulários
 * de entrada ligam o botão só quando este hook devolve `true`.
 *
 * Em navegação dentro do app (sem HTML do servidor para hidratar) o valor já
 * nasce `true`, então o botão não pisca desabilitado à toa.
 */
export function useHidratado(): boolean {
  return useSyncExternalStore(
    semAssinatura,
    () => true,
    () => false
  );
}
