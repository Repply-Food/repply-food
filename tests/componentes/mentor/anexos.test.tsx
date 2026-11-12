// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { enviarMensagemAction, baixarAnexo } = vi.hoisted(() => ({
  enviarMensagemAction: vi.fn(),
  baixarAnexo: vi.fn(),
}));

vi.mock("@/lib/mentor/sessoes-actions", () => ({
  apagarConversaDeVerdade: vi.fn(),
}));
vi.mock("@/lib/mentor/enviar-action", () => ({ enviarMensagemAction }));
vi.mock("@/lib/mentor/anexos-actions", () => ({ baixarAnexo }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [chave: string]: unknown;
  }) => <a {...props}>{children}</a>,
}));

import { ConversaDoMentor } from "@/components/admin/conversa-do-mentor";
import { ChatMentor } from "@/components/painel/mentor/chat-mentor";
import type { DetalheDaConversaParaAdmin } from "@/lib/mentor/leitura";

const CONVERSA = "22222222-2222-4222-8222-222222222222";
const FUSO = "America/Sao_Paulo";
// "Hoje" para a tela: 3 de novembro de 2026, 12:00 em São Paulo (UTC-3).
const AGORA = "2026-11-03T15:00:00+00:00";

const ANEXOS = [
  {
    id: "a1111111-1111-4111-8111-111111111111",
    nome: "cardapio-novo.png",
    tipo: "imagem" as const,
    tamanho_bytes: 204_800,
    criada_em: "2026-11-03T14:30:00+00:00",
  },
  {
    id: "b2222222-2222-4222-8222-222222222222",
    nome: "fechamento-outubro.pdf",
    tipo: "pdf" as const,
    tamanho_bytes: 1_572_864,
    criada_em: "2026-11-03T14:31:00+00:00",
  },
  {
    id: "c3333333-3333-4333-8333-333333333333",
    nome: "vendas.csv",
    tipo: "planilha" as const,
    tamanho_bytes: 512,
    criada_em: "2026-11-03T14:32:00+00:00",
  },
];

function arquivo(nome: string, tipo: string, tamanho: number): File {
  const bytes = new Uint8Array(tamanho);
  return new File([bytes], nome, { type: tipo });
}

function telaChat(
  extra: Partial<React.ComponentProps<typeof ChatMentor>> = {}
): React.ReactElement {
  return (
    <ChatMentor
      slug="bar-do-ze"
      conversaId={null}
      mensagensIniciais={[]}
      somenteLeitura={false}
      fuso={FUSO}
      agoraIso={AGORA}
      {...extra}
    />
  );
}

