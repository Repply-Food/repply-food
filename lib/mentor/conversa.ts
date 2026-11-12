import "server-only";
import { randomUUID } from "node:crypto";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  type ArquivoValidado,
  gravarAnexos,
  validarArquivos,
  vincularAnexos,
} from "./anexos";
import { type CodigoDeFalha, FalhaDoMentor } from "./falha";
import { FERRAMENTAS, executarFerramentas } from "./ferramentas";
import { dentroDoLimite, devolverUso } from "./limite";
import {
  type FichaDoMentor,
  carregarFichas,
  extrairEgravarFichas,
} from "./memoria";
import {
  type AnexoParaIA,
  type MensagemIA,
  type ProvedorIA,
  type RespostaIA,
  type ResultadoFerramenta,
  escolherProvedor,
} from "./provedor";
import type { ResultadoDoMentor } from "./tipos";
import { TRILHOS } from "./trilhos";

/**
 * O cérebro do mentor: recebe a pergunta do dono, monta o pedido (trilhos +
 * cartilha + dia de hoje + lembranças + histórico + ferramentas), conversa com o provedor de
 * IA executando as ferramentas que ele pedir e grava a conversa.
 *
 * SEGURANÇA E ISOLAMENTO
 * - `restauranteId` vem da sessão (`exigirCasa`), nunca do corpo da requisição
 *   nem do modelo. Vai para as ferramentas e para todo filtro daqui.
 * - Conversas, mensagens e a contagem do uso passam pelo cliente do DONO (a RLS
 *   é a trava). O cliente de serviço só faz duas coisas que o dono não pode:
 *   ler a cartilha e DEVOLVER o uso quando a IA não foi alcançada (se o dono
 *   pudesse baixar o próprio contador, furaria o teto de custo).
 * - O número vem sempre de ferramenta; aqui nada é calculado nem inventado.
 * - Todo erro vira uma frase do produto. O log leva só um código: nunca a
 *   pergunta do dono, nem a mensagem de erro do banco ou do provedor (D-29).
 * - Nada é gravado até a resposta final estar pronta: sem meia-conversa.
 */

const FRASE_LIMITE = "você já usou bastante o mentor hoje; ele volta amanhã";
const FRASE_INDISPONIVEL = "o mentor está indisponível agora, tente de novo";
const FRASE_CONVERSA = "não encontrei essa conversa; comece uma nova";
const FRASE_VAZIA = "escreva sua pergunta para o mentor";
const FRASE_LONGA =
  "sua pergunta ficou longa demais; resuma em até 4000 caracteres";

/** O tamanho máximo da pergunta do dono, em caracteres (depois de aparada). */
const TAMANHO_MAXIMO_DA_PERGUNTA = 4000;
/** Quantas vezes o mentor pode pedir ferramentas antes de responder. */
const MAXIMO_DE_RODADAS = 5;
/**
 * Quantas ferramentas rodam de uma vez numa rodada. O catálogo tem 14: um
 * panorama (hoje + semana) pode pedir quase todas, e a mesma ferramenta em
 * vários meses também. Pedidos além do teto NÃO derrubam a conversa: voltam ao
 * provedor com um resultado de erro (ver `RESULTADO_ALEM_DO_LIMITE`).
 */
const MAXIMO_DE_PEDIDOS_POR_RODADA = 16;
const RESULTADO_ALEM_DO_LIMITE = {
  erro: "pedido além do limite desta rodada; peça de novo se precisar",
};
/** Quantas mensagens salvas voltam ao provedor (as mais recentes). */
const MAXIMO_DE_MENSAGENS_NO_HISTORICO = 30;
const TAMANHO_DO_TITULO = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const DIAS_DA_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** Roda `etapa` e, se ela lançar, troca o erro cru por uma falha classificada. */
async function classificando<T>(
  codigo: CodigoDeFalha,
  etapa: () => PromiseLike<T>
): Promise<T> {
  try {
    return await etapa();
  } catch {
    throw new FalhaDoMentor(codigo);
  }
}

