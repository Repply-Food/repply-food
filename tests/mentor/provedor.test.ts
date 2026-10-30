// @vitest-environment node
import type { GenerateContentParameters } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { escolherProvedor } from "../../lib/mentor/provedor";
import {
  type ClienteGemini,
  MODELO_PADRAO,
  ProvedorGemini,
  type RespostaBruta,
} from "../../lib/mentor/provedor/gemini";
import type {
  MensagemIA,
  ProvedorIA,
  RespostaIA,
} from "../../lib/mentor/provedor/tipos";

// Nenhum teste aqui chama a API do Gemini de verdade: só dublês.

const historico: MensagemIA[] = [
  { papel: "dono", texto: "Como foi o faturamento de ontem?" },
];

function dubleDeProvedor(resposta: RespostaIA): ProvedorIA {
  return { responder: async () => resposta };
}

function respostaValida(resposta: RespostaIA): boolean {
  if (resposta.tipo === "texto") return typeof resposta.texto === "string";
  return (
    Array.isArray(resposta.pedidos) &&
    resposta.pedidos.every(
      (pedido) =>
        typeof pedido.nome === "string" && typeof pedido.argumentos === "object"
    )
  );
}

describe("contrato do ProvedorIA (com dublê)", () => {
  it("devolve texto para um histórico", async () => {
    const provedor = dubleDeProvedor({
      tipo: "texto",
      texto: "Foi um bom dia.",
    });

    const resposta = await provedor.responder({
      instrucoes: "Você é o mentor da casa.",
      historico,
      ferramentas: [],
    });

    expect(resposta).toEqual({ tipo: "texto", texto: "Foi um bom dia." });
    expect(respostaValida(resposta)).toBe(true);
  });

  it("devolve pedidos de ferramenta para um histórico", async () => {
    const provedor = dubleDeProvedor({
      tipo: "ferramenta",
      pedidos: [{ nome: "faturamento_do_dia", argumentos: { dia: "ontem" } }],
    });

    const resposta = await provedor.responder({
      instrucoes: "Você é o mentor da casa.",
      historico,
      ferramentas: [
        {
          nome: "faturamento_do_dia",
          descricao: "Faturamento da casa em um dia.",
          parametros: { type: "object", properties: {} },
        },
      ],
    });

    expect(resposta.tipo).toBe("ferramenta");
    expect(respostaValida(resposta)).toBe(true);
  });
});

describe("escolherProvedor", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sem MENTOR_IA_CHAVE, não quebra ao escolher e lança erro claro ao responder", async () => {
    vi.stubEnv("MENTOR_IA_CHAVE", "");

    const provedor = escolherProvedor();

    await expect(
      provedor.responder({ instrucoes: "x", historico, ferramentas: [] })
    ).rejects.toThrow("MENTOR_IA_CHAVE ausente");
  });

  it("com a chave, devolve um provedor sem chamar a API", () => {
    vi.stubEnv("MENTOR_IA_CHAVE", "chave-de-teste");

    const provedor = escolherProvedor();

    expect(typeof provedor.responder).toBe("function");
  });

  it("com provedor desconhecido, lança erro claro ao responder", async () => {
    vi.stubEnv("MENTOR_IA_CHAVE", "chave-de-teste");
    vi.stubEnv("MENTOR_IA_PROVEDOR", "inexistente");

    const provedor = escolherProvedor();

    await expect(
      provedor.responder({ instrucoes: "x", historico, ferramentas: [] })
    ).rejects.toThrow("MENTOR_IA_PROVEDOR desconhecido");
  });
});

