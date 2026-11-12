// @vitest-environment jsdom
import { ChatMentor } from "@/components/painel/mentor/chat-mentor";
import { ListaConversas } from "@/components/painel/mentor/lista-conversas";
import type { ConversaDaLista } from "@/lib/mentor/leitura";
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

const { renomearConversa, arquivarConversa, excluirConversa } = vi.hoisted(
  () => ({
    renomearConversa: vi.fn(),
    arquivarConversa: vi.fn(),
    excluirConversa: vi.fn(),
  })
);
vi.mock("@/lib/mentor/sessoes-actions", () => ({
  renomearConversa,
  arquivarConversa,
  excluirConversa,
}));
vi.mock("@/lib/mentor/anexos-actions", () => ({
  baixarAnexo: vi.fn(),
}));

const { atualizar } = vi.hoisted(() => ({ atualizar: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: atualizar }),
}));

const { enviarMensagemAction } = vi.hoisted(() => ({
  enviarMensagemAction: vi.fn(),
}));
vi.mock("@/lib/mentor/enviar-action", () => ({ enviarMensagemAction }));

// A lista do dono: da mais recente para a mais antiga, com a data no relógio
// da casa. "Hoje" para a tela: 3 de novembro de 2026, 12:00 em São Paulo.
const AGORA = "2026-11-03T15:00:00+00:00";
const FUSO = "America/Sao_Paulo";

const RECENTE: ConversaDaLista = {
  id: "11111111-1111-4111-8111-111111111111",
  titulo: "Como foi a semana?",
  ultima_em: "2026-11-03T13:30:00+00:00",
  arquivada_em: null,
};
const DO_MEIO: ConversaDaLista = {
  id: "22222222-2222-4222-8222-222222222222",
  titulo: "Quanto vendi ontem?",
  ultima_em: "2026-11-02T13:30:00+00:00",
  arquivada_em: null,
};
const ANTIGA: ConversaDaLista = {
  id: "33333333-3333-4333-8333-333333333333",
  titulo: null,
  ultima_em: "2026-10-30T14:05:00+00:00",
  arquivada_em: null,
};
const ARQUIVADA: ConversaDaLista = {
  id: "44444444-4444-4444-8444-444444444444",
  titulo: "Conversa de setembro",
  ultima_em: "2026-09-20T14:05:00+00:00",
  arquivada_em: "2026-10-01T12:00:00+00:00",
};

function tela(
  extra: Partial<React.ComponentProps<typeof ListaConversas>> = {}
): React.ReactElement {
  return (
    <ListaConversas
      slug="bar-do-ze"
      conversas={[RECENTE, DO_MEIO, ANTIGA]}
      arquivadas={[ARQUIVADA]}
      ativaId={null}
      fuso={FUSO}
      agoraIso={AGORA}
      somenteLeitura={false}
      {...extra}
    />
  );
}

function listaPrincipal(): HTMLElement {
  return screen.getByRole("list", { name: "Conversas" });
}

beforeEach(() => {
  vi.clearAllMocks();
  renomearConversa.mockResolvedValue({ ok: true });
  arquivarConversa.mockResolvedValue({ ok: true });
  excluirConversa.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("lista de conversas do mentor: o que mostra", () => {
  it("mostra os títulos da mais recente para a mais antiga, com a data no fuso da casa", () => {
    render(tela());

    const links = within(listaPrincipal()).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining("Como foi a semana?"),
      expect.stringContaining("Quanto vendi ontem?"),
      expect.stringContaining("Conversa sem título"),
    ]);
    // 13:30 UTC: 10:30 em São Paulo (hoje), 10:30 de ontem, 30/10 11:05.
    expect(links[0]?.textContent).toContain("hoje 10:30");
    expect(links[1]?.textContent).toContain("ontem 10:30");
    expect(links[2]?.textContent).toContain("30/10 11:05");
  });

  it("cada linha abre a conversa pelo id", () => {
    render(tela());

    const links = within(listaPrincipal())
      .getAllByRole("link")
      .map((l) => l.getAttribute("href"));
    expect(links).toEqual([
      `/r/bar-do-ze/mentor?conversa=${RECENTE.id}`,
      `/r/bar-do-ze/mentor?conversa=${DO_MEIO.id}`,
      `/r/bar-do-ze/mentor?conversa=${ANTIGA.id}`,
    ]);
  });

  it("marca a conversa aberta, sem usar só a cor", () => {
    render(tela({ ativaId: DO_MEIO.id }));

    const aberta = screen.getByRole("link", { name: /Quanto vendi ontem/ });
    expect(aberta.getAttribute("aria-current")).toBe("page");
    const outra = screen.getByRole("link", { name: /Como foi a semana/ });
    expect(outra.getAttribute("aria-current")).toBeNull();
  });

  it("mostra as arquivadas separadas, com o caminho de volta", () => {
    render(tela());

    const arquivadas = screen.getByRole("list", {
      name: "Conversas arquivadas",
    });
    expect(
      within(arquivadas).getByRole("link", { name: /Conversa de setembro/ })
    ).toBeTruthy();
    expect(
      within(arquivadas).queryByRole("link", { name: /Como foi a semana/ })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /Trazer de volta a conversa/ })
    ).toBeTruthy();
  });
});

