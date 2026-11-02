import "server-only";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

/**
 * A leitura da tela do mentor. Tudo pelo cliente do DONO (a RLS é a trava) e,
 * além dela, filtrando pela casa da sessão: defesa em profundidade, porque o
 * admin lê qualquer casa e a RLS sozinha não distingue uma da outra para ele.
 *
 * Falha de leitura vira a tela de erro (`app/error.tsx`), nunca uma lista vazia:
 * "nenhuma conversa" seria falso para quem já conversou, e o dono perderia o
 * fio da conversa sem saber. O log leva só o código (D-29).
 */

/** Quantas conversas a lista devolve (a tela de hoje só abre a mais recente). */
const MAXIMO_DE_CONVERSAS = 50;

export type ConversaDaLista = {
  id: string;
  titulo: string | null;
  ultima_em: string;
};

export type MensagemDaConversa = {
  id: string;
  papel: "dono" | "mentor";
  texto: string;
  criada_em: string;
};

function falhaNaLeitura(): never {
  logError("falha_leitura_mentor");
  throw new Error("falha_leitura_mentor");
}

/**
 * As conversas da casa, da mais recente para a mais antiga.
 *
 * IGNORA a conversa sem mensagem: o cérebro grava a conversa e as mensagens em
 * dois comandos (não atômicos), então uma falha entre os dois deixa uma
 * conversa vazia órfã, que não pode aparecer. O `!inner` só devolve a conversa
 * que tem ao menos uma mensagem; o `limit(1)` na tabela filha evita trazer o
 * histórico inteiro só para provar que existe.
 */
export async function conversasDaCasa(
  restauranteId: string
): Promise<ConversaDaLista[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mentor_conversas")
    .select("id, titulo, ultima_em, mentor_mensagens!inner(id)")
    .eq("restaurante_id", restauranteId)
    .order("ultima_em", { ascending: false })
    .limit(MAXIMO_DE_CONVERSAS)
    .limit(1, { referencedTable: "mentor_mensagens" });
  if (error || !data) falhaNaLeitura();

  return data.map(({ id, titulo, ultima_em }) => ({ id, titulo, ultima_em }));
}

/** As mensagens de uma conversa da casa, da mais antiga para a mais recente. */
export async function mensagensDaConversa(
  conversaId: string,
  restauranteId: string
): Promise<MensagemDaConversa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mentor_mensagens")
    .select("id, papel, texto, criada_em")
    .eq("conversa_id", conversaId)
    .eq("restaurante_id", restauranteId)
    .order("criada_em", { ascending: true });
  if (error || !data) falhaNaLeitura();

  const mensagens: MensagemDaConversa[] = [];
  for (const { id, papel, texto, criada_em } of data) {
    // O banco só aceita 'dono' e 'mentor'; qualquer outra coisa não se mostra.
    if (papel === "dono" || papel === "mentor") {
      mensagens.push({ id, papel, texto, criada_em });
    }
  }
  return mensagens;
}
