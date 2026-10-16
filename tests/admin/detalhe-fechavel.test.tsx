// @vitest-environment jsdom
import { DetalheFechavel } from "@/components/admin/detalhe-fechavel";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function emComputador(duasColunas: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: duasColunas,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe("DetalheFechavel — fechar ao clicar fora", () => {
  it("no computador, clicar numa área vazia fora do detalhe volta para /admin", () => {
    emComputador(true);
    render(
      <div>
        <div data-testid="fora">área vazia</div>
        <DetalheFechavel>
          <p>detalhe</p>
        </DetalheFechavel>
      </div>
    );
    fireEvent.mouseDown(screen.getByTestId("fora"));
    expect(push).toHaveBeenCalledWith("/admin");
  });

  it("clicar dentro do detalhe não fecha", () => {
    emComputador(true);
    render(
      <DetalheFechavel>
        <p>conteúdo do detalhe</p>
      </DetalheFechavel>
    );
    fireEvent.mouseDown(screen.getByText("conteúdo do detalhe"));
    expect(push).not.toHaveBeenCalled();
  });

  it("clicar num link/botão fora não fecha (o controle age sozinho)", () => {
    emComputador(true);
    render(
      <div>
        <a href="/outra">um link</a>
        <DetalheFechavel>
          <p>detalhe</p>
        </DetalheFechavel>
      </div>
    );
    fireEvent.mouseDown(screen.getByText("um link"));
    expect(push).not.toHaveBeenCalled();
  });

  it("no celular (sem duas colunas) não fecha ao clicar fora", () => {
    emComputador(false);
    render(
      <div>
        <div data-testid="fora">área vazia</div>
        <DetalheFechavel>
          <p>detalhe</p>
        </DetalheFechavel>
      </div>
    );
    fireEvent.mouseDown(screen.getByTestId("fora"));
    expect(push).not.toHaveBeenCalled();
  });
});
