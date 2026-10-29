import { PaginacaoRelatorio } from "@/components/painel/relatorios/paginacao";
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

describe("paginação dos relatórios", () => {
  it("mantém filtros e revisão ao mudar de página", () => {
    render(
      <PaginacaoRelatorio
        consulta={{
          filtros: {
            inicio: "2026-10-24",
            fim: "2026-10-24",
            fonte: "historico",
            grupo: "G1",
          },
          pagina: 2,
          revisao: "7",
        }}
        paginacao={{ pagina: 2, tamanho: 25, totalLinhas: 60 }}
        slug="casa-x"
        relatorio="produtos"
      />
    );
    const anterior = screen
      .getByRole("link", { name: "Página anterior" })
      .getAttribute("href");
    const proxima = screen
      .getByRole("link", { name: "Próxima página" })
      .getAttribute("href");
    expect(anterior).toContain("grupo=G1");
    expect(anterior).toContain("revisao=7");
    expect(anterior).toContain("pagina=1");
    expect(proxima).toContain("pagina=3");
  });
});
