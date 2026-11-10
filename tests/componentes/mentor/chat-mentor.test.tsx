// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type Root, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { enviarMensagemAction } = vi.hoisted(() => ({
  enviarMensagemAction: vi.fn(),
}));

vi.mock("@/lib/mentor/enviar-action", () => ({ enviarMensagemAction }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ChatMentor } from "@/components/painel/mentor/chat-mentor";

const AVISO =
  "A equipe da Repply pode ler esta conversa para dar suporte, e ela também ajuda a melhorar a inteligência artificial.";
const CONVERSA = "22222222-2222-4222-8222-222222222222";

const MENSAGENS = [
  {
    id: "m1",
    papel: "dono" as const,
    texto: "Como foi a semana?",
    criada_em: "2026-10-29T12:00:00.000Z",
  },
  {
    id: "m2",
    papel: "mentor" as const,
    texto: "A semana fechou em alta.",
    criada_em: "2026-10-29T12:00:05.000Z",
  },
];

function tela(
  extra: Partial<React.ComponentProps<typeof ChatMentor>> = {}
): React.ReactElement {
  return (
    <ChatMentor
      slug="bar-do-ze"
      conversaId={null}
      mensagensIniciais={[]}
      somenteLeitura={false}
      {...extra}
    />
  );
}

function campo(): HTMLTextAreaElement {
  return screen.getByRole("textbox", { name: /sua pergunta/i });
}
function botaoEnviar(): HTMLButtonElement {
  return screen.getByRole("button", { name: /enviar/i });
}
function digitar(texto: string) {
  fireEvent.change(campo(), { target: { value: texto } });
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("chat do mentor: o que a tela mostra", () => {
  it("sem conversa, mostra o estado vazio", () => {
    render(tela());
    expect(
      screen.getByText(/faça a primeira pergunta ao mentor/i)
    ).toBeTruthy();
  });

  it("mostra o aviso de privacidade com o texto exato", () => {
    render(tela());
    expect(screen.getByText(AVISO)).toBeTruthy();
  });

  it("o aviso diz as duas coisas: a equipe lê no suporte e a conversa ajuda a melhorar a IA", () => {
    render(tela());
    const aviso = screen.getByText(AVISO).textContent ?? "";
    expect(aviso).toMatch(/equipe da Repply pode ler/);
    expect(aviso).toMatch(/dar suporte/);
    expect(aviso).toMatch(/melhorar a inteligência artificial/);
  });

  it("mostra a conversa salva sem o estado vazio, com o rótulo de quem falou", () => {
    render(tela({ conversaId: CONVERSA, mensagensIniciais: MENSAGENS }));
    expect(screen.queryByText(/faça a primeira pergunta/i)).toBeNull();
    expect(screen.getByText("Como foi a semana?")).toBeTruthy();
    expect(screen.getByText("A semana fechou em alta.")).toBeTruthy();
    // Só a cor não basta: cada fala leva o nome de quem falou.
    expect(screen.getByText("Você")).toBeTruthy();
    expect(screen.getByText("Mentor")).toBeTruthy();
  });

  it("o botão de enviar fica desligado enquanto o campo está vazio", () => {
    render(tela());
    expect(botaoEnviar().disabled).toBe(true);
    digitar("   ");
    expect(botaoEnviar().disabled).toBe(true);
    digitar("oi");
    expect(botaoEnviar().disabled).toBe(false);
  });
});

describe("chat do mentor: antes de a página carregar", () => {
  function htmlDoServidor(): Document {
    return new DOMParser().parseFromString(renderToString(tela()), "text/html");
  }

  it('sai do servidor com method="post" (a pergunta nunca vai para a URL)', () => {
    const form = htmlDoServidor().querySelector("form");
    expect(form).not.toBeNull();
    expect(form?.getAttribute("method")?.toLowerCase()).toBe("post");
  });

  it("sai do servidor com o botão de enviar desligado", () => {
    const enviar = htmlDoServidor().querySelector<HTMLButtonElement>(
      'form button[type="submit"]'
    );
    expect(enviar).not.toBeNull();
    expect(enviar?.disabled).toBe(true);
  });

  it("liga o botão (com texto digitado) quando o navegador hidrata o HTML do servidor", async () => {
    const recipiente = document.createElement("div");
    document.body.appendChild(recipiente);
    let raiz: Root | undefined;
    try {
      recipiente.innerHTML = renderToString(tela());
      await act(async () => {
        raiz = hydrateRoot(recipiente, tela());
      });
      const area = recipiente.querySelector("textarea");
      if (!area) throw new Error("sem campo");
      await act(async () => {
        fireEvent.change(area, { target: { value: "oi" } });
      });
      const enviar = recipiente.querySelector<HTMLButtonElement>(
        'button[type="submit"]'
      );
      expect(enviar?.disabled).toBe(false);
    } finally {
      await act(async () => raiz?.unmount());
      recipiente.remove();
    }
  });
});

describe("chat do mentor: enviando", () => {
  it("mostra a pergunta na hora, 'pensando…' enquanto espera e depois a resposta", async () => {
    let responder: (v: unknown) => void = () => {};
    enviarMensagemAction.mockReturnValue(
      new Promise((resolve) => {
        responder = resolve;
      })
    );
    render(tela());

    digitar("Como foi a semana?");
    fireEvent.click(botaoEnviar());

    // Otimista: a pergunta aparece antes da resposta; o campo esvazia.
    expect(await screen.findByText("Como foi a semana?")).toBeTruthy();
    expect(screen.getByText(/pensando/i)).toBeTruthy();
    expect(campo().value).toBe("");
    expect(enviarMensagemAction).toHaveBeenCalledWith(
      "bar-do-ze",
      null,
      "Como foi a semana?"
    );
    // O estado vazio sai assim que há conversa.
    expect(screen.queryByText(/faça a primeira pergunta/i)).toBeNull();

    await act(async () => {
      responder({
        ok: true,
        data: { conversaId: CONVERSA, resposta: "A semana fechou em alta." },
      });
    });

    expect(await screen.findByText("A semana fechou em alta.")).toBeTruthy();
    expect(screen.queryByText(/pensando/i)).toBeNull();
  });

  it("não deixa enviar de novo enquanto espera (duplo clique vale uma vez só)", async () => {
    let responder: (v: unknown) => void = () => {};
    enviarMensagemAction.mockReturnValue(
      new Promise((resolve) => {
        responder = resolve;
      })
    );
    render(tela());

    digitar("Como foi a semana?");
    const botao = botaoEnviar();
    fireEvent.click(botao);
    fireEvent.click(botao);
    digitar("outra coisa");
    expect(botaoEnviar().disabled).toBe(true);
    fireEvent.submit(campo().closest("form") as HTMLFormElement);

    expect(enviarMensagemAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      responder({
        ok: true,
        data: { conversaId: CONVERSA, resposta: "ok" },
      });
    });
    await waitFor(() => expect(botaoEnviar().disabled).toBe(false));
  });

  it("continua a MESMA conversa na segunda pergunta", async () => {
    enviarMensagemAction.mockResolvedValue({
      ok: true,
      data: { conversaId: CONVERSA, resposta: "resposta" },
    });
    render(tela());

    digitar("primeira");
    fireEvent.click(botaoEnviar());
    await screen.findAllByText("resposta");

    digitar("segunda");
    fireEvent.click(botaoEnviar());
    await waitFor(() => expect(enviarMensagemAction).toHaveBeenCalledTimes(2));

    expect(enviarMensagemAction).toHaveBeenNthCalledWith(
      1,
      "bar-do-ze",
      null,
      "primeira"
    );
    expect(enviarMensagemAction).toHaveBeenNthCalledWith(
      2,
      "bar-do-ze",
      CONVERSA,
      "segunda"
    );
  });

  it("no erro mostra a frase do produto e devolve a pergunta ao campo", async () => {
    enviarMensagemAction.mockResolvedValue({
      ok: false,
      error: "você já usou bastante o mentor hoje; ele volta amanhã",
    });
    render(tela());

    digitar("Como foi a semana?");
    fireEvent.click(botaoEnviar());

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain(
      "você já usou bastante o mentor hoje; ele volta amanhã"
    );
    // A pergunta não foi salva: sai da conversa e volta ao campo, para tentar de novo.
    expect(screen.queryByText(/pensando/i)).toBeNull();
    expect(campo().value).toBe("Como foi a semana?");
    expect(screen.getByText(/faça a primeira pergunta/i)).toBeTruthy();
    expect(botaoEnviar().disabled).toBe(false);
  });

  it("se a chamada falhar de vez (rede, tempo esgotado), mostra uma frase do produto", async () => {
    enviarMensagemAction.mockRejectedValue(
      new Error("segredo técnico: ECONNRESET")
    );
    render(tela());

    digitar("Como foi a semana?");
    fireEvent.click(botaoEnviar());

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toBe(
      "o mentor está indisponível agora, tente de novo"
    );
    expect(alerta.textContent).not.toContain("segredo");
    expect(campo().value).toBe("Como foi a semana?");
  });

  it("limpa o erro antigo quando o dono tenta de novo", async () => {
    enviarMensagemAction.mockResolvedValueOnce({
      ok: false,
      error: "o mentor está indisponível agora, tente de novo",
    });
    enviarMensagemAction.mockResolvedValueOnce({
      ok: true,
      data: { conversaId: CONVERSA, resposta: "agora foi" },
    });
    render(tela());

    digitar("oi");
    fireEvent.click(botaoEnviar());
    await screen.findByRole("alert");

    fireEvent.click(botaoEnviar());
    await screen.findByText("agora foi");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("chat do mentor: teclado", () => {
  function ponteiroFino(fino: boolean) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: fino }))
    );
  }
  afterEach(() => vi.unstubAllGlobals());

  it("no computador, Enter envia e Shift+Enter quebra a linha", async () => {
    ponteiroFino(true);
    enviarMensagemAction.mockResolvedValue({
      ok: true,
      data: { conversaId: CONVERSA, resposta: "ok" },
    });
    render(tela());

    digitar("linha um");
    fireEvent.keyDown(campo(), { key: "Enter", shiftKey: true });
    expect(enviarMensagemAction).not.toHaveBeenCalled();

    fireEvent.keyDown(campo(), { key: "Enter" });
    await waitFor(() => expect(enviarMensagemAction).toHaveBeenCalledTimes(1));
    expect(enviarMensagemAction).toHaveBeenCalledWith(
      "bar-do-ze",
      null,
      "linha um"
    );
  });

  it("no celular (toque), Enter só quebra a linha: quem envia é o botão", () => {
    ponteiroFino(false);
    render(tela());

    digitar("oi");
    fireEvent.keyDown(campo(), { key: "Enter" });

    expect(enviarMensagemAction).not.toHaveBeenCalled();
  });

  it("Enter com o campo vazio não envia nada", () => {
    ponteiroFino(true);
    render(tela());

    fireEvent.keyDown(campo(), { key: "Enter" });

    expect(enviarMensagemAction).not.toHaveBeenCalled();
  });
});

describe("chat do mentor: modo leitura do admin", () => {
  it("esconde o campo e o botão, avisa o motivo e mantém a conversa visível", () => {
    render(
      tela({
        somenteLeitura: true,
        conversaId: CONVERSA,
        mensagensIniciais: MENSAGENS,
      })
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /enviar/i })).toBeNull();
    expect(
      screen.getByText(/modo leitura — o mentor responde só para o dono/i)
    ).toBeTruthy();
    expect(screen.getByText("Como foi a semana?")).toBeTruthy();
    expect(screen.getByText("A semana fechou em alta.")).toBeTruthy();
    expect(enviarMensagemAction).not.toHaveBeenCalled();
  });

  it("sem conversa, o admin vê o estado vazio sem convite para perguntar", () => {
    render(tela({ somenteLeitura: true }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.getByText(/ainda não fez nenhuma pergunta ao mentor/i)
    ).toBeTruthy();
  });
});
