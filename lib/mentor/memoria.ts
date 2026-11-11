import "server-only";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { type ProvedorIA, escolherProvedor } from "./provedor";

/**
 * As fichas que o mentor lembra da casa e do dono (Fase 3): fatos e resumos
 * curtos ("o dono prefere conselho direto"), em até 200 letras, no máximo 50
 * por casa.
 *
 * SEGURANÇA E ISOLAMENTO
 * - `restauranteId` vem do chamador interno (`conversa.ts`, que usa o da
 *   sessão), nunca do corpo da requisição nem do modelo. Toda escrita filtra
 *   pela casa de forma explícita.
 * - A escrita vai pela chave de serviço porque o navegador nunca escreve ficha
 *   direto (não há política de INSERT/UPDATE/DELETE para `authenticated`). A
 *   leitura (`carregarFichas`) vai pelo cliente do DONO: a RLS é a trava.
 * - Todo erro vira só um código no log. O log nunca leva texto de ficha,
 *   pergunta do dono nem mensagem crua de erro (D-29).
 * - A extração é auxiliar: nunca lança e nunca derruba a conversa. Ficha
 *   inválida é descartada em silêncio; falha de provedor ou de banco vira log
 *   e segue.
 */

/** Quantas fichas uma casa guarda, no máximo; a mais antiga aposenta. */
export const TETO_DE_FICHAS = 50;
/** Quantas letras cabem numa ficha, no máximo (regra igual à do banco). */
export const TAMANHO_MAXIMO_DA_FICHA = 200;

export type TipoDeFicha = "fato" | "resumo";
export type FichaDoMentor = { tipo: TipoDeFicha; texto: string };

/**
 * A instrução da extração, curta e fechada: o provedor só lista fichas novas
 * em JSON, e nada além. O "até 5" segura o tamanho do pedido; o resto (teto,
 * tamanho, duplicada) é validado aqui, nunca confiado ao modelo.
 */
const INSTRUCAO_EXTRACAO = [
  "Você extrai lembranças da conversa abaixo para o mentor lembrar depois.",
  "Liste até 5 fatos ou resumos NOVOS sobre a casa e o dono (preferências,",
  "combinados, contexto que vale guardar). Ignore números, que vêm de",
  "ferramenta, e ignore o que já é óbvio.",
  'Responda SÓ com um JSON array, nada além: [{"tipo":"fato"|"resumo",',
  '"texto":"..."}]. Texto curto, até 200 letras.',
  "Se não houver nada novo para guardar, responda [].",
].join(" ");

/** Valida um item vindo do provedor (ou do banco): fora da regra é nulo. */
function fichaValida(item: unknown): FichaDoMentor | null {
  if (typeof item !== "object" || item === null) return null;
  const { tipo, texto } = item as { tipo?: unknown; texto?: unknown };
  if (tipo !== "fato" && tipo !== "resumo") return null;
  if (typeof texto !== "string") return null;
  const aparado = texto.trim();
  if (aparado.length < 1 || aparado.length > TAMANHO_MAXIMO_DA_FICHA) {
    return null;
  }
  return { tipo, texto: aparado };
}

/**
 * Extrai as fichas novas da pergunta e da resposta e grava no banco, com a
 * conversa onde o mentor soube. Nunca lança: falha vira log e segue.
 *
 * Por ficha válida: texto igual ao de uma ficha existente (exato, após aparar)
 * renova a `atualizada_em` em vez de duplicar; ficha nova, com a casa no teto,
 * aposenta a mais antiga antes de entrar. Zero linhas afetadas não é sucesso.
 */
