// @vitest-environment jsdom
import { ConversaDoMentor } from "@/components/admin/conversa-do-mentor";
import { ListaConversasDoMentor } from "@/components/admin/lista-conversas-do-mentor";
import type {
  ConversaParaAdmin,
  DetalheDaConversaParaAdmin,
} from "@/lib/mentor/leitura";
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

const {
  apagar,
  push,
  naoEncontrada,
  exigirAdmin,
  conversasParaAdmin,
  conversaParaAdmin,
  urlParaBaixar,
} = vi.hoisted(() => ({
  apagar: vi.fn(),
  push: vi.fn(),
  naoEncontrada: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  exigirAdmin: vi.fn(),
  conversasParaAdmin: vi.fn(),
  conversaParaAdmin: vi.fn(),
  urlParaBaixar: vi.fn(async () => null),
}));

vi.mock("@/lib/mentor/sessoes-actions", () => ({
  apagarConversaDeVerdade: apagar,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  notFound: naoEncontrada,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/auth/sessao", () => ({ exigirAdmin }));
vi.mock("@/lib/mentor/leitura", () => ({
  conversasParaAdmin,
  conversaParaAdmin,
}));
vi.mock("@/lib/mentor/anexos", () => ({ urlParaBaixar }));

import PaginaConversa from "@/app/admin/mentor/conversas/[id]/page";
import PaginaConversas from "@/app/admin/mentor/conversas/page";

// As conversas do mentor na tela do admin: só leitura, de todas as casas, com a
// hora no fuso de CADA casa. Aqui vale o que a tela decide: o estado vazio, o
// que cada linha mostra, o rótulo de quem falou (o admin lê a fala de outra
// pessoa, então nunca "Você") e que não há nenhum botão nem campo — exceto o
// "Apagar de verdade" no detalhe da excluída, com confirmação dupla. A
// excluída aparece marcada na lista e no detalhe (o suporte precisa vê-la para
// apagar a pedido do cliente).

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

// "Hoje" para a tela: 3 de novembro de 2026, 12:00 em São Paulo (UTC-3).
const AGORA = "2026-11-03T15:00:00+00:00";

const SAO_PAULO = {
  id: "casa-sp",
  nome: "Bar do Zé",
  fuso: "America/Sao_Paulo",
};
const MANAUS = {
  id: "casa-am",
  nome: "Churrasco do Norte",
  fuso: "America/Manaus",
};

const DE_SP: ConversaParaAdmin = {
  id: "11111111-1111-4111-8111-111111111111",
  titulo: "Como foi a semana?",
  ultima_em: "2026-11-03T13:30:00+00:00",
  arquivada_em: null,
  excluida: false,
  casa: SAO_PAULO,
};
const DE_AM: ConversaParaAdmin = {
  id: "22222222-2222-4222-8222-222222222222",
  titulo: "Quanto vendi ontem?",
  ultima_em: "2026-11-03T13:30:00+00:00",
  arquivada_em: null,
  excluida: false,
  casa: MANAUS,
};
const SEM_TITULO: ConversaParaAdmin = {
  id: "33333333-3333-4333-8333-333333333333",
  titulo: null,
  ultima_em: "2026-10-30T14:05:00+00:00",
  arquivada_em: null,
  excluida: false,
  casa: SAO_PAULO,
};
const EXCLUIDA: ConversaParaAdmin = {
  id: "44444444-4444-4444-8444-444444444444",
  titulo: "Conversa apagada pelo dono",
  ultima_em: "2026-11-02T13:30:00+00:00",
  arquivada_em: null,
  excluida: true,
  casa: MANAUS,
};

describe("ListaConversasDoMentor", () => {
  it("sem conversa nenhuma, diz isso em vez de mostrar uma lista vazia", () => {
    render(
      <ListaConversasDoMentor conversas={[]} agoraIso={AGORA} haMais={false} />
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Conversas do mentor" })
    ).toBeTruthy();
    expect(
      screen.getByText(/nenhum dono conversou com o mentor/i)
    ).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("mostra a casa, o título e a hora no fuso de cada casa, na ordem recebida", () => {
    render(
      <ListaConversasDoMentor
        conversas={[DE_SP, DE_AM, SEM_TITULO]}
        agoraIso={AGORA}
        haMais={false}
      />
    );

    const itens = screen.getAllByRole("listitem");
    expect(itens).toHaveLength(3);
    const primeira = within(itens[0] as HTMLElement);
    expect(primeira.getByText("Bar do Zé")).toBeTruthy();
    expect(primeira.getByText("Como foi a semana?")).toBeTruthy();
    // 13:30 UTC: 10:30 em São Paulo, 09:30 em Manaus.
    expect(primeira.getByText("hoje 10:30")).toBeTruthy();
    const segunda = within(itens[1] as HTMLElement);
    expect(segunda.getByText("Churrasco do Norte")).toBeTruthy();
    expect(segunda.getByText("hoje 09:30")).toBeTruthy();
  });

  it("cada linha abre a conversa pelo id", () => {
    render(
      <ListaConversasDoMentor
        conversas={[DE_SP, DE_AM]}
        agoraIso={AGORA}
        haMais={false}
      />
    );

    const links = screen
      .getAllByRole("link")
      .map((l) => l.getAttribute("href"))
      .filter((href) => href?.startsWith("/admin/mentor/conversas/"));
    expect(links).toEqual([
      `/admin/mentor/conversas/${DE_SP.id}`,
      `/admin/mentor/conversas/${DE_AM.id}`,
    ]);
  });

  it("conversa sem título aparece com uma frase no lugar", () => {
    render(
      <ListaConversasDoMentor
        conversas={[SEM_TITULO]}
        agoraIso={AGORA}
        haMais={false}
      />
    );

    expect(screen.getByText("Conversa sem título")).toBeTruthy();
  });

  it("avisa que as anteriores ficam de fora quando a leitura diz que há mais, e só então", () => {
    const { rerender } = render(
      <ListaConversasDoMentor
        conversas={[DE_SP, DE_AM]}
        agoraIso={AGORA}
        haMais
      />
    );
    expect(screen.getByText(/2 conversas mais recentes/i)).toBeTruthy();
    expect(screen.getByText(/anteriores ficam de fora/i)).toBeTruthy();

    // Uma lista cheia, mas sem conversa de fora (exatamente o teto), não avisa.
    rerender(
      <ListaConversasDoMentor
        conversas={[DE_SP, DE_AM]}
        agoraIso={AGORA}
        haMais={false}
      />
    );
    expect(screen.queryByText(/conversas mais recentes/i)).toBeNull();
    expect(screen.queryByText(/ficam de fora/i)).toBeNull();
  });

  it("a excluída aparece na lista, marcada — a não excluída, sem marca", () => {
    render(
      <ListaConversasDoMentor
        conversas={[DE_SP, EXCLUIDA]}
        agoraIso={AGORA}
        haMais={false}
      />
    );

    const itens = screen.getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(within(itens[0] as HTMLElement).queryByText("Excluída")).toBeNull();
    const marcada = within(itens[1] as HTMLElement);
    expect(marcada.getByText("Excluída")).toBeTruthy();
    expect(marcada.getByText("Conversa apagada pelo dono")).toBeTruthy();
  });

  it("é só leitura: nenhum botão, nenhum campo, nenhum formulário", () => {
    const { container } = render(
      <ListaConversasDoMentor
        conversas={[DE_SP, DE_AM]}
        agoraIso={AGORA}
        haMais={false}
      />
    );

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(container.querySelector("form")).toBeNull();
  });
});

describe("guarda das telas (só o admin alcança)", () => {
  beforeEach(() => {
    exigirAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
  });

  it("a lista nem monta sem o admin", async () => {
    await expect(PaginaConversas()).rejects.toThrow("NEXT_REDIRECT");
    expect(conversasParaAdmin).not.toHaveBeenCalled();
  });

  it("o detalhe nem monta sem o admin", async () => {
    await expect(
      PaginaConversa({ params: Promise.resolve({ id: DE_SP.id }) })
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(conversaParaAdmin).not.toHaveBeenCalled();
  });
});

const DETALHE: DetalheDaConversaParaAdmin = {
  ...DE_SP,
  mensagens: [
    {
      id: "m1",
      papel: "dono",
      texto: "Como foi a semana?",
      criada_em: "2026-11-03T13:29:00+00:00",
    },
    {
      id: "m2",
      papel: "mentor",
      texto: "A semana fechou em alta.\nO sábado foi o melhor dia.",
      criada_em: "2026-11-03T13:30:00+00:00",
    },
  ],
};

describe("ConversaDoMentor", () => {
  it("mostra o título, a casa (com link para ela) e quantas mensagens tem", () => {
    render(<ConversaDoMentor conversa={DETALHE} agoraIso={AGORA} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Como foi a semana?" })
    ).toBeTruthy();
    const casa = screen.getByRole("link", { name: "Bar do Zé" });
    expect(casa.getAttribute("href")).toBe("/admin/restaurantes/casa-sp");
    expect(screen.getByText(/2 mensagens/)).toBeTruthy();
  });

  it("volta para a lista de conversas", () => {
    render(<ConversaDoMentor conversa={DETALHE} agoraIso={AGORA} />);

    const voltar = screen.getByRole("link", { name: /Conversas do mentor/ });
    expect(voltar.getAttribute("href")).toBe("/admin/mentor/conversas");
  });

  it("mostra as falas na ordem, com quem falou e a hora no fuso da casa", () => {
    render(<ConversaDoMentor conversa={DETALHE} agoraIso={AGORA} />);

    const falas = within(
      screen.getByRole("list", { name: "Mensagens da conversa" })
    ).getAllByRole("listitem");
    expect(falas).toHaveLength(2);
    expect(falas[0]?.textContent).toContain("Dono");
    expect(falas[0]?.textContent).toContain("hoje 10:29");
    expect(falas[0]?.textContent).toContain("Como foi a semana?");
    expect(falas[1]?.textContent).toContain("Mentor");
    expect(falas[1]?.textContent).toContain("hoje 10:30");
  });

  it("o admin lê a fala de outra pessoa: nunca rotula o dono como 'Você'", () => {
    render(<ConversaDoMentor conversa={DETALHE} agoraIso={AGORA} />);

    expect(screen.queryByText(/Você/)).toBeNull();
  });

  it("renderiza a resposta do mentor como markdown, com as quebras preservadas", () => {
    render(<ConversaDoMentor conversa={DETALHE} agoraIso={AGORA} />);

    const doMentor = within(
      screen.getByRole("list", { name: "Mensagens da conversa" })
    ).getAllByRole("listitem")[1] as HTMLElement;
    // As duas linhas aparecem, separadas por uma quebra de verdade (<br>).
    expect(within(doMentor).getByText("A semana fechou em alta.")).toBeTruthy();
    expect(
      within(doMentor).getByText("O sábado foi o melhor dia.")
    ).toBeTruthy();
    expect(doMentor.querySelector("br")).not.toBeNull();
  });

  it("renderiza negrito do markdown como <strong>, sem o '**' cru", () => {
    const comNegrito: DetalheDaConversaParaAdmin = {
      ...DETALHE,
      mensagens: [
        {
          id: "m1",
          papel: "mentor",
          texto: "Ontem fechou com **R$ 6.101,90**.",
          criada_em: "2026-11-03T13:30:00+00:00",
        },
      ],
    };
    render(<ConversaDoMentor conversa={comNegrito} agoraIso={AGORA} />);

    const forte = screen.getByText("R$ 6.101,90");
    expect(forte.tagName).toBe("STRONG");
    expect(document.body.textContent).not.toContain("**");
  });

  it("conversa sem mensagem diz isso, em vez de uma tela em branco", () => {
    render(
      <ConversaDoMentor
        conversa={{ ...DETALHE, mensagens: [] }}
        agoraIso={AGORA}
      />
    );

    expect(screen.getByText(/ainda não tem mensagens/i)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Mensagens da conversa" })).toBe(
      null
    );
  });

  it("conversa sem título aparece com uma frase no lugar", () => {
    render(
      <ConversaDoMentor
        conversa={{ ...DETALHE, titulo: null }}
        agoraIso={AGORA}
      />
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Conversa sem título" })
    ).toBeTruthy();
  });

  it("uma mensagem só fica no singular", () => {
    render(
      <ConversaDoMentor
        conversa={{ ...DETALHE, mensagens: DETALHE.mensagens.slice(0, 1) }}
        agoraIso={AGORA}
      />
    );

    expect(screen.getByText(/1 mensagem(?!s)/)).toBeTruthy();
  });

  it("é só leitura: nenhum botão, nenhum campo, nenhum formulário", () => {
    const { container } = render(
      <ConversaDoMentor conversa={DETALHE} agoraIso={AGORA} />
    );

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(container.querySelector("form")).toBeNull();
  });
});

describe("ConversaDoMentor: anexos", () => {
  const ANEXOS = [
    {
      id: "a1111111-1111-4111-8111-111111111111",
      nome: "cardapio-novo.png",
      tipo: "imagem" as const,
      tamanho_bytes: 204_800,
      criada_em: "2026-11-03T14:30:00+00:00",
      url: "https://cofre.local/a1111111",
    },
    {
      id: "b2222222-2222-4222-8222-222222222222",
      nome: "fechamento-outubro.pdf",
      tipo: "pdf" as const,
      tamanho_bytes: 1_572_864,
      criada_em: "2026-11-03T14:31:00+00:00",
      url: "https://cofre.local/b2222222",
    },
  ];

  it("lista os anexos com nome, tipo, tamanho, hora no fuso e baixar", () => {
    render(
      <ConversaDoMentor conversa={DETALHE} agoraIso={AGORA} anexos={ANEXOS} />
    );

    const lista = screen.getByRole("list", { name: /anexos da conversa/i });
    expect(within(lista).getByText("cardapio-novo.png")).toBeTruthy();
    expect(within(lista).getByText(/imagem/i)).toBeTruthy();
    expect(within(lista).getByText(/200 KB/i)).toBeTruthy();
    expect(within(lista).getByText(/1,5 MB/i)).toBeTruthy();
    // 14:30 UTC: 11:30 em São Paulo, no relógio da casa.
    expect(within(lista).getByText(/hoje 11:30/i)).toBeTruthy();
    const baixar = within(lista).getByRole("link", {
      name: /baixar cardapio-novo\.png/i,
    });
    expect(baixar.getAttribute("href")).toBe("https://cofre.local/a1111111");
  });

  it("é só leitura com anexo: link de baixar, nenhum botão, campo ou formulário", () => {
    const { container } = render(
      <ConversaDoMentor conversa={DETALHE} agoraIso={AGORA} anexos={ANEXOS} />
    );

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(container.querySelector("form")).toBeNull();
  });

  it("sem anexo, nenhuma lista aparece (igual a hoje)", () => {
    render(<ConversaDoMentor conversa={DETALHE} agoraIso={AGORA} />);

    expect(
      screen.queryByRole("list", { name: /anexos da conversa/i })
    ).toBeNull();
  });

  it("sem link assinado, o nome continua visível e a tela pede para recarregar", () => {
    render(
      <ConversaDoMentor
        conversa={DETALHE}
        agoraIso={AGORA}
        anexos={ANEXOS.slice(0, 1).map((a) => ({ ...a, url: null }))}
      />
    );

    expect(screen.getByText("cardapio-novo.png")).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: /baixar cardapio-novo\.png/i })
    ).toBeNull();
    expect(screen.getByText(/recarregue a página/i)).toBeTruthy();
  });
});
const DETALHE_EXCLUIDO: DetalheDaConversaParaAdmin = {
  ...DETALHE,
  id: EXCLUIDA.id,
  titulo: "Conversa apagada pelo dono",
  excluida: true,
};

async function clicar(nome: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nome }));
  });
}

