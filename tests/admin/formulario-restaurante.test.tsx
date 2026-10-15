import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push, cadastrar, editar, toastSucesso } = vi.hoisted(() => ({
  push: vi.fn(),
  cadastrar: vi.fn(),
  editar: vi.fn(),
  toastSucesso: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/admin/actions", () => ({
  cadastrarRestauranteAction: cadastrar,
  editarRestauranteAction: editar,
}));
vi.mock("sonner", () => ({
  toast: { success: toastSucesso, error: vi.fn() },
}));

import { FormularioRestaurante } from "@/components/admin/formulario-restaurante";
import { type RestauranteInput, VALORES_INICIAIS } from "@/lib/admin/schemas";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const VALIDOS: RestauranteInput = {
  ...VALORES_INICIAIS,
  nome: "Bar do Zé",
  dias: VALORES_INICIAIS.dias.map((d, dia) =>
    dia === 2 ? { ...d, modo: "um" as const } : d
  ),
};

function preencherNome(nome: string) {
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: nome } });
}

async function enviar(botao = "Cadastrar restaurante") {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: botao }));
  });
}

describe("formulário do restaurante (cadastro e edição)", () => {
  it("sem nenhum dia aberto, pede um e não chama o servidor", async () => {
    render(
      <FormularioRestaurante
        modo="cadastro"
        valoresIniciais={VALORES_INICIAIS}
      />
    );
    preencherNome("Bar do Zé");
    await enviar();
    expect(
      await screen.findByText("Abra a casa em pelo menos um dia")
    ).toBeTruthy();
    expect(cadastrar).not.toHaveBeenCalled();
  });

  it("abre a terça com um horário, copia para os outros dias e cadastra", async () => {
    cadastrar.mockResolvedValue({ ok: true, data: { id: "novo-id" } });
    render(
      <FormularioRestaurante
        modo="cadastro"
        valoresIniciais={VALORES_INICIAIS}
      />
    );
    preencherNome("Bar do Zé");
    const terca = screen.getByRole("group", { name: "Terça" });
    fireEvent.click(within(terca).getByLabelText("Um horário"));
    fireEvent.change(within(terca).getByLabelText("Terça: fecha"), {
      target: { value: "23:00" },
    });
    fireEvent.click(
      within(terca).getByRole("button", { name: "Copiar para os outros dias" })
    );
    await enviar();
    await waitFor(() => expect(cadastrar).toHaveBeenCalledOnce());
    const enviado = cadastrar.mock.calls[0]?.[0] as RestauranteInput;
    expect(
      enviado.dias.every(
        (d) => d.modo === "um" && d.abre1 === "11:00" && d.fecha1 === "23:00"
      )
    ).toBe(true);
    expect(push).toHaveBeenCalledWith("/admin/restaurantes/novo-id");
  });

  it("horários que se sobrepõem mostram o problema no próprio dia", async () => {
    render(
      <FormularioRestaurante
        modo="cadastro"
        valoresIniciais={VALORES_INICIAIS}
      />
    );
    preencherNome("Bar do Zé");
    const sexta = screen.getByRole("group", { name: "Sexta" });
    fireEvent.click(within(sexta).getByLabelText("Dois horários"));
    fireEvent.change(within(sexta).getByLabelText("Sexta: abre de novo"), {
      target: { value: "14:00" },
    });
    await enviar();
    expect(
      await within(sexta).findByText(
        "Os dois horários do mesmo dia não podem se sobrepor."
      )
    ).toBeTruthy();
    expect(cadastrar).not.toHaveBeenCalled();
  });

  it("o erro do servidor aparece no formulário, sem sair da tela", async () => {
    cadastrar.mockResolvedValue({
      ok: false,
      error: "Já existe um restaurante com este CNPJ.",
    });
    render(<FormularioRestaurante modo="cadastro" valoresIniciais={VALIDOS} />);
    await enviar();
    expect(
      await screen.findByText("Já existe um restaurante com este CNPJ.")
    ).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("na edição, salva e volta para o detalhe", async () => {
    editar.mockResolvedValue({
      ok: true,
      data: { recalculou: true, mudouFuso: false },
    });
    render(
      <FormularioRestaurante
        modo="edicao"
        restauranteId="r1"
        valoresIniciais={VALIDOS}
      />
    );
    expect(
      screen.getByText(
        /Mudar o fuso ou a hora da virada recalcula o dia de operação/
      )
    ).toBeTruthy();
    await enviar("Salvar");
    await waitFor(() =>
      expect(editar).toHaveBeenCalledWith(
        "r1",
        expect.objectContaining({ nome: "Bar do Zé" })
      )
    );
    expect(push).toHaveBeenCalledWith("/admin/restaurantes/r1");
  });

  it("na troca de fuso, a mensagem de sucesso avisa para pedir um reenvio", async () => {
    editar.mockResolvedValue({
      ok: true,
      data: { recalculou: true, mudouFuso: true },
    });
    render(
      <FormularioRestaurante
        modo="edicao"
        restauranteId="r1"
        valoresIniciais={VALIDOS}
      />
    );
    await enviar("Salvar");
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/admin/restaurantes/r1")
    );
    expect(toastSucesso).toHaveBeenCalledOnce();
    expect(String(toastSucesso.mock.calls[0]?.[0])).toMatch(/peça um reenvio/);
  });

  it("salvou mas não recalculou o dia: mostra aviso (não erro) e fica na tela", async () => {
    editar.mockResolvedValue({
      ok: false,
      error:
        "Os dados foram salvos, mas o dia de operação das contas não foi recalculado. Avise a equipe técnica.",
    });
    render(
      <FormularioRestaurante
        modo="edicao"
        restauranteId="r1"
        valoresIniciais={VALIDOS}
      />
    );
    await enviar("Salvar");
    const aviso = await screen.findByText(
      /^Os dados foram salvos, mas o dia de operação das contas não foi recalculado/
    );
    // Aviso de que salvou, não o erro vermelho de "não salvou".
    expect(screen.queryByRole("alert")).toBeNull();
    expect(aviso.closest("output")).not.toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Voltar ao restaurante" })
        .getAttribute("href")
    ).toBe("/admin/restaurantes/r1");
    expect(push).not.toHaveBeenCalled();
    expect(toastSucesso).not.toHaveBeenCalled();
  });

  it("a frase do aviso é a mesma que a função do servidor devolve", () => {
    const fonte = readFileSync(
      resolve(__dirname, "../../lib/admin/actions.ts"),
      "utf-8"
    );
    expect(fonte).toContain(
      "Os dados foram salvos, mas o dia de operação das contas não foi recalculado"
    );
  });

  it("na edição, outro erro do servidor continua sendo erro e não sai da tela", async () => {
    editar.mockResolvedValue({
      ok: false,
      error: "Já existe um restaurante com este CNPJ.",
    });
    render(
      <FormularioRestaurante
        modo="edicao"
        restauranteId="r1"
        valoresIniciais={VALIDOS}
      />
    );
    await enviar("Salvar");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Já existe um restaurante com este CNPJ."
    );
    expect(push).not.toHaveBeenCalled();
  });
});