function campoAnexo(): HTMLInputElement {
  return screen.getByLabelText(/anexar arquivos/i) as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  enviarMensagemAction.mockResolvedValue({
    ok: true,
    data: { conversaId: CONVERSA, resposta: "ok", anexosFalharam: false },
  });
  baixarAnexo.mockResolvedValue({ ok: true, url: "https://cofre.local/a.png" });
  vi.stubGlobal("open", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("chat do mentor: anexar arquivos", () => {
  it("o campo de anexo aceita imagem, PDF e planilha, vários de uma vez", () => {
    render(telaChat());

    const campo = campoAnexo();
    expect(campo.getAttribute("type")).toBe("file");
    expect(campo.multiple).toBe(true);
    const aceitos = campo.getAttribute("accept") ?? "";
    expect(aceitos).toContain("image/*");
    expect(aceitos).toContain(".pdf");
    expect(aceitos).toContain(".xlsx");
    expect(aceitos).toContain(".csv");
  });

  it("o limite vem escrito ao lado do botão de anexar", () => {
    render(telaChat());

    expect(screen.getByText(/até 5 arquivos, 10 MB cada/i)).toBeTruthy();
  });

  it("com 6 arquivos, trava com frase e mantém o texto digitado", async () => {
    render(telaChat());

    fireEvent.change(screen.getByRole("textbox", { name: /sua pergunta/i }), {
      target: { value: "Olha esses arquivos" },
    });
    const seis = [
      arquivo("a1.png", "image/png", 10),
      arquivo("a2.png", "image/png", 10),
      arquivo("a3.png", "image/png", 10),
      arquivo("a4.png", "image/png", 10),
      arquivo("a5.png", "image/png", 10),
      arquivo("a6.png", "image/png", 10),
    ];
    fireEvent.change(campoAnexo(), { target: { files: seis } });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toMatch(/até 5 arquivos/i);
    expect(enviarMensagemAction).not.toHaveBeenCalled();
    // A pergunta não foi: continua no campo, para tentar de novo.
    expect(
      (
        screen.getByRole("textbox", {
          name: /sua pergunta/i,
        }) as HTMLTextAreaElement
      ).value
    ).toBe("Olha esses arquivos");
  });

  it("anexa os arquivos escolhidos e mostra a lista da conversa", async () => {
    render(telaChat());

    fireEvent.change(screen.getByRole("textbox", { name: /sua pergunta/i }), {
      target: { value: "Como foi a semana?" },
    });
    const foto = arquivo("cardapio-novo.png", "image/png", 100);
    fireEvent.change(campoAnexo(), { target: { files: [foto] } });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));

    await waitFor(() => expect(enviarMensagemAction).toHaveBeenCalledTimes(1));
    const chamada = enviarMensagemAction.mock.calls[0] ?? [];
    expect(chamada[0]).toBe("bar-do-ze");
    expect(chamada[1]).toBeNull();
    expect(chamada[2]).toBe("Como foi a semana?");
    const enviados = chamada[3] as File[];
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.name).toBe("cardapio-novo.png");

    // A lista da conversa mostra o que foi anexado.
    expect(await screen.findByText("cardapio-novo.png")).toBeTruthy();
  });

  it("erro do servidor vira frase e mantém o texto e os arquivos", async () => {
    enviarMensagemAction.mockResolvedValue({
      ok: false,
      error: "o mentor só abre imagem, PDF e planilha",
    });
    render(telaChat());

    fireEvent.change(screen.getByRole("textbox", { name: /sua pergunta/i }), {
      target: { value: "Olha isso" },
    });
    fireEvent.change(campoAnexo(), {
      target: { files: [arquivo("foto.png", "image/png", 100)] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain(
      "o mentor só abre imagem, PDF e planilha"
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: /sua pergunta/i,
        }) as HTMLTextAreaElement
      ).value
    ).toBe("Olha isso");
    // Os arquivos continuam escolhidos, para reenviar sem anexar de novo.
    expect(campoAnexo().files).toHaveLength(1);
  });

  it("quando algum anexo não entra, avisa sem derrubar a resposta — e sem mentir na lista", async () => {
    enviarMensagemAction.mockResolvedValue({
      ok: true,
      data: {
        conversaId: CONVERSA,
        resposta: "A semana fechou em alta.",
        anexosFalharam: true,
      },
    });
    render(telaChat({ conversaId: CONVERSA, anexosIniciais: ANEXOS }));

    fireEvent.change(screen.getByRole("textbox", { name: /sua pergunta/i }), {
      target: { value: "Olha isso" },
    });
    fireEvent.change(campoAnexo(), {
      target: { files: [arquivo("foto.png", "image/png", 100)] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));

    expect(await screen.findByText("A semana fechou em alta.")).toBeTruthy();
    expect(
      await screen.findByText(/alguns anexos não entraram, reenvie só eles/i)
    ).toBeTruthy();
    // Falha parcial não otimista: a foto não entrou na vista local — a
    // verdade chega do servidor (`router.refresh()`), sem mentir no meio.
    const lista = screen.getByRole("list", { name: /anexos da conversa/i });
    expect(within(lista).queryByText("foto.png")).toBeNull();
    expect(within(lista).getAllByRole("listitem")).toHaveLength(ANEXOS.length);
  });

  it("a lista acompanha o servidor: prop nova, vista nova (sem recarregar)", () => {
    const { rerender } = render(
      telaChat({ conversaId: CONVERSA, anexosIniciais: ANEXOS })
    );
    expect(screen.getByText("fechamento-outubro.pdf")).toBeTruthy();

    const novos = [
      ...ANEXOS,
      {
        id: "d4444444-4444-4444-8444-444444444444",
        nome: "novo-do-servidor.png",
        tipo: "imagem" as const,
        tamanho_bytes: 100,
        criada_em: "2026-11-03T14:33:00+00:00",
      },
    ];
    rerender(telaChat({ conversaId: CONVERSA, anexosIniciais: novos }));

    // O `router.refresh()` trouxe a verdade e a vista acompanhou, sem
    // remontar a conversa (o texto digitado continua no campo).
    expect(screen.getByText("novo-do-servidor.png")).toBeTruthy();
  });

  it("os anexos da conversa mostram nome, tipo, tamanho e hora no fuso da casa", () => {
    render(telaChat({ conversaId: CONVERSA, anexosIniciais: ANEXOS }));

    const lista = screen.getByRole("list", { name: /anexos da conversa/i });
    expect(within(lista).getByText("cardapio-novo.png")).toBeTruthy();
    expect(within(lista).getByText("fechamento-outubro.pdf")).toBeTruthy();
    // 30 de outubro em São Paulo: a hora vai no relógio da casa.
    expect(within(lista).getByText(/imagem/i)).toBeTruthy();
    expect(within(lista).getByText(/200 KB/i)).toBeTruthy();
    expect(within(lista).getByText(/1,5 MB/i)).toBeTruthy();
    expect(within(lista).getByText(/hoje 11:30/i)).toBeTruthy();
  });

  it("baixar chama a ação com o id e abre o link assinado na aba do clique", async () => {
    // A aba abre no gesto (síncrono, antes da ação): o dublê finge a aba.
    const aba = { location: { href: "" }, closed: false, close: vi.fn() };
    vi.mocked(window.open).mockReturnValue(aba as unknown as Window);
    render(telaChat({ conversaId: CONVERSA, anexosIniciais: ANEXOS }));

    fireEvent.click(
      screen.getByRole("button", { name: /baixar cardapio-novo\.png/i })
    );

    // Síncrono: o clique abriu a aba antes mesmo de a ação responder.
    expect(window.open).toHaveBeenCalledWith(
      "",
      "_blank",
      "noopener,noreferrer"
    );
    await waitFor(() =>
      expect(baixarAnexo).toHaveBeenCalledWith("bar-do-ze", ANEXOS[0]?.id)
    );
    // A URL assinada chegou depois e a aba navegou até ela.
    await waitFor(() =>
      expect(aba.location.href).toBe("https://cofre.local/a.png")
    );
    expect(aba.close).not.toHaveBeenCalled();
  });

  it("quando o link não sai, baixar fecha a aba e mostra a frase", async () => {
    baixarAnexo.mockResolvedValue({
      ok: false,
      error: "não encontrei esse anexo",
    });
    const aba = { location: { href: "" }, closed: false, close: vi.fn() };
    vi.mocked(window.open).mockReturnValue(aba as unknown as Window);
    render(telaChat({ conversaId: CONVERSA, anexosIniciais: ANEXOS }));

    fireEvent.click(
      screen.getByRole("button", { name: /baixar cardapio-novo\.png/i })
    );

    expect(await screen.findByText("não encontrei esse anexo")).toBeTruthy();
    expect(aba.close).toHaveBeenCalledTimes(1);
    expect(aba.location.href).toBe("");
  });

  it("modo leitura: sem campo de anexo, sem enviar e sem baixar", () => {
    render(
      telaChat({
        somenteLeitura: true,
        conversaId: CONVERSA,
        anexosIniciais: ANEXOS,
      })
    );

    expect(screen.queryByLabelText(/anexar arquivos/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /enviar/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /baixar/i })).toBeNull();
    // Os nomes continuam visíveis: leitura é só leitura, não esconderijo.
    expect(screen.getByText("cardapio-novo.png")).toBeTruthy();
  });

  it("sem anexo, a conversa continua igual a hoje: nenhuma lista", () => {
    render(telaChat());

    expect(
      screen.queryByRole("list", { name: /anexos da conversa/i })
    ).toBeNull();
  });
});

