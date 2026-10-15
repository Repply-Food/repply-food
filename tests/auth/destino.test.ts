import { describe, expect, it } from "vitest";
import {
  destinoDepoisDeEntrar,
  podeTrocarDeCasa,
} from "../../lib/auth/destino";

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

describe("trocar de casa (D-58)", () => {
  it("aparece para quem tem duas ou mais casas ativas", () => {
    expect(
      podeTrocarDeCasa({ ehAdmin: false, casas: [casa("a"), casa("b")] })
    ).toBe(true);
  });

  it("não aparece com uma ativa e outra suspensa", () => {
    expect(
      podeTrocarDeCasa({
        ehAdmin: false,
        casas: [casa("a"), casa("b", "suspenso")],
      })
    ).toBe(false);
  });

  it("não aparece para o admin (ele troca pelo admin)", () => {
    expect(
      podeTrocarDeCasa({ ehAdmin: true, casas: [casa("a"), casa("b")] })
    ).toBe(false);
  });
});