describe("ProvedorGemini (com cliente falso, sem rede)", () => {
  const ferramentas = [
    {
      nome: "faturamento_do_dia",
      descricao: "Faturamento da casa em um dia.",
      parametros: {
        type: "object",
        properties: { dia: { type: "string" } },
        required: ["dia"],
      },
    },
  ];

  function clienteFalso(respostas: RespostaBruta[]) {
    const chamadas: GenerateContentParameters[] = [];
    const fila = [...respostas];
    const cliente: ClienteGemini = {
      models: {
        generateContent: async (parametros) => {
          chamadas.push(parametros);
          const proxima = fila.shift();
          if (!proxima) throw new Error("sem resposta combinada no teste");
          return proxima;
        },
      },
    };
    return { cliente, chamadas };
  }

  function texto(conteudo: string): RespostaBruta {
    return { candidates: [{ content: { parts: [{ text: conteudo }] } }] };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("monta o pedido: instruções, histórico, ferramentas e modelo padrão", async () => {
    vi.stubEnv("MENTOR_IA_MODELO", "");
    const { cliente, chamadas } = clienteFalso([texto("Foi bom.")]);
    const provedor = new ProvedorGemini({ chave: "chave-de-teste", cliente });

    await provedor.responder({
      instrucoes: "Trilhos e cartilha.",
      historico: [
        { papel: "dono", texto: "Oi" },
        { papel: "mentor", texto: "Olá, dono." },
        { papel: "dono", texto: "Como foi ontem?" },
      ],
      ferramentas,
    });

    expect(chamadas).toHaveLength(1);
    const pedido = chamadas.at(0);
    expect(pedido?.model).toBe(MODELO_PADRAO);
    expect(pedido?.contents).toEqual([
      { role: "user", parts: [{ text: "Oi" }] },
      { role: "model", parts: [{ text: "Olá, dono." }] },
      { role: "user", parts: [{ text: "Como foi ontem?" }] },
    ]);
    expect(pedido?.config?.systemInstruction).toBe("Trilhos e cartilha.");
    expect(pedido?.config?.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: "faturamento_do_dia",
            description: "Faturamento da casa em um dia.",
            parametersJsonSchema: ferramentas.at(0)?.parametros,
          },
        ],
      },
    ]);
  });

  it("usa o modelo de MENTOR_IA_MODELO quando definido", async () => {
    vi.stubEnv("MENTOR_IA_MODELO", "gemini-um-modelo-qualquer");
    const { cliente, chamadas } = clienteFalso([texto("ok")]);
    const provedor = new ProvedorGemini({ chave: "chave-de-teste", cliente });

    await provedor.responder({ instrucoes: "x", historico, ferramentas: [] });

    expect(chamadas.at(0)?.model).toBe("gemini-um-modelo-qualquer");
  });

  it("sem ferramentas, não manda a lista de ferramentas", async () => {
    const { cliente, chamadas } = clienteFalso([texto("ok")]);
    const provedor = new ProvedorGemini({ chave: "chave-de-teste", cliente });

    await provedor.responder({ instrucoes: "x", historico, ferramentas: [] });

    expect(chamadas.at(0)?.config?.tools).toBeUndefined();
  });

  it("devolve o texto do modelo e ignora os pensamentos", async () => {
    const { cliente } = clienteFalso([
      {
        candidates: [
          {
            content: {
              parts: [
                { text: "raciocínio interno", thought: true },
                { text: "Ontem a casa " },
                { text: "faturou bem." },
              ],
            },
          },
        ],
      },
    ]);
    const provedor = new ProvedorGemini({ chave: "chave-de-teste", cliente });

    const resposta = await provedor.responder({
      instrucoes: "x",
      historico,
      ferramentas,
    });

    expect(resposta).toEqual({
      tipo: "texto",
      texto: "Ontem a casa faturou bem.",
    });
  });

  it("devolve os pedidos de ferramenta quando o modelo chama funções", async () => {
    const { cliente } = clienteFalso([
      {
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                { text: "Vou olhar." },
                {
                  functionCall: {
                    name: "faturamento_do_dia",
                    args: { dia: "ontem" },
                  },
                },
                { functionCall: { name: "sem_argumentos" } },
              ],
            },
          },
        ],
      },
    ]);
    const provedor = new ProvedorGemini({ chave: "chave-de-teste", cliente });

    const resposta = await provedor.responder({
      instrucoes: "x",
      historico,
      ferramentas,
    });

    expect(resposta).toEqual({
      tipo: "ferramenta",
      pedidos: [
        { nome: "faturamento_do_dia", argumentos: { dia: "ontem" } },
        { nome: "sem_argumentos", argumentos: {} },
      ],
    });
  });

  it("devolve os resultados repetindo o turno do modelo exatamente como veio", async () => {
    const turnoDoModelo = {
      role: "model",
      parts: [
        {
          functionCall: {
            id: "chamada-1",
            name: "faturamento_do_dia",
            args: { dia: "ontem" },
          },
          thoughtSignature: "assinatura-opaca",
        },
      ],
    };
    const { cliente, chamadas } = clienteFalso([
      { candidates: [{ content: turnoDoModelo }] },
      texto("Foram R$ 1.000,00."),
    ]);
    const provedor = new ProvedorGemini({ chave: "chave-de-teste", cliente });

    const primeira = await provedor.responder({
      instrucoes: "x",
      historico,
      ferramentas,
    });
    expect(primeira.tipo).toBe("ferramenta");

    const segunda = await provedor.responder({
      instrucoes: "x",
      historico,
      ferramentas,
      resultados: [
        { nome: "faturamento_do_dia", resultado: { total: "1000.00" } },
      ],
    });

    expect(segunda).toEqual({ tipo: "texto", texto: "Foram R$ 1.000,00." });
    expect(chamadas.at(1)?.contents).toEqual([
      { role: "user", parts: [{ text: "Como foi o faturamento de ontem?" }] },
      turnoDoModelo,
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              id: "chamada-1",
              name: "faturamento_do_dia",
              response: { output: { total: "1000.00" } },
            },
          },
        ],
      },
    ]);
  });

  it("sem o turno anterior na memória, reconstrói o pedido de função pelo nome", async () => {
    const { cliente, chamadas } = clienteFalso([texto("Pronto.")]);
    const provedor = new ProvedorGemini({ chave: "chave-de-teste", cliente });

    await provedor.responder({
      instrucoes: "x",
      historico,
      ferramentas,
      resultados: [
        { nome: "faturamento_do_dia", resultado: [1, 2, 3] },
        { nome: "contas_esquecidas", resultado: null },
      ],
    });

    expect(chamadas.at(0)?.contents).toEqual([
      { role: "user", parts: [{ text: "Como foi o faturamento de ontem?" }] },
      {
        role: "model",
        parts: [
          { functionCall: { name: "faturamento_do_dia", args: {} } },
          { functionCall: { name: "contas_esquecidas", args: {} } },
        ],
      },
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: "faturamento_do_dia",
              response: { output: [1, 2, 3] },
            },
          },
          {
            functionResponse: {
              name: "contas_esquecidas",
              response: { output: null },
            },
          },
        ],
      },
    ]);
  });

  it("lança erro claro quando o modelo não devolve nada", async () => {
    const { cliente } = clienteFalso([{ candidates: [] }]);
    const provedor = new ProvedorGemini({ chave: "chave-de-teste", cliente });

    await expect(
      provedor.responder({ instrucoes: "x", historico, ferramentas })
    ).rejects.toThrow("Resposta vazia do provedor");
  });

  it("sem chave e sem cliente, não monta o provedor", () => {
    vi.stubEnv("MENTOR_IA_CHAVE", "");

    expect(() => new ProvedorGemini()).toThrow("MENTOR_IA_CHAVE ausente");
  });

  it("escolherProvedor com a chave devolve o Gemini", () => {
    vi.stubEnv("MENTOR_IA_CHAVE", "chave-de-teste");
    vi.stubEnv("MENTOR_IA_PROVEDOR", "");

    expect(escolherProvedor()).toBeInstanceOf(ProvedorGemini);
  });
});