export async function extrairEgravarFichas(args: {
  restauranteId: string;
  conversaId: string;
  pergunta: string;
  resposta: string;
  provedor?: ProvedorIA;
}): Promise<void> {
  try {
    const provedor = args.provedor ?? escolherProvedor();
    const saida = await provedor.responder({
      instrucoes: INSTRUCAO_EXTRACAO,
      historico: [
        { papel: "dono", texto: args.pergunta },
        { papel: "mentor", texto: args.resposta },
      ],
      ferramentas: [],
    });
    // Resposta de ferramenta não é extração: nada a guardar.
    if (saida.tipo !== "texto") return;

    let cru: unknown;
    try {
      cru = JSON.parse(saida.texto);
    } catch {
      return;
    }
    if (!Array.isArray(cru)) return;

    const servico = createServiceClient();
    // Teto por extração: o prompt pede "até 5", mas modelo desobediente pode
    // devolver 100 itens; sem este corte, cada item vira roundtrips no banco.
    for (const item of cru.slice(0, 5)) {
      const ficha = fichaValida(item);
      if (!ficha) continue;

      const existente = await servico
        .from("mentor_memorias")
        .select("id")
        .eq("restaurante_id", args.restauranteId)
        .eq("texto", ficha.texto)
        .maybeSingle();
      if (existente.error) throw existente.error;
      if (existente.data) {
        const renovada = await servico
          .from("mentor_memorias")
          .update({ atualizada_em: new Date().toISOString() })
          .eq("id", existente.data.id)
          .eq("restaurante_id", args.restauranteId)
          .select("id");
        if (renovada.error || renovada.data?.length !== 1) {
          throw renovada.error ?? new Error("a ficha não renovou");
        }
        continue;
      }

      const contagem = await servico
        .from("mentor_memorias")
        .select("id", { count: "exact", head: true })
        .eq("restaurante_id", args.restauranteId);
      if (contagem.error || typeof contagem.count !== "number") {
        throw contagem.error ?? new Error("as fichas não foram contadas");
      }
      if (contagem.count >= TETO_DE_FICHAS) {
        const antiga = await servico
          .from("mentor_memorias")
          .select("id")
          .eq("restaurante_id", args.restauranteId)
          .order("atualizada_em", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (antiga.error || !antiga.data) {
          throw antiga.error ?? new Error("a ficha antiga não foi achada");
        }
        const aposentada = await servico
          .from("mentor_memorias")
          .delete()
          .eq("id", antiga.data.id)
          .eq("restaurante_id", args.restauranteId)
          .select("id");
        if (aposentada.error || aposentada.data?.length !== 1) {
          throw aposentada.error ?? new Error("a ficha antiga não saiu");
        }
      }

      const gravada = await servico
        .from("mentor_memorias")
        .insert({
          restaurante_id: args.restauranteId,
          texto: ficha.texto,
          tipo: ficha.tipo,
          conversa_id: args.conversaId,
        })
        .select("id");
      if (gravada.error || gravada.data?.length !== 1) {
        throw gravada.error ?? new Error("a ficha não entrou");
      }
    }
  } catch {
    // Só o código vai para o log: nunca ficha, pergunta ou erro cru.
    logError("falha_memoria_mentor");
  }
}

/**
 * As fichas da casa para a resposta, das mais novas para as mais velhas, no
 * máximo 50. Lê pelo cliente do dono (a RLS só mostra a casa dele). Falha de
 * leitura devolve vazio com log, nunca lança: sem ficha, o mentor responde
 * igual a hoje.
 */
export async function carregarFichas(
  restauranteId: string
): Promise<FichaDoMentor[]> {
  try {
    const supabase = await createClient();
    const leitura = await supabase
      .from("mentor_memorias")
      .select("tipo, texto")
      .eq("restaurante_id", restauranteId)
      .order("atualizada_em", { ascending: false })
      .limit(TETO_DE_FICHAS);
    if (leitura.error || !leitura.data) {
      logError("falha_memoria_mentor");
      return [];
    }
    const fichas: FichaDoMentor[] = [];
    for (const linha of leitura.data) {
      const ficha = fichaValida(linha);
      if (ficha) fichas.push(ficha);
    }
    return fichas;
  } catch {
    logError("falha_memoria_mentor");
    return [];
  }
}
