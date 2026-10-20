import "@testing-library/jest-dom/vitest";
import { GuiaInstalar } from "@/components/painel/instalar/guia-instalar";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function fingirMatchMedia({ computador }: { computador: boolean }) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    // "(min-width: 1024px)" = computador; "(pointer: coarse)" = celular.
    matches: q.includes("min-width")
      ? computador
      : q.includes("pointer")
        ? !computador
        : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {}
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GuiaInstalar", () => {
  it("aparece no celular, fora do app, não visto", async () => {
    fingirMatchMedia({ computador: false });
    render(<GuiaInstalar />);
    expect(
      await screen.findByRole("region", { name: /instalar no celular/i })
    ).toBeInTheDocument();
  });

  it("some ao dispensar e marca o aparelho", async () => {
    fingirMatchMedia({ computador: false });
    render(<GuiaInstalar />);
    await screen.findByRole("region", { name: /instalar no celular/i });
    fireEvent.click(screen.getByRole("button", { name: /fazer depois/i }));
    expect(
      screen.queryByRole("region", { name: /instalar no celular/i })
    ).not.toBeInTheDocument();
    expect(localStorage.getItem("rf-guia-tela-inicial-visto")).toBe("1");
  });

  it("não aparece se já visto neste aparelho", () => {
    fingirMatchMedia({ computador: false });
    try {
      localStorage.setItem("rf-guia-tela-inicial-visto", "1");
    } catch {}
    const { container } = render(<GuiaInstalar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("não aparece no computador", () => {
    fingirMatchMedia({ computador: true });
    const { container } = render(<GuiaInstalar />);
    expect(container).toBeEmptyDOMElement();
  });
});
