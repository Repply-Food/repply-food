// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// A Server Action é a FRONTEIRA de segurança da tela do mentor: ela mesma
// confere o modo leitura do admin, valida o texto e tira o restaurante da
// sessão. Aqui o cérebro (`responderNoMentor`) e o guarda (`exigirCasa`) são
// dublês para provar que a action NÃO confia na tela.

const { exigirCasa, responderNoMentor } = vi.hoisted(() => ({
  exigirCasa: vi.fn(),
  responderNoMentor: vi.fn(),
}));
const { validarArquivos } = vi.hoisted(() => ({ validarArquivos: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/mentor/conversa", () => ({ responderNoMentor }));
// A action confere a regra dos arquivos antes de chamar o cérebro: sem gastar
// o limite e sem chamar a IA quando o anexo é inválido.
vi.mock("@/lib/mentor/anexos", () => ({ validarArquivos }));

import { enviarMensagemAction } from "@/lib/mentor/enviar-action";

const CASA = "11111111-1111-4111-8111-111111111111";
const CONVERSA = "22222222-2222-4222-8222-222222222222";

function dono() {
  exigirCasa.mockResolvedValue({
    casa: { id: CASA, modulos: ["mentor"] },
    modoAdmin: false,
    sessao: {},
  });
}
function admin() {
  exigirCasa.mockResolvedValue({
    casa: { id: CASA, modulos: ["mentor"] },
    modoAdmin: true,
    sessao: {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  validarArquivos.mockReturnValue({ ok: true, arquivos: [] });
});

describe("enviarMensagemAction", () => {
  it("passa o restaurante da SESSÃO ao cérebro e devolve a resposta", async () => {
    dono();
    responderNoMentor.mockResolvedValue({
      ok: true,
      conversaId: CONVERSA,
      resposta: "A semana fechou em alta.",
      anexosFalharam: false,
    });

    const r = await enviarMensagemAction(
      "bar-do-ze",
      null,
      "Como foi a semana?"
    );

    expect(r).toEqual({
      ok: true,
      data: {
        conversaId: CONVERSA,
        resposta: "A semana fechou em alta.",
        anexosFalharam: false,
      },
    });
    expect(exigirCasa).toHaveBeenCalledWith("bar-do-ze");
    expect(responderNoMentor).toHaveBeenCalledTimes(1);
    expect(responderNoMentor).toHaveBeenCalledWith({
      restauranteId: CASA,
      conversaId: null,
      mensagemDoDono: "Como foi a semana?",
    });
  });

  it("continua a conversa informada e entrega o texto já aparado", async () => {
    dono();
    responderNoMentor.mockResolvedValue({
      ok: true,
      conversaId: CONVERSA,
      resposta: "ok",
    });

    await enviarMensagemAction("bar-do-ze", CONVERSA, "  e ontem?  ");

    expect(responderNoMentor).toHaveBeenCalledWith({
      restauranteId: CASA,
      conversaId: CONVERSA,
      mensagemDoDono: "e ontem?",
    });
  });

  it("não deixa o chamador escolher o provedor de IA", async () => {
    dono();
    responderNoMentor.mockResolvedValue({
      ok: true,
      conversaId: CONVERSA,
      resposta: "ok",
    });

    await enviarMensagemAction("bar-do-ze", null, "oi");

    const entrada = responderNoMentor.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect("provedor" in entrada).toBe(false);
  });

  it("recusa o admin no modo leitura SEM chamar o cérebro", async () => {
    admin();

    const r = await enviarMensagemAction("bar-do-ze", null, "Como foi?");

    expect(r).toEqual({
      ok: false,
      error: "no modo leitura do admin o mentor não responde",
    });
    expect(responderNoMentor).not.toHaveBeenCalled();
  });

  it("recusa quando a casa não tem o módulo mentor, SEM chamar o cérebro", async () => {
    exigirCasa.mockResolvedValue({
      casa: { id: CASA, modulos: [] },
      modoAdmin: false,
      sessao: {},
    });

    const r = await enviarMensagemAction(
      "bar-do-ze",
      null,
      "Como foi a semana?"
    );

    expect(r).toEqual({
      ok: false,
      error: "o mentor não está disponível nesta casa",
    });
    expect(responderNoMentor).not.toHaveBeenCalled();
  });

  it("repassa a frase de erro do cérebro", async () => {
    dono();
    responderNoMentor.mockResolvedValue({
      ok: false,
      error: "você já usou bastante o mentor hoje; ele volta amanhã",
    });

    const r = await enviarMensagemAction("bar-do-ze", null, "Como foi?");

    expect(r).toEqual({
      ok: false,
      error: "você já usou bastante o mentor hoje; ele volta amanhã",
    });
  });

  it.each([
    ["vazio", ""],
    ["só espaços", "   \n  "],
  ])("texto %s vira frase de produto sem chamar o cérebro", async (_n, t) => {
    dono();

    const r = await enviarMensagemAction("bar-do-ze", null, t);

    expect(r).toEqual({
      ok: false,
      error: "escreva sua pergunta para o mentor",
    });
    expect(responderNoMentor).not.toHaveBeenCalled();
  });

  it("texto maior que 4000 caracteres vira frase de produto sem chamar o cérebro", async () => {
    dono();

    const r = await enviarMensagemAction("bar-do-ze", null, "a".repeat(4001));

    expect(r).toEqual({
      ok: false,
      error: "sua pergunta ficou longa demais; resuma em até 4000 caracteres",
    });
    expect(responderNoMentor).not.toHaveBeenCalled();
  });

  it("aceita exatamente 4000 caracteres", async () => {
    dono();
    responderNoMentor.mockResolvedValue({
      ok: true,
      conversaId: CONVERSA,
      resposta: "ok",
    });

    const r = await enviarMensagemAction("bar-do-ze", null, "a".repeat(4000));

    expect(r.ok).toBe(true);
    expect(responderNoMentor).toHaveBeenCalledTimes(1);
  });

  it("texto que não é string (chamada forjada) vira frase de produto", async () => {
    dono();

    const r = await enviarMensagemAction("bar-do-ze", null, {
      texto: "oi",
    } as unknown as string);

    expect(r).toEqual({
      ok: false,
      error: "escreva sua pergunta para o mentor",
    });
    expect(responderNoMentor).not.toHaveBeenCalled();
  });

  it("o texto inválido do admin também nem chega a ser validado: modo leitura vem primeiro", async () => {
    admin();

    const r = await enviarMensagemAction("bar-do-ze", null, "");

    expect(r).toEqual({
      ok: false,
      error: "no modo leitura do admin o mentor não responde",
    });
    expect(responderNoMentor).not.toHaveBeenCalled();
  });

  describe("com arquivos", () => {
    const foto = () =>
      new File([new TextEncoder().encode("bytes-da-foto")], "foto.png", {
        type: "image/png",
      });

    it("repassa os arquivos ao cérebro e devolve o aviso de anexo com a resposta", async () => {
      dono();
      responderNoMentor.mockResolvedValue({
        ok: true,
        conversaId: CONVERSA,
        resposta: "Vi a foto.",
        anexosFalharam: true,
      });
      const arquivos = [foto()];

      const r = await enviarMensagemAction("bar-do-ze", null, "Olha", arquivos);

      expect(validarArquivos).toHaveBeenCalledWith(arquivos);
      expect(responderNoMentor).toHaveBeenCalledWith({
        restauranteId: CASA,
        conversaId: null,
        mensagemDoDono: "Olha",
        arquivos,
      });
      expect(r).toEqual({
        ok: true,
        data: {
          conversaId: CONVERSA,
          resposta: "Vi a foto.",
          anexosFalharam: true,
        },
      });
    });

    it("arquivo fora da regra recusa com a frase, sem chamar o cérebro", async () => {
      dono();
      validarArquivos.mockReturnValueOnce({
        ok: false,
        error: "dá para mandar até 5 arquivos por pergunta",
      });

      const r = await enviarMensagemAction("bar-do-ze", null, "Olha", [foto()]);

      expect(r).toEqual({
        ok: false,
        error: "dá para mandar até 5 arquivos por pergunta",
      });
      expect(responderNoMentor).not.toHaveBeenCalled();
    });

    it("sem arquivos, não valida nada e o cérebro recebe sem o campo", async () => {
      dono();
      responderNoMentor.mockResolvedValue({
        ok: true,
        conversaId: CONVERSA,
        resposta: "ok",
        anexosFalharam: false,
      });

      await enviarMensagemAction("bar-do-ze", null, "oi");

      expect(validarArquivos).not.toHaveBeenCalled();
      expect(responderNoMentor).toHaveBeenCalledWith({
        restauranteId: CASA,
        conversaId: null,
        mensagemDoDono: "oi",
        arquivos: undefined,
      });
    });
  });
});
