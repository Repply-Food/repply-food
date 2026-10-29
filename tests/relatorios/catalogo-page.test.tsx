// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const { exigirCasa, redirect } = vi.hoisted(() => ({
  exigirCasa: vi.fn(),
  redirect: vi.fn((destino: string): never => {
    throw new Error(`redirect:${destino}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("next/navigation", () => ({ redirect }));

import PaginaRelatorios from "@/app/r/[slug]/relatorios/page";

afterEach(() => {
  vi.clearAllMocks();
});

describe("página do catálogo de relatórios", () => {
  it("confere o acesso à casa antes de mandar a rota antiga para Resultados", async () => {
    exigirCasa.mockResolvedValue({ casa: { id: "c1" } });

    await expect(
      PaginaRelatorios({ params: Promise.resolve({ slug: "casa-x" }) })
    ).rejects.toThrow("redirect:/r/casa-x/resultados");

    expect(exigirCasa).toHaveBeenCalledWith("casa-x");
    expect(redirect).toHaveBeenCalledWith("/r/casa-x/resultados");
    expect(exigirCasa.mock.invocationCallOrder[0]).toBeLessThan(
      redirect.mock.invocationCallOrder[0] as number
    );
  });
});
