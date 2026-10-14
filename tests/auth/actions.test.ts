// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: os dublês precisam existir antes de o vi.mock (içado ao topo) rodar.
const { getUser, updateUser, cookieGet, updateUserById, senhaConfere } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    updateUser: vi.fn(),
    cookieGet: vi.fn(),
    updateUserById: vi.fn(),
    senhaConfere: vi.fn(),
  }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet, delete: vi.fn(), set: vi.fn() }),
  headers: async () => new Headers({ origin: "http://127.0.0.1:3000" }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser, updateUser, refreshSession: vi.fn(), signOut: vi.fn() },
    rpc: async () => ({ data: false }),
    from: () => ({
      select: () => ({
        order: async () => ({ data: [{ slug: "casa-x", situacao: "ativo" }] }),
      }),
    }),
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ auth: { admin: { updateUserById } } }),
}));
vi.mock("@/lib/auth/nucleo", async (original) => ({
  ...(await original<typeof import("@/lib/auth/nucleo")>()),
  senhaConfere,
}));

import { definirNovaSenhaAction, trocarSenhaAction } from "@/lib/auth/actions";

const novaSenha = { senha: "senha-nova-123", confirmacao: "senha-nova-123" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "segredo-de-teste");
  updateUser.mockResolvedValue({ error: null });
  updateUserById.mockResolvedValue({
    data: { user: { app_metadata: { precisa_trocar_senha: false } } },
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("as ações conferem o acesso por dentro, não só a página", () => {
  it("nova senha sem o cookie do e-mail não troca a senha", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "d@x.com", app_metadata: {} } },
    });
    cookieGet.mockReturnValue(undefined);
    const resultado = await definirNovaSenhaAction(novaSenha);
    expect(resultado.ok).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("troca voluntária com a senha atual errada não troca a senha", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "d@x.com", app_metadata: {} } },
    });
    senhaConfere.mockResolvedValue(false);
    const resultado = await trocarSenhaAction({
      senhaAtual: "errada-123",
      ...novaSenha,
    });
    expect(resultado).toEqual({
      ok: false,
      error: "A senha atual não confere.",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("primeiro acesso não pede a senha atual e o servidor tira o aviso", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "u1",
          email: "d@x.com",
          app_metadata: { precisa_trocar_senha: true },
        },
      },
    });
    const resultado = await trocarSenhaAction({ senhaAtual: "", ...novaSenha });
    expect(resultado).toEqual({
      ok: true,
      data: { destino: "/r/casa-x/hoje" },
    });
    expect(senhaConfere).not.toHaveBeenCalled();
    expect(updateUserById).toHaveBeenCalledWith("u1", {
      app_metadata: { precisa_trocar_senha: false },
    });
  });

  it("sem sessão, nada acontece", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const resultado = await trocarSenhaAction({ senhaAtual: "", ...novaSenha });
    expect(resultado.ok).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
