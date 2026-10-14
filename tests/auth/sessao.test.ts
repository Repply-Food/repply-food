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

function entrou(appMetadata: Record<string, unknown>, admin: boolean) {
  getUser.mockResolvedValue({
    data: { user: { id: "u1", email: "d@x.com", app_metadata: appMetadata } },
  });
  ehAdmin.mockReturnValue(admin);
  casas.mockReturnValue([CASA]);
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
});
