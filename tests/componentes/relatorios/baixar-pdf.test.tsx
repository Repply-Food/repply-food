// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BaixarPdfRelatorio } from "@/components/painel/relatorios/baixar-pdf";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("download de PDF dos relatórios", () => {
  it.each([
    [409, /dados mudaram/i],
    [422, /datas, os filtros ou o limite/i],
  ])(
    "mostra instrução própria para erro %i e libera o botão",
    async (status, texto) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("falha", { status }))
      );
      render(
        <BaixarPdfRelatorio href="/r/casa/relatorios/produtos/pdf?inicio=2026-02-14" />
      );
      const botao = screen.getByRole("button", { name: "Baixar PDF" });
      fireEvent.click(botao);

      expect((await screen.findByRole("alert")).textContent).toMatch(texto);
      await waitFor(() =>
        expect((botao as HTMLButtonElement).disabled).toBe(false)
      );
    }
  );

  it("mantém o estado de geração ocupado até a resposta", async () => {
    let concluir: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            concluir = resolve;
          })
      )
    );
    render(
      <BaixarPdfRelatorio href="/r/casa/relatorios/produtos/pdf?inicio=2026-02-14" />
    );
    const botao = screen.getByRole("button", { name: "Baixar PDF" });
    fireEvent.click(botao);
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    concluir?.(new Response("erro", { status: 500 }));
    await waitFor(() =>
      expect((botao as HTMLButtonElement).disabled).toBe(false)
    );
  });
});