/**
 * A linha com o dia de hoje da casa. Sem ela, o modelo erra as datas que passa
 * às ferramentas de Resultados. `dia` é o dia de operação (AAAA-MM-DD), já
 * calculado pelo banco com o fuso e a hora de virada da casa.
 */
export function contextoDeHoje(dia: string, horaVirada: string): string {
  if (!DIA_ISO.test(dia)) throw new Error("dia de operação inválido");
  const [ano, mes, diaDoMes] = dia.split("-");
  const semana = DIAS_DA_SEMANA[new Date(`${dia}T00:00:00Z`).getUTCDay()];
  if (!semana) throw new Error("dia de operação inválido");
  return `Hoje é ${semana}, ${diaDoMes}/${mes}/${ano} (${dia}), o dia de operação da casa, que vira às ${horaVirada.slice(0, 5)}. Use essa data como referência para "ontem", "esta semana" ou "este mês", e passe as datas às ferramentas no formato AAAA-MM-DD.`;
}

type Cliente = Awaited<ReturnType<typeof createClient>>;

async function lerContextoDeHoje(
  supabase: Cliente,
  restauranteId: string
): Promise<string> {
  const casa = await supabase
    .from("restaurantes")
    .select("fuso, hora_virada")
    .eq("id", restauranteId)
    .maybeSingle();
  if (casa.error || !casa.data) throw new FalhaDoMentor("falha_mentor_geral");

  const dia = await supabase.rpc("dia_operacao_de", {
    p_momento: new Date().toISOString(),
    p_fuso: casa.data.fuso,
    p_virada: casa.data.hora_virada,
  });
  if (dia.error || typeof dia.data !== "string") {
    throw new FalhaDoMentor("falha_mentor_geral");
  }
  return contextoDeHoje(dia.data, casa.data.hora_virada);
}

/**
 * A cartilha ativa, pelo cliente de serviço (o dono não a enxerga). Sem
 * cartilha ativa o banco devolve nulo: o mentor segue só com os trilhos. Já um
 * ERRO ao ler não é "sem cartilha": falha fechado, para o mentor não responder
 * em silêncio sem a voz que a Repply afinou.
 */
async function lerCartilha(): Promise<string> {
  const { data, error } = await createServiceClient().rpc(
    "mentor_cartilha_ativa"
  );
  if (error) throw new FalhaDoMentor("falha_mentor_geral");
  if (data === null) return "";
  // Outra coisa que não texto não é "sem cartilha": falha fechado.
  if (typeof data !== "string") throw new FalhaDoMentor("falha_mentor_geral");
  return data.trim();
}

/** A conversa existe, é desta casa e o dono a enxerga? Filtra pela casa da sessão.
 * A excluída NÃO conta: ela sumiu da vista do dono, e uma chamada forjada não
 * pode escrever nela (nem gastar o limite do dia com isso). */
async function conversaDaCasaExiste(
  supabase: Cliente,
  conversaId: string,
  restauranteId: string
): Promise<boolean> {
  if (!UUID.test(conversaId)) return false;
  const { data, error } = await supabase
    .from("mentor_conversas")
    .select("id")
    .eq("id", conversaId)
    .eq("restaurante_id", restauranteId)
    .is("excluida_em", null)
    .maybeSingle();
  if (error) throw new FalhaDoMentor("falha_mentor_geral");
  return data !== null;
}

/** As últimas mensagens da conversa, da mais antiga para a mais recente. */
async function carregarHistorico(
  supabase: Cliente,
  conversaId: string,
  restauranteId: string
): Promise<MensagemIA[]> {
  const { data, error } = await supabase
    .from("mentor_mensagens")
    .select("papel, texto")
    .eq("conversa_id", conversaId)
    .eq("restaurante_id", restauranteId)
    .order("criada_em", { ascending: false })
    .limit(MAXIMO_DE_MENSAGENS_NO_HISTORICO);
  if (error || !data) throw new FalhaDoMentor("falha_mentor_geral");

  const turnos: MensagemIA[] = [];
  for (const linha of [...data].reverse()) {
    if (linha.papel === "dono" || linha.papel === "mentor") {
      turnos.push({ papel: linha.papel, texto: linha.texto });
    }
  }
  // Cortado o começo, a conversa não pode abrir com uma fala do mentor.
  while (turnos[0]?.papel === "mentor") turnos.shift();
  return turnos;
}

