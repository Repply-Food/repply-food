// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type Filtros = Record<string, unknown>;

const { getUser, ehAdmin, casasDoLogin, casaPeloEndereco, logError } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    ehAdmin: vi.fn(),
    casasDoLogin: vi.fn(),
    casaPeloEndereco: vi.fn(),
    logError: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
// O redirect de verdade interrompe a função lançando um erro; o dublê faz igual.
vi.mock("next/navigation", () => ({
  redirect: (para: string) => {
    throw new Error(`REDIRECT:${para}`);
  },
}));
vi.mock("@/lib/logger", () => ({ logError }));
// Dublê do cliente do Supabase: guarda os filtros de cada consulta para o
// teste conferir o que foi pedido ao banco.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc: async () => ehAdmin(),
    from: (tabela: string) => {
      const filtros: Filtros = {};
      const consulta = {
        select: (colunas: string) => {
          filtros.select = colunas;
          return consulta;
        },
        eq: (coluna: string, valor: unknown) => {
          filtros[coluna] = valor;
          return consulta;
        },
        order: async () => casasDoLogin(tabela, filtros),
        maybeSingle: async () => casaPeloEndereco(tabela, filtros),
      };
      return consulta;
    },
  }),
}));

import { exigirAdmin, exigirCasa, obterSessao } from "@/lib/auth/sessao";

const CASA = {
  id: "c1",
  slug: "casa-x",
  nome: "Casa X",
  situacao: "ativo",
  fuso: "America/Sao_Paulo",
};
const FALHA_DE_REDE = { data: null, error: { code: "08006" } };

function entrou(
  appMetadata: Record<string, unknown>,
  admin: boolean,
  daConta: unknown[] = [CASA],
  peloEndereco: unknown = CASA
) {
  getUser.mockResolvedValue({
    data: { user: { id: "u1", email: "d@x.com", app_metadata: appMetadata } },
  });
  ehAdmin.mockReturnValue({ data: admin, error: null });
  casasDoLogin.mockReturnValue({ data: daConta, error: null });
  casaPeloEndereco.mockImplementation((_tabela: string, filtros: Filtros) => ({
    data: filtros.slug === "casa-x" ? peloEndereco : null,
    error: null,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("guardas de sessão", () => {
  it("admin com a troca de senha pendente é levado para trocar antes de entrar no admin", async () => {
    entrou({ precisa_trocar_senha: true }, true);
    await expect(exigirAdmin()).rejects.toThrow("REDIRECT:/trocar-senha");
  });

  it("admin sem pendência entra", async () => {
    entrou({}, true, []);
    const sessao = await exigirAdmin();
    expect(sessao.ehAdmin).toBe(true);
  });

  it("quem não é admin vai para o destino da própria casa", async () => {
    entrou({}, false);
    await expect(exigirAdmin()).rejects.toThrow("REDIRECT:/r/casa-x/hoje");
  });

  it("dono com a troca pendente é levado para trocar antes de ver a casa", async () => {
    entrou({ precisa_trocar_senha: true }, false);
    await expect(exigirCasa("casa-x")).rejects.toThrow(
      "REDIRECT:/trocar-senha"
    );
  });

  it("sem login, a casa manda para /entrar", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(exigirCasa("casa-x")).rejects.toThrow("REDIRECT:/entrar");
  });

  it("casa da conta abre, sem modo admin", async () => {
    entrou({}, false);
    const { casa, modoAdmin } = await exigirCasa("casa-x");
    expect(casa.slug).toBe("casa-x");
    expect(modoAdmin).toBe(false);
  });

  it("casa que não está entre as do login manda para o destino da conta, nunca devolve a casa", async () => {
    entrou({}, false);
    await expect(exigirCasa("casa-de-outro")).rejects.toThrow(
      "REDIRECT:/r/casa-x/hoje"
    );
  });

  it("conta com duas casas que pede uma terceira vai para a escolha da casa", async () => {
    entrou({}, false, [CASA, { ...CASA, id: "c2", slug: "casa-y" }]);
    await expect(exigirCasa("casa-de-outro")).rejects.toThrow(
      "REDIRECT:/escolher-casa"
    );
  });

  it("conta sem nenhuma casa que pede uma casa vai para o acesso pendente", async () => {
    entrou({}, false, []);
    await expect(exigirCasa("casa-x")).rejects.toThrow(
      "REDIRECT:/acesso-pendente"
    );
  });

  it("casa suspensa: o dono vai para o acesso pendente", async () => {
    entrou({}, false, [{ ...CASA, situacao: "suspenso" }]);
    await expect(exigirCasa("casa-x")).rejects.toThrow(
      "REDIRECT:/acesso-pendente"
    );
  });

  it("casa suspensa: o admin entra, para dar suporte", async () => {
    entrou({}, true, [], { ...CASA, situacao: "suspenso" });
    const { casa, modoAdmin } = await exigirCasa("casa-x");
    expect(casa.situacao).toBe("suspenso");
    expect(modoAdmin).toBe(true);
  });

  it("a troca de senha pendente vale antes de qualquer casa, até a que não existe", async () => {
    entrou({ precisa_trocar_senha: true }, false);
    await expect(exigirCasa("casa-de-outro")).rejects.toThrow(
      "REDIRECT:/trocar-senha"
    );
  });

  it("admin com a troca pendente também troca antes de abrir uma casa", async () => {
    entrou({ precisa_trocar_senha: true }, true);
    await expect(exigirCasa("casa-x")).rejects.toThrow(
      "REDIRECT:/trocar-senha"
    );
  });
});

describe("o admin não carrega todas as casas (pendência 43)", () => {
  it("a sessão lê só as casas ligadas ao login, para qualquer um", async () => {
    entrou({}, true, []);
    const sessao = await obterSessao();
    expect(sessao?.casas).toEqual([]);
    expect(casasDoLogin).toHaveBeenCalledWith(
      "restaurantes",
      expect.objectContaining({ "acessos.user_id": "u1" })
    );
  });

  it("o admin abre a casa pelo endereço, em modo admin", async () => {
    entrou({}, true, []);
    const { casa, modoAdmin } = await exigirCasa("casa-x");
    expect(casa.id).toBe("c1");
    expect(modoAdmin).toBe(true);
    expect(casaPeloEndereco).toHaveBeenCalledWith(
      "restaurantes",
      expect.objectContaining({ slug: "casa-x" })
    );
  });

  it("o admin que pede uma casa que não existe volta para o admin", async () => {
    entrou({}, true, []);
    await expect(exigirCasa("nao-existe")).rejects.toThrow("REDIRECT:/admin");
  });
});

describe("falha de leitura vira erro, não 'acesso pendente' (pendência 27)", () => {
  it("falha ao ler as casas do login", async () => {
    entrou({}, false);
    casasDoLogin.mockReturnValue(FALHA_DE_REDE);
    await expect(exigirCasa("casa-x")).rejects.toThrow("falha_leitura_sessao");
    expect(logError).toHaveBeenCalledWith("falha_leitura_sessao");
  });

  it("falha ao saber se é admin", async () => {
    entrou({}, false);
    ehAdmin.mockReturnValue(FALHA_DE_REDE);
    await expect(obterSessao()).rejects.toThrow("falha_leitura_sessao");
  });

  it("falha ao ler a casa que o admin pediu", async () => {
    entrou({}, true, []);
    casaPeloEndereco.mockReturnValue(FALHA_DE_REDE);
    await expect(exigirCasa("casa-x")).rejects.toThrow("falha_leitura_sessao");
  });
});
