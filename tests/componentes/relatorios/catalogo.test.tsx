import { CatalogoRelatorios } from "@/components/painel/relatorios/catalogo";
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

describe("catálogo de relatórios", () => {
  it("apresenta os seis destinos fechados a partir do registro", () => {
    render(<CatalogoRelatorios slug="casa-ficticia" />);

    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href"))
    ).toEqual([
      "/r/casa-ficticia/relatorios/produtos",
      "/r/casa-ficticia/relatorios/comissao",
      "/r/casa-ficticia/relatorios/caixa",
      "/r/casa-ficticia/relatorios/auditoria",
      "/r/casa-ficticia/relatorios/notas-assinadas",
      "/r/casa-ficticia/relatorios/financeiro",
    ]);
    expect(
      screen.getAllByRole("link", { name: /abrir relatório/i })
    ).toHaveLength(6);
    expect(
      screen.getByText("Notas informadas para o movimento e código do cliente.")
    ).toBeTruthy();
  });
});
