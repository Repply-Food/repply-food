// @vitest-environment node
import { Children, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { exigirCasa } = vi.hoisted(() => ({ exigirCasa: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/mentor/leitura", () => ({
  conversasDaCasa: vi.fn(async () => []),
  mensagensDaConversa: vi.fn(async () => []),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import PaginaMentor from "@/app/r/[slug]/mentor/page";
import { conversasDaCasa, mensagensDaConversa } from "@/lib/mentor/leitura";

const conversasMock = vi.mocked(conversasDaCasa);
const mensagensMock = vi.mocked(mensagensDaConversa);

afterEach(() => vi.clearAllMocks());

const params = Promise.resolve({ slug: "bar-do-ze" });

describe("guarda da rota do mentor", () => {
  it("404 quando a casa não tem o módulo", async () => {
    exigirCasa.mockResolvedValue({
      casa: { id: "c1", slug: "bar-do-ze", modulos: [] },
      modoAdmin: false,
    });
    await expect(PaginaMentor({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("renderiza quando a casa tem o módulo", async () => {
    exigirCasa.mockResolvedValue({
      casa: { id: "c1", slug: "bar-do-ze", modulos: ["mentor"] },
      modoAdmin: false,
    });
    const elemento = await PaginaMentor({ params });
    expect(elemento).toBeTruthy();
  });
});

describe("página do mentor: qual conversa abre", () => {
  const CASA = {
    casa: {
      id: "c1",
      slug: "bar-do-ze",
      fuso: "America/Sao_Paulo",
      modulos: ["mentor"],
    },
    modoAdmin: false,
  };
  const ABERTA_NOVA = {
    id: "11111111-1111-4111-8111-111111111111",
    titulo: "Como foi a semana?",
    ultima_em: "2026-11-03T13:30:00+00:00",
    arquivada_em: null,
  };
  const ABERTA_VELHA = {
    id: "22222222-2222-4222-8222-222222222222",
    titulo: "Quanto vendi ontem?",
    ultima_em: "2026-11-02T13:30:00+00:00",
    arquivada_em: null,
  };
  const GUARDADA = {
    id: "33333333-3333-4333-8333-333333333333",
    titulo: "Conversa de setembro",
    ultima_em: "2026-09-20T14:05:00+00:00",
    arquivada_em: "2026-10-01T12:00:00+00:00",
  };
  const MSGS = [
    {
      id: "m1",
      papel: "dono" as const,
      texto: "oi",
      criada_em: "2026-11-03T13:29:00",
    },
  ];

  // A página é um componente de servidor: aqui vale a fiação (qual conversa a
  // lista marca e qual mensagem o chat recebe), não o HTML.
  function filhosDe(elemento: ReactElement): ReactElement[] {
    return Children.toArray(
      (elemento.props as { children?: ReactNode }).children
    ).filter((filho): filho is ReactElement => typeof filho !== "string");
  }

  function paineis(raiz: ReactElement): {
    lista: ReactElement;
    chat: ReactElement;
    comVolta: boolean;
  } {
    const colunas = filhosDe(filhosDe(raiz)[1] as ReactElement);
    const direita = filhosDe(colunas[1] as ReactElement);
    return {
      lista: filhosDe(colunas[0] as ReactElement)[0] as ReactElement,
      chat: direita[direita.length - 1] as ReactElement,
      comVolta: direita.length === 2,
    };
  }

  it("sem escolha no endereço, não abre ninguém: a lista separa abertas e arquivadas, o chat fica no vazio sem ler mensagem", async () => {
    exigirCasa.mockResolvedValue(CASA);
    conversasMock.mockResolvedValue([ABERTA_NOVA, GUARDADA, ABERTA_VELHA]);
    const { lista, chat, comVolta } = paineis(await PaginaMentor({ params }));

    expect(lista.props).toMatchObject({
      conversas: [ABERTA_NOVA, ABERTA_VELHA],
      arquivadas: [GUARDADA],
      ativaId: null,
    });
    expect(chat.props).toMatchObject({
      conversaId: null,
      mensagensIniciais: [],
    });
    expect(comVolta).toBe(false);
    expect(mensagensMock).not.toHaveBeenCalled();
  });

  it("?conversa= abre a conversa (mesmo arquivada) com as mensagens dela", async () => {
    exigirCasa.mockResolvedValue(CASA);
    conversasMock.mockResolvedValue([ABERTA_NOVA, GUARDADA, ABERTA_VELHA]);
    mensagensMock.mockResolvedValue(MSGS);
    const { lista, chat, comVolta } = paineis(
      await PaginaMentor({
        params,
        searchParams: Promise.resolve({ conversa: GUARDADA.id }),
      })
    );

    expect(mensagensMock).toHaveBeenCalledWith(GUARDADA.id, "c1");
    expect(lista.props).toMatchObject({ ativaId: GUARDADA.id });
    expect(chat.props).toMatchObject({
      conversaId: GUARDADA.id,
      mensagensIniciais: MSGS,
    });
    expect(chat.key).toContain(GUARDADA.id);
    expect(comVolta).toBe(true);
  });

  it("id desconhecido (ou de conversa excluída) cai na lista, nunca em conversa alheia", async () => {
    exigirCasa.mockResolvedValue(CASA);
    conversasMock.mockResolvedValue([ABERTA_NOVA, ABERTA_VELHA]);
    const { lista, chat } = paineis(
      await PaginaMentor({
        params,
        searchParams: Promise.resolve({
          conversa: "99999999-9999-4999-8999-999999999999",
        }),
      })
    );

    expect(lista.props).toMatchObject({ ativaId: null });
    expect(chat.props).toMatchObject({ conversaId: null });
    expect(mensagensMock).not.toHaveBeenCalled();
  });

  it("?nova=1 mostra o chat vazio, com volta para a lista", async () => {
    exigirCasa.mockResolvedValue(CASA);
    conversasMock.mockResolvedValue([ABERTA_NOVA]);
    const { chat, comVolta } = paineis(
      await PaginaMentor({
        params,
        searchParams: Promise.resolve({ nova: "1" }),
      })
    );

    expect(chat.props).toMatchObject({ conversaId: null });
    expect(chat.key).toContain("nova");
    expect(comVolta).toBe(true);
  });
});
