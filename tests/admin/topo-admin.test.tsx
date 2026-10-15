// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/actions", () => ({ sairAction: vi.fn() }));

import { TopoAdmin } from "@/components/admin/topo-admin";

afterEach(cleanup);

describe("topo do admin", () => {
  it("mostra o e-mail, a troca de senha que volta ao admin e o sair (computador e menu do celular)", () => {
    render(<TopoAdmin email="admin@repply.local" />);
    expect(screen.getAllByText("admin@repply.local")).toHaveLength(2);
    expect(
      screen
        .getAllByRole("link", { name: "Trocar minha senha" })
        .map((link) => link.getAttribute("href"))
    ).toEqual([
      "/trocar-senha?voltar=%2Fadmin",
      "/trocar-senha?voltar=%2Fadmin",
    ]);
    expect(screen.getAllByRole("button", { name: "Sair" })).toHaveLength(2);
    expect(screen.getByLabelText("Menu da conta")).toBeTruthy();
    expect(screen.getByText("admin")).toBeTruthy();
  });
});
