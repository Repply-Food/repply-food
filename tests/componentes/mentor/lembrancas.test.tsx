// @vitest-environment jsdom
import { Lembrancas } from "@/components/painel/mentor/lembrancas";
import type { FichaDaLista } from "@/lib/mentor/leitura";
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

const { apagarFicha, esquecerTudo } = vi.hoisted(() => ({
  apagarFicha: vi.fn(),
  esquecerTudo: vi.fn(),
}));
vi.mock("@/lib/mentor/memorias-actions", () => ({
  apagarFicha,
  esquecerTudo,
}));

const { atualizar } = vi.hoisted(() => ({ atualizar: vi.fn() }));

const { exigirCasa, fichasDaCasa } = vi.hoisted(() => ({
  exigirCasa: vi.fn(),
  fichasDaCasa: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/mentor/leitura", () => ({
  fichasDaCasa,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: atualizar }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import PaginaLembrancas from "@/app/r/[slug]/mentor/lembrancas/page";

// A tela "O que o mentor lembra": a lista com tipo, texto e data no relógio da
// casa. "Hoje" para a tela: 3 de novembro de 2026, 12:00 em São Paulo.
const AGORA = "2026-11-03T15:00:00+00:00";
const FUSO = "America/Sao_Paulo";

const FICHA_NOVA: FichaDaLista = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tipo: "fato",
  texto: "o dono prefere conselho direto",
  atualizada_em: "2026-11-03T13:30:00+00:00",
};
const FICHA_VELHA: FichaDaLista = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  tipo: "resumo",
  texto: "a casa lota de sexta",
  atualizada_em: "2026-10-30T14:05:00+00:00",
};

function tela(
  extra: Partial<React.ComponentProps<typeof Lembrancas>> = {}
): React.ReactElement {
  return (
    <Lembrancas
      slug="bar-do-ze"
      fichas={[FICHA_NOVA, FICHA_VELHA]}
      fuso={FUSO}
      agoraIso={AGORA}
      somenteLeitura={false}
      {...extra}
    />
  );
}

function lista(): HTMLElement {
  return screen.getByRole("list", { name: /lembranças/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  apagarFicha.mockResolvedValue({ ok: true });
  esquecerTudo.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("lembranças do mentor: o que mostra", () => {
  it("mostra cada ficha com o tipo, o texto e a data no fuso da casa", () => {
    render(tela());

    const itens = within(lista()).getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(itens[0]?.textContent).toContain("fato");
    expect(itens[0]?.textContent).toContain("o dono prefere conselho direto");
    // 13:30 UTC: 10:30 em São Paulo (hoje); 30/10 11:05 a outra.
    expect(itens[0]?.textContent).toContain("hoje 10:30");
    expect(itens[1]?.textContent).toContain("resumo");
    expect(itens[1]?.textContent).toContain("a casa lota de sexta");
    expect(itens[1]?.textContent).toContain("30/10 11:05");
  });

  it("sem ficha, mostra o estado vazio — nunca um erro", () => {
    render(tela({ fichas: [] }));

    expect(screen.getByText(/o mentor ainda não lembra de nada/i)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("list", { name: /lembranças/i })).toBeNull();
    // Sem nada para esquecer, nem o botão aparece.
    expect(screen.queryByRole("button", { name: /esquecer tudo/i })).toBeNull();
  });
});

describe("lembranças do mentor: apagar uma ficha", () => {
  function pedeParaApagar(): void {
    fireEvent.click(
      screen.getByRole("button", {
        name: 'Apagar a lembrança "o dono prefere conselho direto"',
      })
    );
  }

  it("apagar pede confirmação antes de chamar a ação", () => {
    render(tela());
    pedeParaApagar();

    expect(apagarFicha).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /^apagar lembrança$/i })
    ).toBeTruthy();
  });

  it("confirmar chama a ação e tira a ficha da vista", async () => {
    render(tela());
    pedeParaApagar();
    fireEvent.click(
      screen.getByRole("button", { name: /^apagar lembrança$/i })
    );

    await waitFor(() =>
      expect(apagarFicha).toHaveBeenCalledWith("bar-do-ze", FICHA_NOVA.id)
    );
    await waitFor(() =>
      expect(screen.queryByText("o dono prefere conselho direto")).toBeNull()
    );
    // A outra continua lá.
    expect(screen.getByText("a casa lota de sexta")).toBeTruthy();
    expect(atualizar).toHaveBeenCalled();
  });

  it("cancelar não chama nada e mantém a ficha", () => {
    render(tela());
    pedeParaApagar();
    fireEvent.click(screen.getByRole("button", { name: /^cancelar$/i }));

    expect(apagarFicha).not.toHaveBeenCalled();
    expect(screen.getByText("o dono prefere conselho direto")).toBeTruthy();
  });

  it("quando a ação recusa, a ficha fica na vista com a frase", async () => {
    apagarFicha.mockResolvedValueOnce({
      ok: false,
      error: "não encontrei essa lembrança; ela pode ter sido apagada",
    });
    render(tela());
    pedeParaApagar();
    fireEvent.click(
      screen.getByRole("button", { name: /^apagar lembrança$/i })
    );

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain(
      "não encontrei essa lembrança; ela pode ter sido apagada"
    );
    expect(screen.getByText("o dono prefere conselho direto")).toBeTruthy();
  });
});

