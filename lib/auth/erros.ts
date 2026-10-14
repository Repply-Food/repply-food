import { SENHA_MINIMA } from "./senha";

export const MENSAGEM_LOGIN_RECUSADO = "E-mail ou senha incorretos.";

/** Frase do produto pelo `code` do Supabase; nunca o texto cru do erro. */
export function mensagemDoErroDeAuth(
  erro: { code?: string | null } | null | undefined
): string {
  switch (erro?.code) {
    case "same_password":
      return "A nova senha precisa ser diferente da atual.";
    case "weak_password":
      return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.";
    default:
      return "Não foi possível concluir agora. Tente de novo em instantes.";
  }
}