const DETALHE_BASE: DetalheDaConversaParaAdmin = {
  id: CONVERSA,
  titulo: "Como foi a semana?",
  ultima_em: "2026-11-03T13:30:00+00:00",
  arquivada_em: null,
  excluida: false,
  casa: { id: "casa-sp", nome: "Bar do Zé", fuso: FUSO },
  mensagens: [
    {
      id: "m1",
      papel: "dono",
      texto: "Como foi a semana?",
      criada_em: "2026-11-03T13:29:00+00:00",
    },
  ],
};

describe("admin: anexos da conversa", () => {
  it("lista os anexos com nome, tipo, tamanho, hora e baixar — e nada além", () => {
    const { container } = render(
      <ConversaDoMentor
        conversa={DETALHE_BASE}
        agoraIso={AGORA}
        anexos={ANEXOS.map((a) => ({
          ...a,
          url: `https://cofre.local/${a.id}`,
        }))}
      />
    );

    const lista = screen.getByRole("list", { name: /anexos da conversa/i });
    expect(within(lista).getByText("cardapio-novo.png")).toBeTruthy();
    expect(within(lista).getByText(/1,5 MB/i)).toBeTruthy();
    expect(within(lista).getByText(/hoje 11:30/i)).toBeTruthy();
    const baixar = within(lista).getByRole("link", {
      name: /baixar cardapio-novo\.png/i,
    });
    expect(baixar.getAttribute("href")).toBe(
      `https://cofre.local/${ANEXOS[0]?.id}`
    );
    // Só leitura: nenhum botão, nenhum campo, nenhum formulário — nem para anexo.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(container.querySelector("form")).toBeNull();
  });

  it("sem anexo, nenhuma lista aparece (igual a hoje)", () => {
    render(<ConversaDoMentor conversa={DETALHE_BASE} agoraIso={AGORA} />);

    expect(
      screen.queryByRole("list", { name: /anexos da conversa/i })
    ).toBeNull();
  });
});
