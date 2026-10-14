// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/r/casa-x/resultados",
}));

import { MenuPainel } from "../../components/painel/menu-painel";
import { SeloDados } from "../../components/painel/selo-dados";

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
    render(<SeloDados selo={{ tom: "alerta", texto: "sem dados há 2 h" }} />);
    expect(screen.getByText("sem dados há 2 h")).toBeTruthy();
  });
});
