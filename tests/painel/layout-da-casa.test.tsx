// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { exigirCasa, registrarAberturaDoPainel } = vi.hoisted(() => ({
  exigirCasa: vi.fn(),
  registrarAberturaDoPainel: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/r/casa-x/hoje" }));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/admin/registro", () => ({ registrarAberturaDoPainel }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  }),
}));

import LayoutCasa from "@/app/r/[slug]/layout";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  registrarAberturaDoPainel.mockResolvedValue(undefined);
});

const CASA = {
  id: "c1",
  slug: "casa-x",
  nome: "Casa X",
  situacao: "ativo",
  fuso: "America/Fortaleza",
};

function sessao(ehAdmin: boolean, casas: unknown[]) {
  return {
    userId: "u1",
    email: "x@y.com",
    ehAdmin,
    precisaTrocarSenha: false,
    casas,
  };
}

async function abrir() {
  render(
    await LayoutCasa({
      children: <p>conteúdo</p>,
      params: Promise.resolve({ slug: "casa-x" }),
    })
  );
}

describe("layout da casa", () => {
  it("o admin vê a faixa, e a abertura entra no histórico (D-59)", async () => {
    exigirCasa.mockResolvedValue({
      sessao: sessao(true, []),
      casa: CASA,
      modoAdmin: true,
    });
    await abrir();
    expect(
      screen.getByRole("region", { name: "Modo leitura do admin" })
    ).toBeTruthy();
    expect(registrarAberturaDoPainel).toHaveBeenCalledWith("c1");
    expect(
      screen.queryAllByRole("link", { name: "Trocar de casa" })
    ).toHaveLength(0);
  });

  it("o dono não vê a faixa e nada vai para o histórico", async () => {
    exigirCasa.mockResolvedValue({
      sessao: sessao(false, [CASA]),
      casa: CASA,
      modoAdmin: false,
    });
    await abrir();
    expect(
      screen.queryByRole("region", { name: "Modo leitura do admin" })
    ).toBeNull();
    expect(registrarAberturaDoPainel).not.toHaveBeenCalled();
  });

  it("o dono com duas casas ativas vê 'Trocar de casa'", async () => {
    exigirCasa.mockResolvedValue({
      sessao: sessao(false, [CASA, { ...CASA, id: "c2", slug: "casa-y" }]),
      casa: CASA,
      modoAdmin: false,
    });
    await abrir();
    expect(
      screen.getAllByRole("link", { name: "Trocar de casa" })
    ).toHaveLength(2);
  });
});
