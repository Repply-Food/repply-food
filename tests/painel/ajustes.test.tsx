// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { exigirCasa, emailsDosLoginsDaCasa } = vi.hoisted(() => ({
  exigirCasa: vi.fn(),
  emailsDosLoginsDaCasa: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/admin/dados", () => ({ emailsDosLoginsDaCasa }));
vi.mock("@/lib/auth/actions", () => ({ sairAction: vi.fn() }));

import PaginaAjustes from "@/app/r/[slug]/ajustes/page";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const CASA = {
  id: "c1",
  slug: "casa-x",
  nome: "Casa X",
  situacao: "ativo",
  fuso: "America/Fortaleza",
};

async function abrir() {
  render(await PaginaAjustes({ params: Promise.resolve({ slug: "casa-x" }) }));
}

describe("Ajustes", () => {
  it("o dono vê o e-mail dele, trocar senha e sair", async () => {
    exigirCasa.mockResolvedValue({
      sessao: { email: "dono@exemplo.com", ehAdmin: false },
      casa: CASA,
      modoAdmin: false,
    });
    await abrir();
    expect(screen.getByText("dono@exemplo.com")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Trocar senha/ }).getAttribute("href")
    ).toBe("/trocar-senha?voltar=%2Fr%2Fcasa-x%2Fajustes");
    expect(screen.getByRole("button", { name: "Sair" })).toBeTruthy();
    expect(emailsDosLoginsDaCasa).not.toHaveBeenCalled();
  });

  it("o admin vê o login do cliente, com o caminho para o admin, e não as ações da conta (D-58)", async () => {
    exigirCasa.mockResolvedValue({
      sessao: { email: "admin@repply.local", ehAdmin: true },
      casa: CASA,
      modoAdmin: true,
    });
    emailsDosLoginsDaCasa.mockResolvedValue(["dono@exemplo.com"]);
    await abrir();
    const link = screen.getByRole("link", { name: /Login do cliente/ });
    expect(link.getAttribute("href")).toBe("/admin/restaurantes/c1");
    expect(link.textContent).toContain("dono@exemplo.com (ver no admin)");
    expect(screen.queryByText("admin@repply.local")).toBeNull();
    expect(screen.queryByRole("link", { name: /Trocar senha/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sair" })).toBeNull();
    expect(screen.getByRole("group", { name: "Tema" })).toBeTruthy();
  });

  it("casa ainda sem login: diz isso", async () => {
    exigirCasa.mockResolvedValue({
      sessao: { email: "admin@repply.local", ehAdmin: true },
      casa: CASA,
      modoAdmin: true,
    });
    emailsDosLoginsDaCasa.mockResolvedValue([]);
    await abrir();
    expect(
      screen.getByRole("link", { name: /Login do cliente/ }).textContent
    ).toContain("ainda não criado (ver no admin)");
  });
});
