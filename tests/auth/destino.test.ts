import { describe, expect, it } from "vitest";
import { destinoDepoisDeEntrar } from "../../lib/auth/destino";

const casa = (slug: string, situacao: "ativo" | "suspenso" = "ativo") => ({
  slug,
  situacao,
});

describe("para onde vai depois de entrar", () => {
  it("troca de senha pendente vem antes de tudo", () => {
    expect(
      destinoDepoisDeEntrar({
        precisaTrocarSenha: true,
        ehAdmin: true,
        restaurantes: [casa("a")],
      })
    ).toBe("/trocar-senha");
  });
  it("admin vai para o admin", () => {
    expect(
      destinoDepoisDeEntrar({
        precisaTrocarSenha: false,
        ehAdmin: true,
        restaurantes: [],
      })
    ).toBe("/admin");
  });
  it("uma casa ativa vai direto para o Hoje dela", () => {
    expect(
      destinoDepoisDeEntrar({
        precisaTrocarSenha: false,
        ehAdmin: false,
        restaurantes: [casa("bar-do-ze"), casa("velha", "suspenso")],
      })
    ).toBe("/r/bar-do-ze/hoje");
  });
  it("mais de uma casa ativa escolhe a casa (D-54)", () => {
    expect(
      destinoDepoisDeEntrar({
        precisaTrocarSenha: false,
        ehAdmin: false,
        restaurantes: [casa("a"), casa("b")],
      })
    ).toBe("/escolher-casa");
  });
  it.each([[[]], [[casa("x", "suspenso")]]])(
    "sem casa ativa vai para o acesso pendente",
    (restaurantes) => {
      expect(
        destinoDepoisDeEntrar({
          precisaTrocarSenha: false,
          ehAdmin: false,
          restaurantes,
        })
      ).toBe("/acesso-pendente");
    }
  );
});