function tituloDe(pergunta: string): string {
  const letras = [...pergunta.replace(/\s+/g, " ")];
  return letras.length > TAMANHO_DO_TITULO
    ? `${letras.slice(0, TAMANHO_DO_TITULO - 1).join("")}…`
    : letras.join("");
}

/**
 * O bloco de lembranças que entra no pedido ao provedor, depois do dia de
 * hoje. Vazio quando a casa não tem ficha: sem bloco, o pedido é igual ao de
 * hoje. Fato de ficha nunca substitui número de ferramenta.
 */
function blocoDeLembrancas(fichas: FichaDoMentor[]): string {
  if (fichas.length === 0) return "";
  const linhas = fichas.map((ficha) => `- [${ficha.tipo}] ${ficha.texto}`);
  return `Lembranças sobre a casa e o dono (podem estar desatualizadas; fato não substitui número de ferramenta):\n${linhas.join("\n")}`;
}

type DadosParaGravar = {
  restauranteId: string;
  conversaId: string | null;
  pergunta: string;
  resposta: string;
  ferramentasUsadas: string[];
  perguntaEm: number;
  respostaEm: number;
};

/**
 * Grava a conversa inteira de uma vez, só no sucesso, pelo cliente do dono.
 * Zero linhas afetadas não é sucesso: cada escrita confere a contagem.
 *
 * As duas mensagens levam horário explícito e distinto: no mesmo comando o
 * `now()` do banco seria igual para as duas e a ordem da conversa ficaria ao
 * acaso na hora de reler.
 */
async function gravar(
  supabase: Cliente,
  dados: DadosParaGravar
): Promise<string> {
  const perguntaEm = new Date(dados.perguntaEm).toISOString();
  const respostaEm = new Date(dados.respostaEm).toISOString();
  let conversaId = dados.conversaId;

  if (conversaId === null) {
    conversaId = randomUUID();
    const nova = await supabase
      .from("mentor_conversas")
      .insert({
        id: conversaId,
        restaurante_id: dados.restauranteId,
        titulo: tituloDe(dados.pergunta),
        criada_em: perguntaEm,
        ultima_em: respostaEm,
      })
      .select("id");
    if (nova.error || nova.data?.length !== 1) {
      throw new FalhaDoMentor("falha_mentor_geral");
    }
  } else {
    // Defesa em profundidade: se a conversa foi excluída entre a checagem e a
    // gravação, zero linhas falham fechado em vez de ressuscitá-la.
    const atualizada = await supabase
      .from("mentor_conversas")
      .update({ ultima_em: respostaEm })
      .eq("id", conversaId)
      .eq("restaurante_id", dados.restauranteId)
      .is("excluida_em", null)
      .select("id");
    if (atualizada.error || atualizada.data?.length !== 1) {
      throw new FalhaDoMentor("falha_mentor_geral");
    }
  }

  const mensagens = await supabase
    .from("mentor_mensagens")
    .insert([
      {
        conversa_id: conversaId,
        restaurante_id: dados.restauranteId,
        papel: "dono",
        texto: dados.pergunta,
        criada_em: perguntaEm,
      },
      {
        conversa_id: conversaId,
        restaurante_id: dados.restauranteId,
        papel: "mentor",
        texto: dados.resposta,
        ferramentas_usadas:
          dados.ferramentasUsadas.length > 0 ? dados.ferramentasUsadas : null,
        criada_em: respostaEm,
      },
    ])
    .select("id");
  if (mensagens.error || mensagens.data?.length !== 2) {
    throw new FalhaDoMentor("falha_mentor_geral");
  }
  return conversaId;
}

