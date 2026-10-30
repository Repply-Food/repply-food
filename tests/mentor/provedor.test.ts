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

// `server-only` só existe dentro do Next; no Vitest entra um vazio.
vi.mock("server-only", () => ({}));

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

  describe("cadeia de 2 ou mais rodadas de ferramenta", () => {
    const turnoDaRodada1 = {
      role: "model",
      parts: [
        {
          functionCall: {
            id: "chamada-r1",
            name: "faturamento_do_dia",
            args: { dia: "2026-10-29" },
          },
          thoughtSignature: "assinatura-r1",
        },
      ],
    };
    const turnoDaRodada2 = {
      role: "model",
      parts: [
        {
          functionCall: {
            id: "chamada-r2",
            name: "contas_esquecidas",
            args: {},
          },
          thoughtSignature: "assinatura-r2",
        },
      ],
    };
    const respostaR1 = {
      role: "user",
      parts: [
        {
          functionResponse: {
            id: "chamada-r1",
            name: "faturamento_do_dia",
            response: { output: { total: "1000.00" } },
          },
        },
      ],
    };
    const respostaR2 = {
      role: "user",
      parts: [
        {
          functionResponse: {
            id: "chamada-r2",
            name: "contas_esquecidas",
            response: { output: { quantidade: 2 } },
          },
        },
      ],
    };
    const pergunta = {
      role: "user",
      parts: [{ text: "Como foi o faturamento de ontem?" }],
    };

    const entrada = (resultados?: { nome: string; resultado: unknown }[]) => ({
      instrucoes: "x",
      historico,
      ferramentas,
      ...(resultados ? { resultados } : {}),
    });

    it("a 3ª chamada ainda leva o resultado da rodada 1 (e o turno do modelo dela)", async () => {
      const { cliente, chamadas } = clienteFalso([
        { candidates: [{ content: turnoDaRodada1 }] },
        { candidates: [{ content: turnoDaRodada2 }] },
        texto("Foram R$ 1.000,00 e 2 contas esquecidas."),
      ]);
      const provedor = new ProvedorGemini({ chave: "chave-de-teste", cliente });

      // Imita o laço do cérebro: a mesma instância, resultados a cada rodada.
      const primeira = await provedor.responder(entrada());
      expect(primeira.tipo).toBe("ferramenta");
      const segunda = await provedor.responder(
        entrada([
          { nome: "faturamento_do_dia", resultado: { total: "1000.00" } },
        ])
      );
      expect(segunda.tipo).toBe("ferramenta");
      const terceira = await provedor.responder(
        entrada([{ nome: "contas_esquecidas", resultado: { quantidade: 2 } }])
      );
      expect(terceira).toEqual({
        tipo: "texto",
        texto: "Foram R$ 1.000,00 e 2 contas esquecidas.",
      });

      expect(chamadas).toHaveLength(3);
      expect(chamadas.at(0)?.contents).toEqual([pergunta]);
      expect(chamadas.at(1)?.contents).toEqual([
        pergunta,
        turnoDaRodada1,
        respostaR1,
      ]);
      // O ponto do conserto: a rodada 1 inteira continua lá, na ordem, e o
      // pareamento pedido -> resultado se mantém.
      expect(chamadas.at(2)?.contents).toEqual([
        pergunta,
        turnoDaRodada1,
        respostaR1,
        turnoDaRodada2,
        respostaR2,
      ]);
      expect(JSON.stringify(chamadas.at(2)?.contents)).toContain("chamada-r1");
    });

    it("pergunta nova (sem resultados) começa do zero: não arrasta a cadeia anterior", async () => {
      const { cliente, chamadas } = clienteFalso([
        { candidates: [{ content: turnoDaRodada1 }] },
        { candidates: [{ content: turnoDaRodada2 }] },
        { candidates: [{ content: turnoDaRodada1 }] },
        texto("Pronto."),
      ]);
      const provedor = new ProvedorGemini({ chave: "chave-de-teste", cliente });

      await provedor.responder(entrada());
      await provedor.responder(
        entrada([{ nome: "faturamento_do_dia", resultado: 1 }])
      );
      // O dono fez outra pergunta: nada do que veio antes volta.
      await provedor.responder(entrada());
      await provedor.responder(
        entrada([{ nome: "faturamento_do_dia", resultado: 2 }])
      );

      expect(chamadas.at(2)?.contents).toEqual([pergunta]);
      expect(chamadas.at(3)?.contents).toEqual([
        pergunta,
        turnoDaRodada1,
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                id: "chamada-r1",
                name: "faturamento_do_dia",
                response: { output: 2 },
              },
            },
          ],
        },
      ]);
    });

    it("depois de uma resposta de texto, a cadeia é zerada", async () => {
      const { cliente, chamadas } = clienteFalso([
        { candidates: [{ content: turnoDaRodada1 }] },
        texto("Primeira resposta."),
        { candidates: [{ content: turnoDaRodada2 }] },
        texto("Segunda resposta."),
      ]);
      const provedor = new ProvedorGemini({ chave: "chave-de-teste", cliente });

      await provedor.responder(entrada());
      await provedor.responder(
        entrada([{ nome: "faturamento_do_dia", resultado: 1 }])
      );
      await provedor.responder(entrada());
      await provedor.responder(
        entrada([{ nome: "contas_esquecidas", resultado: { quantidade: 2 } }])
      );

      expect(chamadas.at(3)?.contents).toEqual([
        pergunta,
        turnoDaRodada2,
        respostaR2,
      ]);
    });

    it("se a chamada ao modelo falha, a mesma rodada pode ser tentada de novo sem duplicar o par", async () => {
      const { cliente, chamadas } = clienteFalso([
        { candidates: [{ content: turnoDaRodada1 }] },
        { candidates: [] }, // resposta vazia: o provedor lança
        texto("Deu certo na 2ª tentativa."),
      ]);
      const provedor = new ProvedorGemini({ chave: "chave-de-teste", cliente });
      const resultados = [
        { nome: "faturamento_do_dia", resultado: { total: "1000.00" } },
      ];

      await provedor.responder(entrada());
      await expect(provedor.responder(entrada(resultados))).rejects.toThrow(
        "Resposta vazia do provedor"
      );
      await provedor.responder(entrada(resultados));

      expect(chamadas.at(2)?.contents).toEqual([
        pergunta,
        turnoDaRodada1,
        respostaR1,
      ]);
    });
  });

  it("com resultados e sem o turno anterior na memória, lança erro claro e não chama a API", async () => {
    const { cliente, chamadas } = clienteFalso([texto("Pronto.")]);
    const provedor = new ProvedorGemini({ chave: "chave-de-teste", cliente });

    await expect(
      provedor.responder({
        instrucoes: "x",
        historico,
        ferramentas,
        resultados: [{ nome: "faturamento_do_dia", resultado: [1, 2, 3] }],
      })
    ).rejects.toThrow("turno de ferramentas anterior indisponível");
    expect(chamadas).toHaveLength(0);
  });

  describe("quando os resultados não casam com o turno guardado", () => {
    const pedidoDoModelo: RespostaBruta = {
      candidates: [
        {
          content: {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "faturamento_do_dia",
                  args: { dia: "ontem" },
                },
              },
            ],
          },
        },
      ],
    };

    async function aposPedirFerramenta() {
      const { cliente, chamadas } = clienteFalso([
        pedidoDoModelo,
        texto("Não deveria chegar aqui."),
      ]);
      const provedor = new ProvedorGemini({ chave: "chave-de-teste", cliente });
      const primeira = await provedor.responder({
        instrucoes: "x",
        historico,
        ferramentas,
      });
      expect(primeira.tipo).toBe("ferramenta");
      return { provedor, chamadas };
    }

    it("lança erro claro quando há mais resultados que pedidos guardados", async () => {
      const { provedor, chamadas } = await aposPedirFerramenta();

      await expect(
        provedor.responder({
          instrucoes: "x",
          historico,
          ferramentas,
          resultados: [
            { nome: "faturamento_do_dia", resultado: 1 },
            { nome: "contas_esquecidas", resultado: 2 },
          ],
        })
      ).rejects.toThrow("turno de ferramentas anterior indisponível");
      expect(chamadas).toHaveLength(1);
    });

    it("lança erro claro quando o nome do resultado é outro", async () => {
      const { provedor, chamadas } = await aposPedirFerramenta();

      await expect(
        provedor.responder({
          instrucoes: "x",
          historico,
          ferramentas,
          resultados: [{ nome: "contas_esquecidas", resultado: 1 }],
        })
      ).rejects.toThrow("turno de ferramentas anterior indisponível");
      expect(chamadas).toHaveLength(1);
    });

    it("lança erro claro quando o turno já foi consumido por uma resposta de texto", async () => {
      const { provedor, chamadas } = await aposPedirFerramenta();
      const resultados = [{ nome: "faturamento_do_dia", resultado: 1 }];

      const segunda = await provedor.responder({
        instrucoes: "x",
        historico,
        ferramentas,
        resultados,
      });
      expect(segunda.tipo).toBe("texto");

      await expect(
        provedor.responder({
          instrucoes: "x",
          historico,
          ferramentas,
          resultados,
        })
      ).rejects.toThrow("turno de ferramentas anterior indisponível");
      expect(chamadas).toHaveLength(2);
    });
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