describe("lista de conversas do mentor: nova conversa", () => {
  it("Nova conversa leva ao estado vazio sem chamar nenhuma escrita", () => {
    render(tela());

    const nova = screen.getByRole("link", { name: /nova conversa/i });
    expect(nova.getAttribute("href")).toBe("/r/bar-do-ze/mentor?nova=1");
    // É um link, não um botão nem um formulário: não há caminho de escrita.
    expect(nova.tagName).toBe("A");
    expect(renomearConversa).not.toHaveBeenCalled();
    expect(arquivarConversa).not.toHaveBeenCalled();
    expect(excluirConversa).not.toHaveBeenCalled();
    expect(enviarMensagemAction).not.toHaveBeenCalled();
  });
});

describe("lista de conversas do mentor: renomear", () => {
  function abreRenomear(): void {
    fireEvent.click(
      screen.getByRole("button", {
        name: 'Renomear a conversa "Quanto vendi ontem?"',
      })
    );
  }

  it("o formulário segue o padrão do chat: method post, botão desligado com título vazio", () => {
    render(tela());
    abreRenomear();

    const campo = screen.getByRole("textbox", { name: /título da conversa/i });
    expect(campo.closest("form")?.getAttribute("method")).toBe("post");
    fireEvent.change(campo, { target: { value: "   " } });
    expect(
      screen.getByRole("button", { name: /^salvar$/i }).hasAttribute("disabled")
    ).toBe(true);
  });

  it("renomear chama a ação e atualiza o título", async () => {
    render(tela());
    abreRenomear();

    fireEvent.change(
      screen.getByRole("textbox", { name: /título da conversa/i }),
      { target: { value: "Semana boa" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() =>
      expect(renomearConversa).toHaveBeenCalledWith(
        "bar-do-ze",
        DO_MEIO.id,
        "Semana boa"
      )
    );
    expect(await screen.findByText("Semana boa")).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: 'Renomear a conversa "Quanto vendi ontem?"',
      })
    ).toBeNull();
    expect(atualizar).toHaveBeenCalled();
  });

  it("quando a ação recusa, mostra a frase do produto e mantém o título", async () => {
    renomearConversa.mockResolvedValueOnce({
      ok: false,
      error: "o título ficou longo demais; use até 60 letras",
    });
    render(tela());
    abreRenomear();

    fireEvent.change(
      screen.getByRole("textbox", { name: /título da conversa/i }),
      { target: { value: "Um título que o servidor não aceitou" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain(
      "o título ficou longo demais; use até 60 letras"
    );
    expect(screen.getByText("Quanto vendi ontem?")).toBeTruthy();
  });
});

describe("lista de conversas do mentor: arquivar", () => {
  it("arquivar chama a ação e tira da principal (indo para as arquivadas)", async () => {
    render(tela());

    fireEvent.click(
      screen.getByRole("button", {
        name: 'Arquivar a conversa "Quanto vendi ontem?"',
      })
    );

    await waitFor(() =>
      expect(arquivarConversa).toHaveBeenCalledWith(
        "bar-do-ze",
        DO_MEIO.id,
        true
      )
    );
    await waitFor(() =>
      expect(
        within(listaPrincipal()).queryByRole("link", {
          name: /Quanto vendi ontem/,
        })
      ).toBeNull()
    );
    const arquivadas = screen.getByRole("list", {
      name: "Conversas arquivadas",
    });
    expect(
      within(arquivadas).getByRole("link", { name: /Quanto vendi ontem/ })
    ).toBeTruthy();
    expect(atualizar).toHaveBeenCalled();
  });

  it("quando a ação recusa, a conversa fica na principal com a frase", async () => {
    arquivarConversa.mockResolvedValueOnce({
      ok: false,
      error: "não encontrei essa conversa; comece uma nova",
    });
    render(tela());

    fireEvent.click(
      screen.getByRole("button", {
        name: 'Arquivar a conversa "Quanto vendi ontem?"',
      })
    );

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      within(listaPrincipal()).getByRole("link", { name: /Quanto vendi ontem/ })
    ).toBeTruthy();
  });

  it("trazer de volta chama a ação e devolve para a principal", async () => {
    render(tela());

    fireEvent.click(
      screen.getByRole("button", {
        name: 'Trazer de volta a conversa "Conversa de setembro"',
      })
    );

    await waitFor(() =>
      expect(arquivarConversa).toHaveBeenCalledWith(
        "bar-do-ze",
        ARQUIVADA.id,
        false
      )
    );
    expect(
      await within(listaPrincipal()).findByRole("link", {
        name: /Conversa de setembro/,
      })
    ).toBeTruthy();
  });
});

describe("lista de conversas do mentor: excluir", () => {
  function pedeExclusao(): void {
    fireEvent.click(
      screen.getByRole("button", {
        name: 'Excluir a conversa "Quanto vendi ontem?"',
      })
    );
  }

  it("excluir pede confirmação avisando dos 60 dias", () => {
    render(tela());
    pedeExclusao();

    expect(excluirConversa).not.toHaveBeenCalled();
    const aviso = screen.getByText(/60 dias/);
    expect(aviso.textContent).toContain("some da sua lista");
    expect(
      screen.getByRole("button", { name: /^excluir conversa$/i })
    ).toBeTruthy();
  });

  it("confirmar chama a ação e tira da vista", async () => {
    render(tela());
    pedeExclusao();
    fireEvent.click(
      screen.getByRole("button", { name: /^excluir conversa$/i })
    );

    await waitFor(() =>
      expect(excluirConversa).toHaveBeenCalledWith("bar-do-ze", DO_MEIO.id)
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Quanto vendi ontem/ })
      ).toBeNull()
    );
    expect(screen.queryByText("Quanto vendi ontem?")).toBeNull();
    expect(atualizar).toHaveBeenCalled();
  });

  it("cancelar não chama nada e mantém a conversa", () => {
    render(tela());
    pedeExclusao();
    fireEvent.click(screen.getByRole("button", { name: /^cancelar$/i }));

    expect(excluirConversa).not.toHaveBeenCalled();
    expect(
      within(listaPrincipal()).getByRole("link", { name: /Quanto vendi ontem/ })
    ).toBeTruthy();
  });

  it("quando a ação recusa, a conversa fica na vista com a frase", async () => {
    excluirConversa.mockResolvedValueOnce({
      ok: false,
      error: "não encontrei essa conversa; comece uma nova",
    });
    render(tela());
    pedeExclusao();
    fireEvent.click(
      screen.getByRole("button", { name: /^excluir conversa$/i })
    );

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      within(listaPrincipal()).getByRole("link", { name: /Quanto vendi ontem/ })
    ).toBeTruthy();
  });
});

