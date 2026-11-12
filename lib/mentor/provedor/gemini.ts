import "server-only";
import {
  type Content,
  type FunctionCall,
  type GenerateContentConfig,
  type GenerateContentParameters,
  GoogleGenAI,
} from "@google/genai";
import type {
  AnexoParaIA,
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

/**
 * Junta os anexos à pergunta do dono (o último turno do histórico): cada
 * arquivo vira uma parte `inlineData` depois do texto. Devolve um vetor novo,
 * sem mexer na entrada. Quando o histórico não termina no dono (não acontece
 * no cérebro, que sempre fecha no texto da pergunta), os arquivos vão num
 * turno próprio em vez de contaminar um turno do modelo.
 */
function comAnexos(pergunta: Content[], anexos: AnexoParaIA[]): Content[] {
  const partes = anexos.map((anexo) => ({
    inlineData: { mimeType: anexo.mime, data: anexo.dados },
  }));
  const ultima = pergunta[pergunta.length - 1];
  if (!ultima || ultima.role !== "user") {
    return [...pergunta, { role: "user", parts: partes }];
  }
  return [
    ...pergunta.slice(0, -1),
    { ...ultima, parts: [...(ultima.parts ?? []), ...partes] },
  ];
}

type ChamadaComNome = FunctionCall & { name: string };

function temNome(chamada: FunctionCall | undefined): chamada is ChamadaComNome {
  return Boolean(chamada?.name);
}

function chamadasDe(conteudo: Content | undefined): ChamadaComNome[] {
  const chamadas: ChamadaComNome[] = [];
  for (const parte of conteudo?.parts ?? []) {
    if (temNome(parte.functionCall)) chamadas.push(parte.functionCall);
  }
  return chamadas;
}

/**
 * Casa cada resultado com a chamada de função de mesmo nome, na ordem.
 * Devolve nulo se não fecharem um a um (aí não dá para confiar no turno guardado).
 */
function parearComChamadas(
  resultados: ResultadoFerramenta[],
  chamadas: ChamadaComNome[]
): ChamadaComNome[] | null {
  if (chamadas.length !== resultados.length) return null;
  const livres = [...chamadas];
  const pares: ChamadaComNome[] = [];
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
 * própria instância, o último turno de pedidos de função que devolveu e, junto,
 * os pares (turno do modelo + turno dos resultados) das rodadas anteriores da
 * MESMA conversa: numa cadeia de 2 ou mais rodadas de ferramenta, a chamada
 * seguinte reenvia o acumulado inteiro. Sem isso o modelo "esquece" o resultado
 * da rodada 1, pede de novo e o laço estoura.
 *
 * Consequência: use UMA instância por conversa/requisição (como faz
 * `escolherProvedor()`) e reuse-a no laço de ferramentas. Se vierem resultados
 * e o turno guardado não existir ou não casar com eles, `responder` lança
 * `turno de ferramentas anterior indisponível`: inventar o pedido de função
 * (por exemplo com argumentos vazios) faria o modelo "lembrar" de algo que
 * ele não pediu.
 *
 * O acumulado é zerado quando `responder` roda SEM resultados (pergunta nova do
 * dono) ou quando o modelo responde com texto (fim da cadeia).
 */
export class ProvedorGemini implements ProvedorIA {
  private readonly cliente: ClienteGemini;
  private readonly modelo: string;
  /** O turno de pedidos do modelo que ainda espera resultados. */
  private ultimoTurnoDeFerramentas: Content | undefined;
  /** Os pares já respondidos (turno do modelo + resultados), na ordem das rodadas. */
  private acumuladoDeFerramentas: Content[] = [];

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
    // Sem resultados é uma pergunta nova do dono: a cadeia anterior acabou.
    // Com resultados, continua a cadeia: o par da rodada que acabou de voltar
    // só entra no acumulado depois que o modelo responder (se a chamada falhar,
    // nada muda e dá para tentar de novo).
    let parDaRodada: Content[] = [];
    if (entrada.resultados && entrada.resultados.length > 0) {
      parDaRodada = this.turnosDosResultados(entrada.resultados);
    } else {
      this.ultimoTurnoDeFerramentas = undefined;
      this.acumuladoDeFerramentas = [];
    }
    // Os anexos entram SÓ na primeira chamada (sem resultados), junto do
    // texto da pergunta: nas rodadas de ferramenta o pedido segue como hoje,
    // sem reenviar os arquivos. Sem anexos, o pedido é byte-idêntico ao de
    // hoje.
    const pergunta = entrada.historico.map(paraConteudo);
    const primeiroPedido =
      entrada.anexos !== undefined &&
      entrada.anexos.length > 0 &&
      parDaRodada.length === 0;
    const contents = [
      ...(primeiroPedido
        ? comAnexos(pergunta, entrada.anexos ?? [])
        : pergunta),
      ...this.acumuladoDeFerramentas,
      ...parDaRodada,
    ];

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
      nome: chamada.name,
      argumentos: chamada.args ?? {},
    }));
    if (pedidos.length > 0) {
      this.acumuladoDeFerramentas = [
        ...this.acumuladoDeFerramentas,
        ...parDaRodada,
      ];
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
    this.acumuladoDeFerramentas = [];
    return { tipo: "texto", texto };
  }

  /** O turno do modelo com os pedidos de função + o turno com os resultados. */
  private turnosDosResultados(resultados: ResultadoFerramenta[]): Content[] {
    const guardadas = chamadasDe(this.ultimoTurnoDeFerramentas);
    const pares = parearComChamadas(resultados, guardadas);
    if (!pares || !this.ultimoTurnoDeFerramentas) {
      throw new Error("turno de ferramentas anterior indisponível");
    }

    const turnoDoModelo: Content = {
      ...this.ultimoTurnoDeFerramentas,
      role: "model",
    };

    const turnoDosResultados: Content = {
      role: "user",
      parts: resultados.map((resultado, indice) => {
        const id = pares[indice]?.id;
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
