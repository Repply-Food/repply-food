import { describe, expect, it } from "vitest";
import { mensagemDoErroDeAuth } from "../../lib/auth/erros";

describe("mensagens de erro do login", () => {
  it.each([
    ["same_password", "A nova senha precisa ser diferente da atual."],
    ["weak_password", "A senha precisa ter pelo menos 8 caracteres."],
    [
      "over_email_send_rate_limit",
      "Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.",
    ],
    [
      "over_request_rate_limit",
      "Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.",
    ],
    [
      "qualquer_outro",
      "Não foi possível concluir agora. Tente de novo em instantes.",
    ],
  ])("%s", (code, mensagem) => {
    expect(mensagemDoErroDeAuth({ code })).toBe(mensagem);
  });
  it("sem erro conhecido, frase genérica do produto", () => {
    expect(mensagemDoErroDeAuth(null)).toBe(
      "Não foi possível concluir agora. Tente de novo em instantes."
    );
  });
});
