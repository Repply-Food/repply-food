// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AbasResultados } from "@/components/painel/resultados/abas-resultados";

afterEach(cleanup);

describe("AbasResultados", () => {
  it("mostra o painel da aba inicial e troca para outra no clique, sem recarregar", () => {
    render(
      <AbasResultados
        slug="bar"
        abaInicial="vendas"
        paineis={{
          vendas: <p>painel vendas</p>,
          horarios: <p>painel horarios</p>,
          equipe: <p>painel equipe</p>,
          descontos: <p>painel descontos</p>,
        }}
      />
    );

    // Começa em Vendas: só o painel de vendas aparece.
    expect(screen.getByText("painel vendas")).toBeTruthy();
    expect(screen.queryByText("painel equipe")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Vendas" })
        .getAttribute("aria-current")
    ).toBe("page");

    // Clicar em Equipe troca o painel no cliente (sem navegação de servidor).
    fireEvent.click(screen.getByRole("button", { name: "Equipe" }));

    expect(screen.getByText("painel equipe")).toBeTruthy();
    expect(screen.queryByText("painel vendas")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Equipe" })
        .getAttribute("aria-current")
    ).toBe("page");
    // A URL reflete a aba (para link e PDF), atualizada sem recarregar.
    expect(window.location.search).toContain("aba=equipe");
  });
});
