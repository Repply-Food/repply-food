// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { AbasResultados } from "@/components/painel/resultados/abas-resultados";
import { ControlesResultados } from "@/components/painel/resultados/controles-resultados";
import type { FiltrosResultados } from "@/lib/metricas/resultados/filtros";

const filtros: FiltrosResultados = {
  aba: "vendas",
  comparacao: "anterior",
  atalho: "7d",
  inicio: "2026-10-14",
  fim: "2026-10-20",
  quantidadeDias: 7,
  rotuloPeriodo: "14 de outubro a 20 de outubro de 2026",
  query: new URLSearchParams("aba=vendas&periodo=7d&comparacao=anterior"),
};

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe("ControlesResultados", () => {
  it("troca para escolher e não navega com mais de 90 dias", async () => {
    render(<ControlesResultados filtros={filtros} slug="casa-a" />);

    fireEvent.click(screen.getByRole("button", { name: "Escolher período" }));
    fireEvent.change(screen.getByLabelText("Data inicial"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(screen.getByLabelText("Data final"), {
      target: { value: "2026-12-31" },
    });

    expect(push).not.toHaveBeenCalledWith(
      expect.stringContaining("inicio=2026-10-01")
    );
    expect(screen.getByRole("alert").textContent).toContain("até 90 dias");
  });
});

describe("controles e navegação de Resultados", () => {
  it("oferece o PDF para os filtros canônicos da tela", () => {
    render(<ControlesResultados filtros={filtros} slug="casa-a" />);

    expect(
      screen.getByRole("link", { name: "Baixar PDF" }).getAttribute("href")
    ).toBe(
      "/r/casa-a/resultados/pdf?aba=vendas&periodo=7d&comparacao=anterior"
    );
  });

  it("navega pelas abas com link e marca a página atual", () => {
    render(<AbasResultados filtros={filtros} slug="casa-a" />);

    expect(
      screen.getByRole("navigation", { name: "Abas de resultados" })
    ).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Vendas" }).getAttribute("aria-current")
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Equipe" }).getAttribute("aria-current")
    ).toBeNull();
  });
});
