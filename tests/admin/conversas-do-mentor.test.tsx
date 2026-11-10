// @vitest-environment jsdom
import { ConversaDoMentor } from "@/components/admin/conversa-do-mentor";
import { ListaConversasDoMentor } from "@/components/admin/lista-conversas-do-mentor";
import type {
  ConversaParaAdmin,
  DetalheDaConversaParaAdmin,
} from "@/lib/mentor/leitura";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// As conversas do mentor na tela do admin: só leitura, de todas as casas, com a
// hora no fuso de CADA casa. Aqui vale o que a tela decide: o estado vazio, o
// que cada linha mostra, o rótulo de quem falou (o admin lê a fala de outra
// pessoa, então nunca "Você") e que não há nenhum botão nem campo.

afterEach(cleanup);

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
