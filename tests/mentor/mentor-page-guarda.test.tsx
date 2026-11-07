// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const { exigirCasa } = vi.hoisted(() => ({ exigirCasa: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/mentor/leitura", () => ({
  conversasDaCasa: vi.fn(async () => []),
  mensagensDaConversa: vi.fn(async () => []),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import PaginaMentor from "@/app/r/[slug]/mentor/page";

afterEach(() => vi.clearAllMocks());

const params = Promise.resolve({ slug: "bar-do-ze" });

describe("guarda da rota do mentor", () => {
  it("404 quando a casa não tem o módulo", async () => {
    exigirCasa.mockResolvedValue({
      casa: { id: "c1", slug: "bar-do-ze", modulos: [] },
      modoAdmin: false,
    });
    await expect(PaginaMentor({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("renderiza quando a casa tem o módulo", async () => {
    exigirCasa.mockResolvedValue({
      casa: { id: "c1", slug: "bar-do-ze", modulos: ["mentor"] },
      modoAdmin: false,
    });
    const elemento = await PaginaMentor({ params });
    expect(elemento).toBeTruthy();
  });
});