describe("detalhe da excluída no admin", () => {
  it("mostra a marca de excluída e o prazo da cópia de segurança", () => {
    render(<ConversaDoMentor conversa={DETALHE_EXCLUIDO} agoraIso={AGORA} />);

    expect(screen.getByText("Excluída")).toBeTruthy();
    expect(screen.getByText(/60 dias/)).toBeTruthy();
  });

  it("sem exclusão, não há marca nem botão de apagar", () => {
    render(<ConversaDoMentor conversa={DETALHE} agoraIso={AGORA} />);

    expect(screen.queryByText("Excluída")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /apagar de verdade/i })
    ).toBeNull();
  });
});

describe("apagar de verdade no admin", () => {
  it("pede duas confirmações e só então apaga pela ação e volta para a lista", async () => {
    apagar.mockResolvedValue({ ok: true });
    render(<ConversaDoMentor conversa={DETALHE_EXCLUIDO} agoraIso={AGORA} />);

    fireEvent.click(screen.getByRole("button", { name: "Apagar de verdade" }));
    expect(screen.getByText(/sai da lista do admin/i)).toBeTruthy();
    expect(apagar).not.toHaveBeenCalled();

    await clicar("Continuar");
    expect(
      screen.getByText(/some para sempre, inclusive da cópia de segurança/i)
    ).toBeTruthy();
    expect(apagar).not.toHaveBeenCalled();

    await clicar("Apagar para sempre");
    await waitFor(() =>
      expect(apagar).toHaveBeenCalledWith(DETALHE_EXCLUIDO.id)
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/admin/mentor/conversas")
    );
  });

  it("cancelar na primeira confirmação desiste sem chamar o servidor", () => {
    render(<ConversaDoMentor conversa={DETALHE_EXCLUIDO} agoraIso={AGORA} />);

    fireEvent.click(screen.getByRole("button", { name: "Apagar de verdade" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Apagar de verdade" })
    ).toBeTruthy();
    expect(apagar).not.toHaveBeenCalled();
  });

  it("cancelar na segunda confirmação volta ao começo, sem apagar", () => {
    render(<ConversaDoMentor conversa={DETALHE_EXCLUIDO} agoraIso={AGORA} />);

    fireEvent.click(screen.getByRole("button", { name: "Apagar de verdade" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      screen.getByText(/some para sempre, inclusive da cópia de segurança/i)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.queryByText(/some para sempre, inclusive da cópia de segurança/i)
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Apagar de verdade" })
    ).toBeTruthy();
    expect(apagar).not.toHaveBeenCalled();
  });

  it("erro do servidor aparece e continua na conversa", async () => {
    apagar.mockResolvedValue({
      ok: false,
      error:
        "não foi possível apagar a conversa agora. Tente de novo em instantes.",
    });
    render(<ConversaDoMentor conversa={DETALHE_EXCLUIDO} agoraIso={AGORA} />);

    fireEvent.click(screen.getByRole("button", { name: "Apagar de verdade" }));
    await clicar("Continuar");
    await clicar("Apagar para sempre");

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /não foi possível apagar/i
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("erro velho não reaparece: cancelar limpa o erro e reabrir começa limpo", async () => {
    apagar.mockResolvedValue({
      ok: false,
      error:
        "não foi possível apagar a conversa agora. Tente de novo em instantes.",
    });
    render(<ConversaDoMentor conversa={DETALHE_EXCLUIDO} agoraIso={AGORA} />);

    fireEvent.click(screen.getByRole("button", { name: "Apagar de verdade" }));
    await clicar("Continuar");
    await clicar("Apagar para sempre");
    expect(await screen.findByRole("alert")).toBeTruthy();

    // Cancelar limpa o erro na hora.
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alert")).toBeNull();

    // Reabrir começa limpo, sem o erro velho.
    fireEvent.click(screen.getByRole("button", { name: "Apagar de verdade" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/sai da lista do admin/i)).toBeTruthy();
    expect(apagar).toHaveBeenCalledTimes(1);
  });
});
