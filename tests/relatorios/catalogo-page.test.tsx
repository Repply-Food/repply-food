// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { exigirCasa } = vi.hoisted(() => ({ exigirCasa: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));

import PaginaRelatorios from "@/app/r/[slug]/relatorios/page";

afterEach(cleanup);

describe("página do catálogo de relatórios", () => {
  it("confere o acesso à casa antes de mostrar o catálogo", async () => {
    exigirCasa.mockResolvedValue({ casa: { id: "c1" } });
    render(
      await PaginaRelatorios({ params: Promise.resolve({ slug: "casa-x" }) })
    );

    expect(exigirCasa).toHaveBeenCalledWith("casa-x");
    expect(screen.getByRole("heading", { name: "Relatórios" })).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(6);
  });
});
