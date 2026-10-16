// @vitest-environment jsdom

import { ListaRestaurantes } from "@/components/admin/lista-restaurantes";
import type { LinhaDaLista } from "@/lib/admin/lista";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

// Quarta 14/10/2026, 21:40 em Fortaleza.
const agoraIso = "2026-10-15T00:40:00Z";

const linha = (
  parcial: Partial<LinhaDaLista> & Pick<LinhaDaLista, "id" | "nome">
): LinhaDaLista => ({
  slug: parcial.id,
  situacao: "ativo",
  fuso: "America/Fortaleza",
  estado: "em_dia",
  ultimoEnvioOkEm: "2026-10-15T00:38:00Z",
  versaoScc: "5.2.1",
  ...parcial,
});

const linhas = [
  linha({ id: "bar", nome: "Bar do Zé" }),
  linha({
    id: "mar",
    nome: "Sabor do Mar",
    estado: "parado",
    ultimoEnvioOkEm: "2026-10-12T21:00:00Z",
    versaoScc: "5.1.8",
  }),
  linha({
    id: "velho",
    nome: "Casa Velha",
    situacao: "suspenso",
    estado: "fechado",
  }),
  linha({
    id: "forno",
    nome: "Forno a Lenha",
    estado: null,
    ultimoEnvioOkEm: null,
    versaoScc: null,
  }),
];

describe("lista de restaurantes do admin", () => {
  it("sem restaurantes, diz isso e mostra o botão de cadastrar", () => {
    render(<ListaRestaurantes linhas={[]} agoraIso={agoraIso} />);
    expect(
      screen.getByText("Nenhum restaurante cadastrado ainda.")
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "+ Cadastrar restaurante" })
        .getAttribute("href")
    ).toBe("/admin/restaurantes/novo");
  });

  it("contadores com o total e os estados que existem", () => {
    render(<ListaRestaurantes linhas={linhas} agoraIso={agoraIso} />);
    const resumo = screen.getByRole("list", { name: "Resumo dos envios" });
    expect(
      within(resumo)
        .getAllByRole("listitem")
        .map((li) => li.textContent)
    ).toEqual([
      "4 cadastrados",
      "1 em dia",
      "1 parado",
      "1 aguardando",
      "1 suspenso",
    ]);
  });

  it("no celular, cartões na ordem de atenção com selo curto e último envio", () => {
    render(<ListaRestaurantes linhas={linhas} agoraIso={agoraIso} />);
    const cartoes = screen.getByRole("list", { name: "Restaurantes" });
    const links = within(cartoes).getAllByRole("link");
    expect(links.map((l) => l.querySelector("strong")?.textContent)).toEqual([
      "Sabor do Mar",
      "Forno a Lenha",
      "Bar do Zé",
      "Casa Velha",
    ]);
    expect(links[0]?.getAttribute("href")).toBe("/admin/restaurantes/mar");
    expect(
      within(links[2] as HTMLElement).getByText("hoje 21:38")
    ).toBeTruthy();
    expect(within(links[3] as HTMLElement).getByText("suspenso")).toBeTruthy();
    expect(within(links[1] as HTMLElement).getByText("—")).toBeTruthy();
  });

  it("no computador, tabela com as quatro colunas e a casa escolhida marcada", () => {
    render(
      <ListaRestaurantes
        linhas={linhas}
        agoraIso={agoraIso}
        selecionado="bar"
      />
    );
    const tabela = screen.getByRole("table");
    expect(
      within(tabela)
        .getAllByRole("columnheader")
        .map((th) => th.textContent)
    ).toEqual(["Restaurante", "Envio de dados", "Último envio", "SCC"]);
    const linhasDaTabela = within(tabela).getAllByRole("row").slice(1);
    expect(
      linhasDaTabela.map(
        (tr) => within(tr).getAllByRole("cell")[3]?.textContent
      )
    ).toEqual(["5.1.8", "—", "5.2.1", "5.2.1"]);
    expect(within(tabela).getByText("atualizado há 2 min")).toBeTruthy();
    expect(within(tabela).getByText("aguardando o 1º envio")).toBeTruthy();
    expect(
      within(tabela)
        .getByRole("link", { name: "Bar do Zé" })
        .getAttribute("aria-current")
    ).toBe("page");
  });

  it("o título pode ser secundário (detalhe no computador)", () => {
    render(
      <ListaRestaurantes
        linhas={linhas}
        agoraIso={agoraIso}
        tituloPrincipal={false}
      />
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Restaurantes" })
    ).toBeTruthy();
  });

  it("a casa já aberta aponta para /admin — clicar de novo fecha", () => {
    render(
      <ListaRestaurantes
        linhas={linhas}
        agoraIso={agoraIso}
        selecionado="bar"
      />
    );
    const tabela = screen.getByRole("table");
    // A aberta (Bar do Zé) não leva mais ao próprio detalhe...
    expect(
      within(tabela)
        .getByRole("link", { name: "Bar do Zé" })
        .getAttribute("href")
    ).toBe("/admin");
    // ...e uma não aberta continua levando ao detalhe dela.
    expect(
      within(tabela)
        .getByRole("link", { name: "Sabor do Mar" })
        .getAttribute("href")
    ).toBe("/admin/restaurantes/mar");
  });

  it("cada linha é link esticado e marcada para o fechar-ao-clicar-fora", () => {
    const { container } = render(
      <ListaRestaurantes linhas={linhas} agoraIso={agoraIso} />
    );
    // O link do nome estica por toda a linha (after:inset-0 sobre o <tr>).
    const linkNome = within(screen.getByRole("table")).getByRole("link", {
      name: "Bar do Zé",
    });
    expect(linkNome.className).toContain("after:inset-0");
    // E as linhas levam a marca que o DetalheFechavel usa para não fechar junto.
    expect(
      container.querySelectorAll("a[data-linha-restaurante]").length
    ).toBeGreaterThan(0);
  });
});