type EntradaDoProvedor = Parameters<ProvedorIA["responder"]>[0];

/**
 * Devolve o uso contado quando a IA não foi alcançada. Uma devolução que falha
 * NÃO esconde a falha original nem derruba a conversa: vai para o log (o
 * contador falhou) e a tentativa fica contada, o lado seguro para o teto.
 */
async function devolverUsoSemEsconderAFalha(
  restauranteId: string
): Promise<void> {
  try {
    await devolverUso(restauranteId);
  } catch {
    logError("falha_mentor_limite");
  }
}

async function conversar(args: {
  restauranteId: string;
  conversaId: string | null;
  pergunta: string;
  provedor: ProvedorIA;
  arquivos?: File[];
}): Promise<ResultadoDoMentor> {
  const { restauranteId, conversaId } = args;

  // 0. A conversa continuada tem de ser desta casa E estar à vista do dono,
  // ANTES do limite: conversa excluída (ou de outra casa, ou inexistente)
  // recusa com a frase sem gastar o uso do dia, sem chamar o provedor e sem
  // gravar nada. A checagem se repete lá dentro (passo 2), contra a corrida em
  // que o dono exclui entre esta linha e a gravação.
  if (conversaId !== null) {
    const antes = await createClient();
    if (!(await conversaDaCasaExiste(antes, conversaId, restauranteId))) {
      return { ok: false, error: FRASE_CONVERSA };
    }
  }

  // 0b. Os anexos valem antes do limite: fora da regra, a recusa sai com a
  // frase do produto sem gastar o uso do dia, sem chamar o provedor e sem
  // gravar nada. Vazio aqui é "sem anexo": segue igual a hoje.
  const arquivos = args.arquivos ?? [];
  let validados: ArquivoValidado[] = [];
  if (arquivos.length > 0) {
    const validacao = validarArquivos(arquivos);
    if (!validacao.ok) return { ok: false, error: validacao.error };
    validados = validacao.arquivos;
  }

  // 1. Limite primeiro: barrado, o provedor nem é chamado. Erro no contador
  // falha fechado (nunca vira "liberado"). O uso é contado AQUI, antes de
  // qualquer chamada à IA: é o incremento atômico que segura o teto.
  const liberado = await classificando("falha_mentor_limite", () =>
    dentroDoLimite(restauranteId)
  );
  if (!liberado) return { ok: false, error: FRASE_LIMITE };

  // Daqui em diante o uso desta pergunta está contado. Se a IA não for
  // alcançada (falha_mentor_provedor), a falha é nossa e o uso volta; o dono
  // não perde cota por isso. Qualquer outra falha (a IA respondeu e gastou, ou
  // o banco falhou ao gravar) mantém o uso contado.
  try {
    return await responderComUsoContado({ ...args, validados });
  } catch (erro) {
    if (
      erro instanceof FalhaDoMentor &&
      erro.codigo === "falha_mentor_provedor"
    ) {
      await devolverUsoSemEsconderAFalha(restauranteId);
    }
    throw erro;
  }
}

