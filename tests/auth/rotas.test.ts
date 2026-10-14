import { describe, expect, it } from "vitest";
import { decidirRota, ehArquivoEstatico } from "../../lib/auth/rotas";

const semUsuario = { temUsuario: false, precisaTrocarSenha: false };
const logado = { temUsuario: true, precisaTrocarSenha: false };
const primeiroAcesso = { temUsuario: true, precisaTrocarSenha: true };

describe("porteiro: para onde cada endereço leva", () => {
  it.each(["/entrar", "/esqueci-a-senha", "/auth/confirmar"])(
    "%s é público",
    (pathname) => {
      expect(decidirRota({ pathname, search: "", ...semUsuario })).toEqual({
        tipo: "segue",
      });
    }
  );

  it("sem login, endereço protegido vai para /entrar guardando o destino", () => {
    expect(
      decidirRota({
        pathname: "/r/bar-do-ze/resultados",
        search: "?aba=vendas",
        ...semUsuario,
      })
    ).toEqual({
      tipo: "redireciona",
      para: `/entrar?next=${encodeURIComponent("/r/bar-do-ze/resultados?aba=vendas")}`,
    });
  });

  it("sem login, a raiz vai para /entrar sem destino", () => {
    expect(decidirRota({ pathname: "/", search: "", ...semUsuario })).toEqual({
      tipo: "redireciona",
      para: "/entrar",
    });
  });

  it("logado segue", () => {
    expect(
      decidirRota({ pathname: "/r/bar-do-ze/hoje", search: "", ...logado })
    ).toEqual({
      tipo: "segue",
    });
  });

  it.each(["/r/bar-do-ze/hoje", "/entrar", "/admin", "/escolher-casa"])(
    "com troca de senha pendente, %s vai para /trocar-senha",
    (pathname) => {
      expect(decidirRota({ pathname, search: "", ...primeiroAcesso })).toEqual({
        tipo: "redireciona",
        para: "/trocar-senha",
      });
    }
  );

  it.each(["/trocar-senha", "/nova-senha", "/auth/confirmar"])(
    "com troca de senha pendente, %s segue",
    (pathname) => {
      expect(decidirRota({ pathname, search: "", ...primeiroAcesso })).toEqual({
        tipo: "segue",
      });
    }
  );

  it.each([
    ["/favicon.ico", true],
    ["/manifest.webmanifest", true],
    ["/marca/simbolo.svg", true],
    ["/_next/static/x.js", true],
    ["/entrar/truque.png", false],
    ["/r/bar-do-ze/hoje", false],
    ["/r/x.json", false],
  ])("%s é arquivo estático? %s", (pathname, esperado) => {
    expect(ehArquivoEstatico(pathname)).toBe(esperado);
  });

  it("arquivo estático segue mesmo sem login", () => {
    expect(
      decidirRota({ pathname: "/icon-192.png", search: "", ...semUsuario })
    ).toEqual({
      tipo: "segue",
    });
  });
});
