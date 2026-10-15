// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/r/casa-x/hoje" }));

import { FaixaModoLeitura } from "@/components/painel/faixa-modo-leitura";
import { MolduraPainel } from "@/components/painel/moldura-painel";
import type { Selo } from "@/lib/painel/selo";

afterEach(cleanup);

const selo: Selo = {
  tom: "ok",
  texto: "atualizado há 2 min",
  textoCurto: "há 2 min",
};
const casa = { nome: "Casa X", slug: "casa-x" };

describe("admin vendo o painel do cliente (D-58)", () => {
  it("a faixa diz de quem é o painel, que é só leitura, e volta ao admin", () => {
    render(<FaixaModoLeitura nome="Casa X" restauranteId="c1" />);
    const faixa = screen.getByRole("region", { name: "Modo leitura do admin" });
    expect(faixa.textContent).toContain(
      "Você está vendo o painel de Casa X · só leitura"
    );
    expect(
      within(faixa)
        .getByRole("link", { name: "Voltar ao admin" })
        .getAttribute("href")
    ).toBe("/admin/restaurantes/c1");
  });

  it("a moldura põe a faixa no topo, antes do cabeçalho do celular", () => {
    const { container } = render(
      <MolduraPainel
        casa={casa}
        selo={selo}
        faixa={<FaixaModoLeitura nome="Casa X" restauranteId="c1" />}
      >
        <p>conteúdo</p>
      </MolduraPainel>
    );
    const faixa = screen.getByRole("region", { name: "Modo leitura do admin" });
    const cabecalho = container.querySelector("header");
    if (!cabecalho) throw new Error("moldura sem cabeçalho");
    expect(
      faixa.compareDocumentPosition(cabecalho) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("sem a faixa, nada de modo leitura", () => {
    render(
      <MolduraPainel casa={casa} selo={selo}>
        <p>conteúdo</p>
      </MolduraPainel>
    );
    expect(
      screen.queryByRole("region", { name: "Modo leitura do admin" })
    ).toBeNull();
  });
});

describe("trocar de casa (D-58)", () => {
  it("aparece no cabeçalho do celular e na barra lateral, levando à escolha da casa", () => {
    const { container } = render(
      <MolduraPainel casa={casa} selo={selo} trocarDeCasa>
        <p>conteúdo</p>
      </MolduraPainel>
    );
    const barra = container.querySelector("aside");
    const cabecalho = container.querySelector("header");
    if (!(barra && cabecalho))
      throw new Error("moldura sem barra ou cabeçalho");
    for (const parte of [barra, cabecalho]) {
      expect(
        within(parte as HTMLElement)
          .getByRole("link", { name: "Trocar de casa" })
          .getAttribute("href")
      ).toBe("/escolher-casa");
    }
  });

  it("não aparece sem a opção", () => {
    render(
      <MolduraPainel casa={casa} selo={selo}>
        <p>conteúdo</p>
      </MolduraPainel>
    );
    expect(
      screen.queryAllByRole("link", { name: "Trocar de casa" })
    ).toHaveLength(0);
  });
});
