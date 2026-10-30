import {
  type Content,
  type FunctionCall,
  type GenerateContentConfig,
  type GenerateContentParameters,
  GoogleGenAI,
} from "@google/genai";
import type {
  MensagemIA,
  PedidoFerramenta,
  ProvedorIA,
  RespostaIA,
  ResultadoFerramenta,
} from "./tipos";

// "Flash mais recente" do Gemini. É um apelido que a Google move sozinha:
// em produção, fixe um modelo de verdade em MENTOR_IA_MODELO.
export const MODELO_PADRAO = "gemini-flash-latest";

/** O pedaço da resposta do SDK que o mentor lê (o SDK devolve mais que isso). */
export type RespostaBruta = { candidates?: { content?: Content }[] };

/** O pedaço do cliente do SDK que o mentor usa. Nos testes entra um dublê. */
export type ClienteGemini = {
  models: {
    generateContent(
      parametros: GenerateContentParameters
    ): Promise<RespostaBruta>;
  };
};

export type OpcoesGemini = {
  chave?: string; // padrão: process.env.MENTOR_IA_CHAVE
  modelo?: string; // padrão: process.env.MENTOR_IA_MODELO, ou MODELO_PADRAO
  cliente?: ClienteGemini; // padrão: o cliente real da Google
};

function paraConteudo(mensagem: MensagemIA): Content {
  return {
    role: mensagem.papel === "dono" ? "user" : "model",
    parts: [{ text: mensagem.texto }],
  };
}

function chamadasDe(conteudo: Content | undefined): FunctionCall[] {
  const chamadas: FunctionCall[] = [];
  for (const parte of conteudo?.parts ?? []) {
    if (parte.functionCall?.name) chamadas.push(parte.functionCall);
  }
  return chamadas;
}

/**
 * Casa cada resultado com a chamada de função de mesmo nome, na ordem.
 * Devolve nulo se não fecharem um a um (aí não dá para confiar no turno guardado).
 */
function parearComChamadas(
  resultados: ResultadoFerramenta[],
  chamadas: FunctionCall[]
): FunctionCall[] | null {
  if (chamadas.length !== resultados.length) return null;
  const livres = [...chamadas];
  const pares: FunctionCall[] = [];
  for (const resultado of resultados) {
    const indice = livres.findIndex((c) => c.name === resultado.nome);
    if (indice === -1) return null;
    pares.push(...livres.splice(indice, 1));
  }
  return pares;
}

/**
 * Provedor de IA do mentor sobre o Gemini (`@google/genai`).
 *
 * A interface `ProvedorIA` devolve ao provedor só `{ nome, resultado }`: sem os
 * argumentos nem a assinatura de raciocínio do pedido de função. O Gemini exige
 * que o resultado venha logo depois do pedido que o gerou, e que o turno do
 * modelo volte exatamente como foi recebido. Por isso o provedor guarda, na
 * própria instância, o último turno de pedidos de função que devolveu.
 *
 * Consequência: use UMA instância por conversa/requisição (como faz
 * `escolherProvedor()`) e reuse-a no laço de ferramentas. Sem o turno guardado,
 * o pedido é reconstruído só pelo nome da função (sem argumentos).
 */
export class ProvedorGemini implements ProvedorIA {
  private readonly cliente: ClienteGemini;
  private readonly modelo: string;
  private ultimoTurnoDeFerramentas: Content | undefined;

  constructor(opcoes: OpcoesGemini = {}) {
    this.modelo =
      (opcoes.modelo ?? process.env.MENTOR_IA_MODELO ?? "").trim() ||
      MODELO_PADRAO;

    if (opcoes.cliente) {
      this.cliente = opcoes.cliente;
      return;
    }
    const chave = (opcoes.chave ?? process.env.MENTOR_IA_CHAVE ?? "").trim();
    if (!chave) throw new Error("MENTOR_IA_CHAVE ausente");
    this.cliente = new GoogleGenAI({ apiKey: chave });
  }

  async responder(
    entrada: Parameters<ProvedorIA["responder"]>[0]
  ): Promise<RespostaIA> {
    const contents = entrada.historico.map(paraConteudo);
    if (entrada.resultados && entrada.resultados.length > 0) {
      contents.push(...this.turnosDosResultados(entrada.resultados));
    }

    const config: GenerateContentConfig = {
      systemInstruction: entrada.instrucoes,
    };
    if (entrada.ferramentas.length > 0) {
      config.tools = [
        {
          functionDeclarations: entrada.ferramentas.map((ferramenta) => ({
            name: ferramenta.nome,
            description: ferramenta.descricao,
            parametersJsonSchema: ferramenta.parametros,
          })),
        },
      ];
    }

    const resposta = await this.cliente.models.generateContent({
      model: this.modelo,
      contents,
      config,
    });

    const conteudo = resposta.candidates?.[0]?.content;
    const pedidos: PedidoFerramenta[] = chamadasDe(conteudo).map((chamada) => ({
      nome: chamada.name ?? "",
      argumentos: chamada.args ?? {},
    }));
    if (pedidos.length > 0) {
      this.ultimoTurnoDeFerramentas = conteudo;
      return { tipo: "ferramenta", pedidos };
    }

    const texto = (conteudo?.parts ?? [])
      .filter((parte) => typeof parte.text === "string" && !parte.thought)
      .map((parte) => parte.text)
      .join("")
      .trim();
    if (!texto) throw new Error("Resposta vazia do provedor");
    this.ultimoTurnoDeFerramentas = undefined;
    return { tipo: "texto", texto };
  }

  /** O turno do modelo com os pedidos de função + o turno com os resultados. */
  private turnosDosResultados(resultados: ResultadoFerramenta[]): Content[] {
    const guardadas = chamadasDe(this.ultimoTurnoDeFerramentas);
    const pares = parearComChamadas(resultados, guardadas);

    const turnoDoModelo: Content =
      pares && this.ultimoTurnoDeFerramentas
        ? { ...this.ultimoTurnoDeFerramentas, role: "model" }
        : {
            role: "model",
            parts: resultados.map((r) => ({
              functionCall: { name: r.nome, args: {} },
            })),
          };

    const turnoDosResultados: Content = {
      role: "user",
      parts: resultados.map((resultado, indice) => {
        const id = pares?.[indice]?.id;
        return {
          functionResponse: {
            ...(id ? { id } : {}),
            name: resultado.nome,
            response: { output: resultado.resultado ?? null },
          },
        };
      }),
    };

    return [turnoDoModelo, turnoDosResultados];
  }
}
