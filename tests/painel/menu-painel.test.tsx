// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/r/casa-x/resultados",
}));

import { MenuPainel } from "../../components/painel/menu-painel";
import { MolduraPainel } from "../../components/painel/moldura-painel";
import { SeloDados } from "../../components/painel/selo-dados";
import type { Selo } from "../../lib/painel/selo";

afterEach(cleanup);

describe("moldura do painel", () => {
  it.each(["lateral", "inferior"] as const)(
    "o menu %s leva às três telas da casa e marca a atual",
    (variante) => {
      render(<MenuPainel slug="casa-x" variante={variante} />);
      const links = screen.getAllByRole("link");
      expect(links.map((link) => link.getAttribute("href"))).toEqual([
        "/r/casa-x/hoje",
        "/r/casa-x/resultados",
        "/r/casa-x/ajustes",
      ]);
      expect(
        screen
          .getByRole("link", { name: /resultados/i })
          .getAttribute("aria-current")
      ).toBe("page");
      expect(
        screen.getByRole("link", { name: /hoje/i }).getAttribute("aria-current")
      ).toBeNull();
    }
  );

  it("o selo sempre mostra o texto, não só a cor", () => {
    render(
      <SeloDados
        selo={{
          tom: "alerta",
          texto: "sem dados há 2 h",
          textoCurto: "sem dados há 2 h",
        }}
      />
    );
    expect(screen.getByText("sem dados há 2 h")).toBeTruthy();
  });
});

describe("selo do vigia: texto curto no celular, completo no resto", () => {
  const selo: Selo = {
    tom: "ok",
    texto: "atualizado há 2 min",
    textoCurto: "há 2 min",
  };

  it("no compacto mostra o texto curto e deixa o completo para o leitor de tela", () => {
    render(<SeloDados selo={selo} compacto />);

    const curto = screen.getByText("há 2 min");
    expect(curto.getAttribute("aria-hidden")).toBe("true");

    const completo = screen.getByText("atualizado há 2 min");
    expect(completo.classList.contains("sr-only")).toBe(true);
    expect(completo.getAttribute("aria-hidden")).toBeNull();
  });

  it("no compacto a pílula não quebra linha nem encolhe", () => {
    const { container } = render(<SeloDados selo={selo} compacto />);
    const pilula = container.firstElementChild;
    expect(pilula?.classList.contains("whitespace-nowrap")).toBe(true);
    expect(pilula?.classList.contains("shrink-0")).toBe(true);
  });

  it("fora do compacto mostra o texto completo, sem o curto", () => {
    render(<SeloDados selo={selo} />);

    const completo = screen.getByText("atualizado há 2 min");
    expect(completo.classList.contains("sr-only")).toBe(false);
    expect(completo.getAttribute("aria-hidden")).toBeNull();
    expect(screen.queryByText("há 2 min")).toBeNull();
  });

  it("fora do compacto a pílula pode quebrar linha", () => {
    const { container } = render(<SeloDados selo={selo} />);
    expect(
      container.firstElementChild?.classList.contains("whitespace-nowrap")
    ).toBe(false);
  });

  it("a moldura usa o curto no cabeçalho do celular e o completo na barra lateral", () => {
    const { container } = render(
      <MolduraPainel casa={{ nome: "Casa X", slug: "casa-x" }} selo={selo}>
        <p>conteúdo</p>
      </MolduraPainel>
    );

    const barra = container.querySelector("aside");
    const cabecalho = container.querySelector("header");
    if (!(barra && cabecalho))
      throw new Error("moldura sem barra ou cabeçalho");

    // Barra do computador: texto completo visível, sem versão curta.
    const completoNaBarra = within(barra).getByText("atualizado há 2 min");
    expect(completoNaBarra.classList.contains("sr-only")).toBe(false);
    expect(within(barra).queryByText("há 2 min")).toBeNull();

    // Cabeçalho do celular: curto visível, completo só para o leitor de tela.
    expect(
      within(cabecalho).getByText("há 2 min").getAttribute("aria-hidden")
    ).toBe("true");
    expect(
      within(cabecalho)
        .getByText("atualizado há 2 min")
        .classList.contains("sr-only")
    ).toBe(true);
  });
});
