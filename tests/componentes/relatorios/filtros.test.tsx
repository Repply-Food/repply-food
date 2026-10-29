// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/relatorios/opcoes-actions", () => ({
  obterOpcoesAction: vi.fn(),
}));
import { FiltrosRelatorioForm } from "@/components/painel/relatorios/filtros";
import { obterOpcoesAction } from "@/lib/relatorios/opcoes-actions";

const obterOpcoesMock = vi.mocked(obterOpcoesAction);

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("filtros do relatório", () => {
  it("exige período e fonte, mostra opções recebidas e oferece atalhos de período", () => {
    render(
      <FiltrosRelatorioForm
        relatorio="produtos"
        slug="casa-x"
        fuso="America/Fortaleza"
        recursos={["pdv", "grupo"]}
        consulta={{
          filtros: {
            inicio: "2026-10-20",
            fim: "2026-10-26",
            fonte: "historico",
            grupo: "G1",
          },
          pagina: 2,
          revisao: "8",
        }}
        opcoes={{
          grupo: {
            opcoes: [{ codigo: "G1", rotulo: "Cervejas" }],
            mais: false,
          },
        }}
        agora={new Date("2026-10-28T12:00:00Z")}
      />
    );
    expect(screen.getByLabelText("Data inicial").getAttribute("required")).toBe(
      ""
    );
    expect(screen.getByLabelText("Data final").getAttribute("required")).toBe(
      ""
    );
    expect(screen.getByRole("option", { name: "Cervejas" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Hoje" }).getAttribute("href")
    ).toContain("inicio=2026-10-28");
    const formulario = screen
      .getByRole("button", { name: "Aplicar filtros" })
      .closest("form");
    expect(formulario?.getAttribute("method")).toBe("get");
    expect(formulario?.querySelector('[name="pagina"]')).toBeNull();
    expect(formulario?.querySelector('[name="revisao"]')).toBeNull();
  });

  it("busca opções no servidor usando o slug, sem receber identificador da casa", async () => {
    obterOpcoesMock.mockResolvedValue({
      ok: true,
      data: { opcoes: [{ codigo: "D1", rotulo: "Salão" }], mais: false },
    });
    render(
      <FiltrosRelatorioForm
        relatorio="produtos"
        slug="casa-x"
        fuso="America/Fortaleza"
        recursos={["pdv"]}
        consulta={{
          filtros: {
            inicio: "2026-10-26",
            fim: "2026-10-26",
            fonte: "historico",
          },
          pagina: 1,
        }}
        agora={new Date("2026-10-28T12:00:00Z")}
      />
    );
    fireEvent.change(screen.getByLabelText("Buscar pdv"), {
      target: { value: "sal" },
    });
    const botaoBuscar = screen.getAllByRole("button", {
      name: "Buscar opções",
    })[0];
    if (!botaoBuscar) throw new Error("botão de busca ausente");
    fireEvent.click(botaoBuscar);
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Salão" })).toBeTruthy()
    );
    expect(obterOpcoesMock).toHaveBeenCalledWith(
      "casa-x",
      "produtos",
      { inicio: "2026-10-26", fim: "2026-10-26", fonte: "historico" },
      "pdv",
      "sal",
      1
    );
  });

  it("mantém a escolha online explicitamente em um único dia", () => {
    render(
      <FiltrosRelatorioForm
        relatorio="caixa"
        slug="casa-x"
        fuso="America/Fortaleza"
        recursos={[]}
        consulta={{
          filtros: { inicio: "2026-10-26", fim: "2026-10-26", fonte: "online" },
          pagina: 1,
        }}
        agora={new Date("2026-10-28T12:00:00Z")}
      />
    );
    expect(
      screen.getByText(/modo on-line mantém as duas datas no mesmo dia/)
    ).toBeTruthy();
    const inicio = screen.getByLabelText("Data inicial") as HTMLInputElement;
    const fim = screen.getByLabelText("Data final") as HTMLInputElement;
    fireEvent.change(fim, { target: { value: "2026-10-25" } });
    expect(inicio.value).toBe("2026-10-25");
    expect(fim.value).toBe("2026-10-25");
  });

  it("sincroniza datas e seletores quando a consulta muda após navegação", () => {
    const props = {
      relatorio: "produtos" as const,
      slug: "casa-x",
      fuso: "America/Fortaleza",
      recursos: ["grupo", "mesa"],
      consulta: {
        filtros: {
          inicio: "2026-10-20",
          fim: "2026-10-21",
          fonte: "historico" as const,
          grupo: "G1",
          mesaDe: 2,
        },
        pagina: 1,
      },
      opcoes: {
        grupo: { opcoes: [{ codigo: "G1", rotulo: "Cervejas" }], mais: false },
      },
      agora: new Date("2026-10-28T12:00:00Z"),
    };
    const { rerender } = render(<FiltrosRelatorioForm {...props} />);
    expect(
      (screen.getByLabelText("Data inicial") as HTMLInputElement).value
    ).toBe("2026-10-20");
    expect((screen.getByLabelText("Grupo") as HTMLSelectElement).value).toBe(
      "G1"
    );

    rerender(
      <FiltrosRelatorioForm
        {...props}
        consulta={{
          filtros: {
            inicio: "2026-10-25",
            fim: "2026-10-25",
            fonte: "online",
            grupo: "G2",
            mesaDe: 8,
          },
          pagina: 3,
          revisao: "12",
        }}
        opcoes={{
          grupo: {
            opcoes: [{ codigo: "G2", rotulo: "Petiscos" }],
            mais: false,
          },
        }}
      />
    );

    expect(
      (screen.getByLabelText("Data inicial") as HTMLInputElement).value
    ).toBe("2026-10-25");
    expect(
      (screen.getByLabelText("Data final") as HTMLInputElement).value
    ).toBe("2026-10-25");
    expect(
      (screen.getByLabelText("Origem dos dados") as HTMLSelectElement).value
    ).toBe("online");
    expect((screen.getByLabelText("Grupo") as HTMLSelectElement).value).toBe(
      "G2"
    );
    expect(
      (screen.getByLabelText("Mesa a partir de") as HTMLInputElement).value
    ).toBe("8");
  });
});