/** Do passo 2 em diante: a pergunta já passou pelo limite e o uso está contado. */
async function responderComUsoContado(args: {
  restauranteId: string;
  conversaId: string | null;
  pergunta: string;
  provedor: ProvedorIA;
  validados: ArquivoValidado[];
}): Promise<ResultadoDoMentor> {
  const { restauranteId, conversaId, pergunta, provedor, validados } = args;
  const perguntaEm = Date.now();

  // 2. A conversa continuada tem de ser desta casa. Só se grava no fim.
  const supabase = await createClient();
  if (
    conversaId !== null &&
    !(await conversaDaCasaExiste(supabase, conversaId, restauranteId))
  ) {
    return { ok: false, error: FRASE_CONVERSA };
  }

  // 3 e 4. Instruções (trilhos + cartilha + hoje + lembranças) e histórico.
  // As lembranças vêm pelo cliente do dono (a RLS é a trava); sem ficha, sem
  // bloco. Falha de leitura devolve vazio, nunca derruba a resposta.
  const [cartilha, hoje, salvas, fichas] = await Promise.all([
    lerCartilha(),
    lerContextoDeHoje(supabase, restauranteId),
    conversaId === null
      ? Promise.resolve<MensagemIA[]>([])
      : carregarHistorico(supabase, conversaId, restauranteId),
    carregarFichas(restauranteId),
  ]);
  const instrucoes = [TRILHOS, cartilha, hoje, blocoDeLembrancas(fichas)]
    .filter((parte) => parte !== "")
    .join("\n\n");
  const historico: MensagemIA[] = [
    ...salvas,
    { papel: "dono", texto: pergunta },
  ];

  // 4b. Os bytes para a IA e a subida pendente. Os bytes são lidos aqui, em
  // mãos antes de qualquer chamada: se o cofre falhar, o provedor ainda
  // analisa (o aviso cobre a persistência). A subida usa conversa nula — o
  // id só existe depois de gravar (passo 6) — e qualquer falha de anexo vira
  // o aviso, sem derrubar a resposta.
  let anexos: AnexoParaIA[] | undefined;
  let anexosFalharam = false;
  let pendentes: { id: string; caminho: string }[] = [];
  if (validados.length > 0) {
    const paraIA: AnexoParaIA[] = [];
    for (const item of validados) {
      try {
        const bytes = Buffer.from(await item.arquivo.arrayBuffer());
        paraIA.push({
          tipo: item.tipo,
          mime: item.mime,
          nome: item.nomeSeguro,
          dados: bytes.toString("base64"),
        });
      } catch {
        logError("falha_anexos_mentor");
        anexosFalharam = true;
      }
    }
    if (paraIA.length > 0) anexos = paraIA;
    try {
      pendentes = await gravarAnexos(
        restauranteId,
        null,
        validados.map((item) => item.arquivo)
      );
    } catch {
      anexosFalharam = true;
      pendentes = [];
    }
  }

  // 5. O laço de ferramentas. A MESMA instância do provedor em todo o laço: o
  // Gemini guarda o pedido de função para reenviar com os resultados. Os
  // anexos vão SÓ na primeira chamada; as rodadas de ferramenta seguem como
  // hoje.
  const chamarProvedor = (
    entrada: Pick<EntradaDoProvedor, "resultados" | "anexos">
  ): Promise<RespostaIA> =>
    classificando("falha_mentor_provedor", () =>
      provedor.responder({
        instrucoes,
        historico,
        ferramentas: FERRAMENTAS,
        ...entrada,
      })
    );

  const catalogo = new Set(FERRAMENTAS.map((ferramenta) => ferramenta.nome));
  const usadas: string[] = [];
  let resposta = await chamarProvedor(anexos ? { anexos } : {});
  let rodadas = 0;
  while (resposta.tipo === "ferramenta") {
    const { pedidos } = resposta;
    // Resposta de ferramenta sem nenhum pedido não deveria existir: é defeito
    // do provedor, e seguir só rodaria o laço à toa. Falha fechado.
    if (pedidos.length === 0) throw new FalhaDoMentor("falha_mentor_provedor");
    if (rodadas >= MAXIMO_DE_RODADAS) {
      throw new FalhaDoMentor("falha_mentor_geral");
    }
    rodadas += 1;

    // Pedidos demais não derrubam a conversa e não são "cortados" em silêncio:
    // o provedor espera um resultado para CADA chamada que fez (pareamento 1:1,
    // na ordem). Os primeiros rodam de verdade; cada excedente volta com um erro
    // que o modelo entende e pode pedir de novo na rodada seguinte.
    const aExecutar = pedidos.slice(0, MAXIMO_DE_PEDIDOS_POR_RODADA);
    const excedentes = pedidos.slice(MAXIMO_DE_PEDIDOS_POR_RODADA);
    const executados: ResultadoFerramenta[] = await classificando(
      "falha_mentor_geral",
      () => executarFerramentas(aExecutar, restauranteId)
    );
    // Só os que rodaram contam como "usados" na mensagem salva.
    for (const { nome } of aExecutar) {
      if (catalogo.has(nome) && !usadas.includes(nome)) usadas.push(nome);
    }
    const resultados: ResultadoFerramenta[] = [
      ...executados,
      ...excedentes.map(({ nome }) => ({
        nome,
        resultado: RESULTADO_ALEM_DO_LIMITE,
      })),
    ];
    resposta = await chamarProvedor({ resultados });
  }

  const textoFinal = resposta.texto.trim();
  if (textoFinal === "") throw new FalhaDoMentor("falha_mentor_provedor");

  // 6. Gravação, só no sucesso e só no fim. Depois dela, os pendentes saem
  // da área temporária para a pasta da conversa. Se o vínculo falhar, a
  // conversa segue gravada e a resposta sai com o aviso (o dono reenvia só
  // os anexos): falha de anexo nunca derruba a pergunta.
  const idDaConversa = await gravar(supabase, {
    restauranteId,
    conversaId,
    pergunta,
    resposta: textoFinal,
    ferramentasUsadas: usadas,
    perguntaEm,
    respostaEm: Math.max(Date.now(), perguntaEm + 1),
  });
  if (pendentes.length > 0) {
    try {
      await vincularAnexos(
        restauranteId,
        idDaConversa,
        pendentes.map((pendente) => pendente.id)
      );
    } catch {
      anexosFalharam = true;
    }
  }

  // A extração é auxiliar e posterior: só no sucesso, com a conversa já
  // gravada. Aguarda, mas nunca derruba a resposta nem gasta a cota do dia
  // (a função nunca lança por contrato; o `catch` é defesa em profundidade).
  // Anexo não vira ficha sozinho: a extração recebe só texto.
  await extrairEgravarFichas({
    restauranteId,
    conversaId: idDaConversa,
    pergunta,
    resposta: textoFinal,
  }).catch(() => undefined);

  return {
    ok: true,
    conversaId: idDaConversa,
    resposta: textoFinal,
    anexosFalharam,
  };
}

