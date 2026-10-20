import "@testing-library/jest-dom/vitest";
import { AtalhoInstalar } from "@/components/painel/instalar/atalho-instalar";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

function fingirAmbiente({ computador }: { computador: boolean }) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    // "(min-width: 1024px)" verdadeiro = computador; ponteiro grosso = celular
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AtalhoInstalar", () => {
  it("no computador não renderiza nada", () => {
    fingirAmbiente({ computador: true });
    const { container } = render(<AtalhoInstalar />);
    expect(container).toBeEmptyDOMElement();
  });
  it("no celular mostra o botão de colocar na tela inicial", () => {
    fingirAmbiente({ computador: false });
    render(<AtalhoInstalar />);
    expect(
      screen.getByRole("button", { name: /colocar na tela inicial/i })
    ).toBeInTheDocument();
  });
  it("dentro do app instalado não renderiza", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("min-width")
        ? false
        : q.includes("pointer: coarse")
          ? true
          : q.includes("display-mode: standalone"),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { container } = render(<AtalhoInstalar />);
    expect(container).toBeEmptyDOMElement();
  });
});
