import "@testing-library/jest-dom/vitest";
import { SecaoMeta } from "@/components/painel/ajustes/secao-meta";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Resultado = { ok: true } | { ok: false; error: string };

const { salvarMetaAction, refresh } = vi.hoisted(() => ({
  salvarMetaAction: vi.fn<
    (slug: string, mesISO: string, valor: string) => Promise<Resultado>
  >(async () => ({ ok: true })),
  refresh: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/painel/ajustes-actions", () => ({ salvarMetaAction }));
vi.mock("sonner", () => ({ toast }));

const base = {
  slug: "bar-do-ze",
  mesAtualISO: "2026-10-01",
  metas: [
    { mes: "2026-10-01", valor: "30000.00" },
    { mes: "2026-09-01", valor: "25000.00" },
  ],
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SecaoMeta", () => {
  it("abre no mês atual com o valor do mês e mostra o Salvar", () => {
    render(<SecaoMeta {...base} somenteLeitura={false} />);
    expect(screen.getByText(/outubro de 2026/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/meta de faturamento/i)).toHaveValue(
      "30.000,00"
    );
    expect(screen.getByRole("button", { name: /salvar/i })).toBeInTheDocument();
  });

  it("navega para novembro (sem meta) e mostra vazio", () => {
    render(<SecaoMeta {...base} somenteLeitura={false} />);
    fireEvent.click(screen.getByRole("button", { name: /próximo mês/i }));
    expect(screen.getByText(/novembro de 2026/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/meta de faturamento/i)).toHaveValue("");
  });

  it("vai e volta na virada de ano (dezembro ‹ janeiro)", () => {
    render(<SecaoMeta {...base} somenteLeitura={false} />);
    const prox = screen.getByRole("button", { name: /próximo mês/i });
    fireEvent.click(prox);
    fireEvent.click(prox);
    fireEvent.click(prox);
    expect(screen.getByText(/janeiro de 2027/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "mês anterior" }));
    expect(screen.getByText(/dezembro de 2026/i)).toBeInTheDocument();
  });

  it("copiar do mês anterior pega o mais recente salvo, não o mês vazio imediatamente anterior", () => {
    render(<SecaoMeta {...base} somenteLeitura={false} />);
    const prox = screen.getByRole("button", { name: /próximo mês/i });
    fireEvent.click(prox); // novembro (sem meta)
    fireEvent.click(prox); // dezembro
    fireEvent.click(
      screen.getByRole("button", { name: /copiar do mês anterior/i })
    );
    // o anterior salvo mais recente antes de dezembro é outubro (novembro está vazio)
    expect(screen.getByLabelText(/meta de faturamento/i)).toHaveValue(
      "30.000,00"
    );
  });

  it("salva a meta com os argumentos certos e dá refresh", async () => {
    render(<SecaoMeta {...base} somenteLeitura={false} />);
    fireEvent.change(screen.getByLabelText(/meta de faturamento/i), {
      target: { value: "40.000,00" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() =>
      expect(salvarMetaAction).toHaveBeenCalledWith(
        "bar-do-ze",
        "2026-10-01",
        "40000.00"
      )
    );
    expect(toast.success).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("no erro mostra toast de erro e não dá refresh", async () => {
    salvarMetaAction.mockResolvedValueOnce({ ok: false, error: "deu ruim" });
    render(<SecaoMeta {...base} somenteLeitura={false} />);
    fireEvent.change(screen.getByLabelText(/meta de faturamento/i), {
      target: { value: "40.000,00" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("deu ruim"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("apagar o valor e salvar remove a meta", async () => {
    render(<SecaoMeta {...base} somenteLeitura={false} />);
    fireEvent.change(screen.getByLabelText(/meta de faturamento/i), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() =>
      expect(salvarMetaAction).toHaveBeenCalledWith(
        "bar-do-ze",
        "2026-10-01",
        ""
      )
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Meta removida.")
    );
  });

  it("trocar de mês com mudança não salva pede confirmação e, ao cancelar, fica", () => {
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SecaoMeta {...base} somenteLeitura={false} />);
    fireEvent.change(screen.getByLabelText(/meta de faturamento/i), {
      target: { value: "40.000,00" },
    });
    fireEvent.click(screen.getByRole("button", { name: /próximo mês/i }));
    expect(confirmar).toHaveBeenCalled();
    expect(screen.getByText(/outubro de 2026/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/meta de faturamento/i)).toHaveValue(
      "40.000,00"
    );
    confirmar.mockRestore();
  });

  it("sem mudança, trocar de mês não pergunta", () => {
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SecaoMeta {...base} somenteLeitura={false} />);
    fireEvent.click(screen.getByRole("button", { name: /próximo mês/i }));
    expect(confirmar).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });

  it("no modo leitura não mostra salvar nem copiar e o campo fica desabilitado", () => {
    render(<SecaoMeta {...base} somenteLeitura={true} />);
    expect(
      screen.queryByRole("button", { name: /salvar/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /copiar do mês anterior/i })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/meta de faturamento/i)).toBeDisabled();
  });
});