/**
 * Responde à pergunta do dono. `restauranteId` é o da SESSÃO, nunca do corpo
 * da requisição nem do modelo. `conversaId` nulo abre uma conversa nova.
 *
 * O `provedor` é UMA instância por chamada: o laço de ferramentas reusa a mesma
 * instância, e o Gemini guarda nela o estado dos pedidos de função (e dos
 * resultados já devolvidos) da conversa em andamento. Por isso o padrão é
 * `escolherProvedor()` a cada chamada, e NUNCA se guarda um provedor em
 * variável de módulo: duas requisições dividiriam esse estado e uma
 * devolveria resultados à outra.
 *
 * A pergunta é validada aqui dentro, no mesmo caminho que falha fechado: texto,
 * aparada, de 1 a 4000 caracteres. Qualquer outra coisa vira uma frase do
 * produto, nunca um erro cru.
 */
export async function responderNoMentor(args: {
  restauranteId: string;
  conversaId: string | null;
  mensagemDoDono: string;
  arquivos?: File[];
  provedor?: ProvedorIA;
}): Promise<ResultadoDoMentor> {
  try {
    const pergunta =
      typeof args.mensagemDoDono === "string" ? args.mensagemDoDono.trim() : "";
    if (pergunta === "") return { ok: false, error: FRASE_VAZIA };
    if (pergunta.length > TAMANHO_MAXIMO_DA_PERGUNTA) {
      return { ok: false, error: FRASE_LONGA };
    }

    return await conversar({
      restauranteId: args.restauranteId,
      conversaId: args.conversaId,
      pergunta,
      arquivos: args.arquivos,
      provedor: args.provedor ?? escolherProvedor(),
    });
  } catch (erro) {
    // Só o código vai para o log: nunca o erro cru nem a pergunta do dono.
    logError(
      erro instanceof FalhaDoMentor ? erro.codigo : "falha_mentor_geral"
    );
    return { ok: false, error: FRASE_INDISPONIVEL };
  }
}