describe("lembranças do mentor: esquecer tudo", () => {
  it("esquecer tudo pede confirmação dupla: o mentor para de usar na hora", () => {
    render(tela());

    fireEvent.click(screen.getByRole("button", { name: /esquecer tudo/i }));
    // Primeira confirmação: avisa que o efeito é imediato.
    expect(esquecerTudo).not.toHaveBeenCalled();
    expect(screen.getByText(/o mentor para de usar na hora/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^continuar$/i }));
    // Segunda confirmação: ainda não chamou.
    expect(esquecerTudo).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /^sim, esquecer tudo$/i })
    ).toBeTruthy();
  });

  it("confirmar duas vezes chama a ação e esvazia a vista", async () => {
    render(tela());

    fireEvent.click(screen.getByRole("button", { name: /esquecer tudo/i }));
    fireEvent.click(screen.getByRole("button", { name: /^continuar$/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /^sim, esquecer tudo$/i })
    );

    await waitFor(() => expect(esquecerTudo).toHaveBeenCalledWith("bar-do-ze"));
    expect(
      await screen.findByText(/o mentor ainda não lembra de nada/i)
    ).toBeTruthy();
    expect(atualizar).toHaveBeenCalled();
  });

  it("cancelar no meio não chama nada e mantém as fichas", () => {
    render(tela());

    fireEvent.click(screen.getByRole("button", { name: /esquecer tudo/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancelar$/i }));

    expect(esquecerTudo).not.toHaveBeenCalled();
    expect(screen.getByText("o dono prefere conselho direto")).toBeTruthy();
    expect(screen.getByText("a casa lota de sexta")).toBeTruthy();
  });

  it("quando a ação recusa, as fichas ficam na vista com a frase", async () => {
    esquecerTudo.mockResolvedValueOnce({
      ok: false,
      error:
        "não foi possível mexer nas lembranças agora. Tente de novo em instantes.",
    });
    render(tela());

    fireEvent.click(screen.getByRole("button", { name: /esquecer tudo/i }));
    fireEvent.click(screen.getByRole("button", { name: /^continuar$/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /^sim, esquecer tudo$/i })
    );

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("o dono prefere conselho direto")).toBeTruthy();
  });
});

describe("lembranças do mentor: modo leitura do admin", () => {
  it("sem botão, sem formulário — mas lendo normal", () => {
    const { container } = render(tela({ somenteLeitura: true }));

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelector("form")).toBeNull();
    expect(screen.getByText("o dono prefere conselho direto")).toBeTruthy();
    expect(screen.getByText("a casa lota de sexta")).toBeTruthy();
  });
});

describe("página de lembranças: a guarda", () => {
  const params = Promise.resolve({ slug: "bar-do-ze" });

  it("sem o módulo do mentor, responde 404", async () => {
    exigirCasa.mockResolvedValue({
      casa: { id: "c1", slug: "bar-do-ze", modulos: [] },
      modoAdmin: false,
    });
    await expect(PaginaLembrancas({ params })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(fichasDaCasa).not.toHaveBeenCalled();
  });

  it("com o módulo, carrega as fichas da casa para a tela", async () => {
    exigirCasa.mockResolvedValue({
      casa: {
        id: "c1",
        slug: "bar-do-ze",
        fuso: FUSO,
        modulos: ["mentor"],
      },
      modoAdmin: false,
    });
    fichasDaCasa.mockResolvedValue([FICHA_NOVA]);

    const elemento = await PaginaLembrancas({ params });

    expect(fichasDaCasa).toHaveBeenCalledWith("c1");
    expect(elemento).toBeTruthy();
  });

  it("no modo leitura do admin, a tela abre sem os botões", async () => {
    exigirCasa.mockResolvedValue({
      casa: {
        id: "c1",
        slug: "bar-do-ze",
        fuso: FUSO,
        modulos: ["mentor"],
      },
      modoAdmin: true,
    });
    fichasDaCasa.mockResolvedValue([FICHA_NOVA, FICHA_VELHA]);

    const elemento = await PaginaLembrancas({ params });
    expect(elemento).toBeTruthy();
    await act(async () => {
      render(elemento);
    });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("o dono prefere conselho direto")).toBeTruthy();
  });
});
