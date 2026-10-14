// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, ehAdmin, casas } = vi.hoisted(() => ({
  getUser: vi.fn(),
  ehAdmin: vi.fn(),
  casas: vi.fn(),
}));

vi.mock("server-only", () => ({}));
// O redirect de verdade interrompe a função lançando um erro; o dublê faz igual.
vi.mock("next/navigation", () => ({
  redirect: (para: string) => {
    throw new Error(`REDIRECT:${para}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc: async () => ({ data: ehAdmin() }),
    from: () => ({
      select: () => ({ order: async () => ({ data: casas() }) }),
    }),
  }),
}));

import { exigirAdmin, exigirCasa } from "@/lib/auth/sessao";

const CASA = {
  id: "c1",
  slug: "casa-x",
  nome: "Casa X",
  situacao: "ativo",
  fuso: "America/Sao_Paulo",
};

function entrou(
  appMetadata: Record<string, unknown>,
  admin: boolean,
  daConta: unknown[] = [CASA]
) {
  getUser.mockResolvedValue({
    data: { user: { id: "u1", email: "d@x.com", app_metadata: appMetadata } },
  });
  ehAdmin.mockReturnValue(admin);
  casas.mockReturnValue(daConta);
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
    entrou({}, true);
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

  it("casa que a conta enxerga abre e é devolvida", async () => {
    entrou({}, false);
    const { casa } = await exigirCasa("casa-x");
    expect(casa.slug).toBe("casa-x");
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
    entrou({}, true, [{ ...CASA, situacao: "suspenso" }]);
    const { casa } = await exigirCasa("casa-x");
    expect(casa.slug).toBe("casa-x");
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