describe("lista de conversas do mentor: modo leitura do admin", () => {
  it("sem botão, sem campo, sem Nova conversa — mas navegando normal", () => {
    const { container } = render(tela({ somenteLeitura: true }));

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryByRole("link", { name: /nova conversa/i })).toBeNull();
    const link = screen.getByRole("link", { name: /Como foi a semana/ });
    expect(link.getAttribute("href")).toBe(
      `/r/bar-do-ze/mentor?conversa=${RECENTE.id}`
    );
  });
});

describe("troca de conversa no meio de Pensando", () => {
  it("cancela só a vista: não duplica o envio", async () => {
    let responder: (v: unknown) => void = () => {};
    enviarMensagemAction.mockReturnValue(
      new Promise((resolve) => {
        responder = resolve;
      })
    );
    const { unmount } = render(
      <ChatMentor
        slug="bar-do-ze"
        conversaId={null}
        mensagensIniciais={[]}
        somenteLeitura={false}
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: /sua pergunta/i }), {
      target: { value: "Como foi a semana?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    expect(await screen.findByText(/pensando/i)).toBeTruthy();

    // O dono toca em outra conversa: o chat desmonta com o envio no ar.
    unmount();
    await act(async () => {
      responder({
        ok: true,
        data: { conversaId: RECENTE.id, resposta: "A semana fechou em alta." },
      });
    });

    expect(enviarMensagemAction).toHaveBeenCalledTimes(1);
  });
});
