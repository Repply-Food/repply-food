import "@testing-library/jest-dom/vitest";
import { SecaoTurnos } from "@/components/painel/ajustes/secao-turnos";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Resultado = { ok: true } | { ok: false; error: string };

const { salvarTurnosAction, refresh } = vi.hoisted(() => ({
  salvarTurnosAction: vi.fn<
    (slug: string, almocoAte: string) => Promise<Resultado>
  >(async () => ({ ok: true })),
  refresh: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/painel/ajustes-actions", () => ({ salvarTurnosAction }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SecaoTurnos", () => {
  it("mostra o corte atual", () => {
    render(
      <SecaoTurnos
        slug="bar-do-ze"
        almocoAteInicial="17:00"
        somenteLeitura={false}
      />
    );
    expect(screen.getByLabelText(/almoço até/i)).toHaveValue("17:00");
  });

  it("no modo leitura não mostra salvar e o campo fica desabilitado", () => {
    render(
      <SecaoTurnos
        slug="bar-do-ze"
        almocoAteInicial="17:00"
        somenteLeitura={true}
      />
    );
    expect(
      screen.queryByRole("button", { name: /salvar/i })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/almoço até/i)).toBeDisabled();
  });

  it("salva o novo corte com os argumentos certos e dá refresh", async () => {
    render(
      <SecaoTurnos
        slug="bar-do-ze"
        almocoAteInicial="17:00"
        somenteLeitura={false}
      />
    );
    fireEvent.change(screen.getByLabelText(/almoço até/i), {
      target: { value: "16:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() =>
      expect(salvarTurnosAction).toHaveBeenCalledWith("bar-do-ze", "16:00")
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });

  it("no erro mostra toast de erro e não dá refresh", async () => {
    salvarTurnosAction.mockResolvedValueOnce({ ok: false, error: "deu ruim" });
    render(
      <SecaoTurnos
        slug="bar-do-ze"
        almocoAteInicial="17:00"
        somenteLeitura={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("deu ruim"));
    expect(refresh).not.toHaveBeenCalled();
  });
});
