// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O caminho do admin até as telas do mentor (dívida 67): o cartão "Mentor" na
// home do admin, que leva à cartilha, e a faixa de cima das duas telas, que as
// liga entre si. Antes só dava para chegar digitando o endereço.

const { exigirAdmin, listarRestaurantes } = vi.hoisted(() => ({
  exigirAdmin: vi.fn(),
  listarRestaurantes: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirAdmin }));
vi.mock("@/lib/admin/dados", () => ({ listarRestaurantes }));

import PaginaAdmin from "@/app/admin/page";
import { AtalhoDoMentor } from "@/components/admin/atalho-do-mentor";
import { ListaConversasDoMentor } from "@/components/admin/lista-conversas-do-mentor";
import { NavegacaoDoMentor } from "@/components/admin/navegacao-do-mentor";
import type { LinhaDaLista } from "@/lib/admin/lista";

const CASA: LinhaDaLista = {
  id: "bar",
  slug: "bar",
  nome: "Bar do Zé",
  situacao: "ativo",
  fuso: "America/Fortaleza",
  estado: "em_dia",
  ultimoEnvioOkEm: "2026-10-15T00:38:00Z",
  versaoScc: "5.2.1",
  demonstracao: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  exigirAdmin.mockResolvedValue({ email: "admin@repply.com.br" });
});
afterEach(cleanup);

describe("cartão do mentor na home do admin", () => {
  it("é um link rotulado 'Mentor' para o editor da cartilha, com a descrição", () => {
    render(<AtalhoDoMentor />);

    const link = screen.getByRole("link", { name: /^Mentor/ });
    expect(link.getAttribute("href")).toBe("/admin/mentor");
    expect(
      within(link).getByText(/cartilha e conversas dos donos/i)
    ).toBeTruthy();
  });

  it("fica ao lado da lista de restaurantes, sem tirar nada dela", async () => {
    listarRestaurantes.mockResolvedValue([CASA]);
    render(await PaginaAdmin());

    expect(
      screen.getByRole("heading", { level: 1, name: "Restaurantes" })
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "+ Cadastrar restaurante" })
        .getAttribute("href")
    ).toBe("/admin/restaurantes/novo");
    expect(
      screen.getByRole("link", { name: /^Mentor/ }).getAttribute("href")
    ).toBe("/admin/mentor");
  });

  it("aparece também sem restaurante nenhum (o admin chega ao mentor de qualquer jeito)", async () => {
    listarRestaurantes.mockResolvedValue([]);
    render(await PaginaAdmin());

    expect(
      screen.getByText("Nenhum restaurante cadastrado ainda.")
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /^Mentor/ }).getAttribute("href")
    ).toBe("/admin/mentor");
  });

  it("só aparece com o admin: sem ele a página nem monta", async () => {
    exigirAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(PaginaAdmin()).rejects.toThrow("NEXT_REDIRECT");
    expect(listarRestaurantes).not.toHaveBeenCalled();
  });
});

describe("faixa de cima das telas do mentor", () => {
  it("na cartilha: volta para os restaurantes e vai para as conversas", () => {
    render(<NavegacaoDoMentor atual="cartilha" />);

    const faixa = screen.getByRole("navigation", { name: "Mentor" });
    const links = within(faixa).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/admin",
      "/admin/mentor/conversas",
    ]);
    expect(links[1]?.textContent).toMatch(/Conversas do mentor/);
  });

  it("nas conversas: volta para os restaurantes e vai para a cartilha", () => {
    render(<NavegacaoDoMentor atual="conversas" />);

    const faixa = screen.getByRole("navigation", { name: "Mentor" });
    const links = within(faixa).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/admin",
      "/admin/mentor",
    ]);
    expect(links[1]?.textContent).toMatch(/Cartilha do mentor/);
  });

  it("os links têm 44 px de altura mínima (toque no celular)", () => {
    render(<NavegacaoDoMentor atual="cartilha" />);

    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("min-h-11");
    }
  });

  it("a lista de conversas traz a faixa, com o caminho de volta à cartilha", () => {
    render(
      <ListaConversasDoMentor
        conversas={[]}
        agoraIso="2026-11-03T15:00:00+00:00"
        haMais={false}
      />
    );

    const faixa = screen.getByRole("navigation", { name: "Mentor" });
    expect(
      within(faixa)
        .getByRole("link", { name: /Cartilha do mentor/ })
        .getAttribute("href")
    ).toBe("/admin/mentor");
  });
});
