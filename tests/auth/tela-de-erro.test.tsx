// @vitest-environment jsdom

import ErroDaTela from "@/app/error";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

describe("tela de erro (pendência 27)", () => {
  it("explica sem mostrar o erro técnico e tenta de novo", () => {
    const retry = vi.fn();
    render(
      <ErroDaTela error={new Error("falha_leitura_sessao")} retry={retry} />
    );
    expect(
      screen.getByRole("heading", { name: "Não deu para carregar agora" })
    ).toBeTruthy();
    expect(screen.queryByText(/falha_leitura_sessao/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
