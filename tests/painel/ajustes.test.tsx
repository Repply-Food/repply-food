// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { exigirCasa, emailsDosLoginsDaCasa, restaurante, metas } = vi.hoisted(
  () => ({
    exigirCasa: vi.fn(),
    emailsDosLoginsDaCasa: vi.fn(),
    restaurante: vi.fn(),
    metas: vi.fn(),
  })
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/admin/dados", () => ({ emailsDosLoginsDaCasa }));
vi.mock("@/lib/auth/actions", () => ({ sairAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) =>
      tabela === "metas"
        ? { select: () => ({ eq: () => ({ order: metas }) }) }
        : { select: () => ({ eq: () => ({ maybeSingle: restaurante }) }) },
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/painel/ajustes-actions", () => ({
  salvarMetaAction: vi.fn(),
  salvarTurnosAction: vi.fn(),
}));

import PaginaAjustes from "@/app/r/[slug]/ajustes/page";

const CASA = {
  id: "c1",
  slug: "casa-x",
  nome: "Casa X",
  situacao: "ativo",
  fuso: "America/Fortaleza",
};

const DADOS_VALIDOS = {
  cnpj: null as string | null,
  hora_virada: "05:00:00",
  horario_funcionamento: [] as unknown[],
  turnos: { almoco_ate: "17:00" },
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  restaurante.mockResolvedValue({ data: { ...DADOS_VALIDOS }, error: null });
  metas.mockResolvedValue({ data: [], error: null });
});

async function abrir() {
  render(await PaginaAjustes({ params: Promise.resolve({ slug: "casa-x" }) }));
}

describe("Ajustes", () => {
  it("o dono vê o e-mail, trocar senha, sair e os dois Salvar (meta e turnos)", async () => {
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
    expect(screen.getAllByRole("button", { name: /salvar/i })).toHaveLength(2);
    expect(emailsDosLoginsDaCasa).not.toHaveBeenCalled();
  });

  it("o admin vê o login do cliente, sem ações da conta nem Salvar (D-58)", async () => {
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
    expect(screen.queryAllByRole("button", { name: /salvar/i })).toHaveLength(
      0
    );
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

  it("mostra os dados da casa (CNPJ formatado, horário, virada) e o turno atual", async () => {
    exigirCasa.mockResolvedValue({
      sessao: { email: "dono@exemplo.com", ehAdmin: false },
      casa: CASA,
      modoAdmin: false,
    });
    restaurante.mockResolvedValue({
      error: null,
      data: {
        cnpj: "12345678000195", // cru, como o banco guarda
        hora_virada: "05:00:00",
        horario_funcionamento: [
          { dia: 2, abre: "11:00", fecha: "23:00" },
          { dia: 3, abre: "11:00", fecha: "23:00" },
        ],
        turnos: { almoco_ate: "15:30" },
      },
    });
    await abrir();
    expect(screen.getByRole("heading", { name: "Dados da casa" })).toBeTruthy();
    expect(screen.getByText("Casa X")).toBeTruthy();
    expect(screen.getByText("12.345.678/0001-95")).toBeTruthy(); // formatado
    expect(screen.getByText("ter–qua · 11h–23h")).toBeTruthy();
    expect(screen.getByText("5h")).toBeTruthy(); // virada
    expect(screen.getByLabelText(/almoço até/i)).toHaveValue("15:30");
    expect(screen.getByRole("heading", { name: "Meta do mês" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Turnos" })).toBeTruthy();
  });

  it("erro de leitura lança (vai para a tela de erro)", async () => {
    exigirCasa.mockResolvedValue({
      sessao: { email: "dono@exemplo.com", ehAdmin: false },
      casa: CASA,
      modoAdmin: false,
    });
    restaurante.mockResolvedValue({ data: null, error: { message: "falhou" } });
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      PaginaAjustes({ params: Promise.resolve({ slug: "casa-x" }) })
    ).rejects.toThrow("falha_leitura_ajustes");
    erro.mockRestore();
  });
});
