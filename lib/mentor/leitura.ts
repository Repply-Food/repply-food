import "server-only";
import { exigirAdmin } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * A leitura da tela do mentor. Tudo pelo cliente do DONO (a RLS é a trava) e,
 * além dela, filtrando pela casa da sessão: defesa em profundidade, porque o
 * admin lê qualquer casa e a RLS sozinha não distingue uma da outra para ele.
 *
 * No fim do arquivo estão as leituras do ADMIN (suporte, só leitura, D-38):
 * essas, ao contrário, valem para qualquer casa, e quem as barra para o dono é
 * o `exigirAdmin()` de dentro de cada uma.
 *
 * Falha de leitura vira a tela de erro (`app/error.tsx`), nunca uma lista vazia:
 * "nenhuma conversa" seria falso para quem já conversou, e o dono perderia o
 * fio da conversa sem saber. O log leva só o código (D-29).
 */

/** Quantas conversas a lista devolve (a tela de hoje só abre a mais recente). */
const MAXIMO_DE_CONVERSAS = 50;

/** Quantas conversas a lista do admin devolve (de todas as casas juntas). */
export const MAXIMO_DE_CONVERSAS_NO_ADMIN = 100;

export type ConversaDaLista = {
  id: string;
  titulo: string | null;
  ultima_em: string;
  /** Quando o dono arquivou; nulo = na lista principal. */
  arquivada_em: string | null;
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
 *
 * IGNORA a conversa excluída: ela sumiu da vista do dono (só a faxina ou o
 * admin a veem). A arquivada CONTINUA aqui, com a marca: a tela separa a lista
 * principal das arquivadas (`conversasArquivadasDaCasa`).
 */
export async function conversasDaCasa(
  restauranteId: string
): Promise<ConversaDaLista[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mentor_conversas")
    .select("id, titulo, ultima_em, arquivada_em, mentor_mensagens!inner(id)")
    .eq("restaurante_id", restauranteId)
    .is("excluida_em", null)
    .order("ultima_em", { ascending: false })
    .limit(MAXIMO_DE_CONVERSAS)
    .limit(1, { referencedTable: "mentor_mensagens" });
  if (error || !data) falhaNaLeitura();

  return data.map(({ id, titulo, ultima_em, arquivada_em }) => ({
    id,
    titulo,
    ultima_em,
    arquivada_em,
  }));
}

/**
 * Só as arquivadas da casa (sem as excluídas), da mais recente para a mais
 * antiga. Ignora a conversa sem mensagem, pelo mesmo motivo e do mesmo jeito
 * da lista principal.
 */
export async function conversasArquivadasDaCasa(
  restauranteId: string
): Promise<ConversaDaLista[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mentor_conversas")
    .select("id, titulo, ultima_em, arquivada_em, mentor_mensagens!inner(id)")
    .eq("restaurante_id", restauranteId)
    .is("excluida_em", null)
    .not("arquivada_em", "is", null)
    .order("ultima_em", { ascending: false })
    .limit(MAXIMO_DE_CONVERSAS)
    .limit(1, { referencedTable: "mentor_mensagens" });
  if (error || !data) falhaNaLeitura();

  return data.map(({ id, titulo, ultima_em, arquivada_em }) => ({
    id,
    titulo,
    ultima_em,
    arquivada_em,
  }));
}

type LinhaDeMensagem = {
  id: string;
  papel: string;
  texto: string;
  criada_em: string;
};

/** O banco só aceita 'dono' e 'mentor'; qualquer outra coisa não se mostra. */
function mensagensValidas(linhas: LinhaDeMensagem[]): MensagemDaConversa[] {
  const mensagens: MensagemDaConversa[] = [];
  for (const { id, papel, texto, criada_em } of linhas) {
    if (papel === "dono" || papel === "mentor") {
      mensagens.push({ id, papel, texto, criada_em });
    }
  }
  return mensagens;
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

  return mensagensValidas(data);
}

// ---------------------------------------------------------------------------
// Leitura do ADMIN (suporte): qualquer casa, só leitura (D-38)
// ---------------------------------------------------------------------------
//
// Pelo cliente do admin logado, sob a RLS: as políticas de leitura das duas
// tabelas liberam o admin em toda casa e NÃO há política de escrita para ele,
// então nada aqui escreve nem precisa da chave de serviço. `exigirAdmin()` vem
// primeiro, dentro de cada leitura: a RLS devolveria só as conversas do próprio
// login a quem não é admin (um dono com a URL na mão veria a lista da casa dele
// na tela do suporte, em vez de ser barrado). Mesma falha fechada do resto.

/**
 * A casa da conversa, o bastante para a tela dizer "de quem é" e mostrar a hora
 * no relógio dela. Sem o `slug`: nenhuma das telas o usa (o link da casa leva o
 * `id`), e o que não se usa não precisa trafegar.
 */
export type CasaDaConversa = {
  id: string;
  nome: string;
  fuso: string;
};

export type ConversaParaAdmin = ConversaDaLista & {
  casa: CasaDaConversa;
  /** Verdadeiro quando o dono excluiu (sumiu da vista dele, guardada 60 dias). */
  excluida: boolean;
};

/**
 * A lista do admin: as conversas (no máximo `MAXIMO_DE_CONVERSAS_NO_ADMIN`) e se
 * existem outras, mais antigas, fora dela.
 */
export type ConversasParaAdmin = {
  conversas: ConversaParaAdmin[];
  haMais: boolean;
};

export type DetalheDaConversaParaAdmin = ConversaParaAdmin & {
  mensagens: MensagemDaConversa[];
};

const idSchema = z.uuid();

/**
 * As conversas de TODAS as casas, da mais recente para a mais antiga, cada uma
 * com a casa. Ignora a conversa sem mensagem, pelo mesmo motivo e do mesmo jeito
 * da lista do dono (`!inner` + `limit(1)` na tabela filha). A excluída APARECE,
 * marcada: o suporte precisa vê-la para apagar de verdade se o cliente pedir.
 *
 * Pede UMA a mais que o teto e devolve só o teto: se a extra veio, `haMais` é
 * verdadeiro (há conversa mais antiga fora da lista). Com exatamente o teto de
 * conversas, a tela não pode avisar de uma falta que não existe.
 */
export async function conversasParaAdmin(): Promise<ConversasParaAdmin> {
  await exigirAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mentor_conversas")
    .select(
      "id, titulo, ultima_em, arquivada_em, excluida_em, restaurantes!inner(id, nome, fuso), mentor_mensagens!inner(id)"
    )
    .order("ultima_em", { ascending: false })
    .order("id", { ascending: false })
    .limit(MAXIMO_DE_CONVERSAS_NO_ADMIN + 1)
    .limit(1, { referencedTable: "mentor_mensagens" });
  if (error || !data) falhaNaLeitura();

  const conversas = data
    .slice(0, MAXIMO_DE_CONVERSAS_NO_ADMIN)
    .map(
      ({ id, titulo, ultima_em, arquivada_em, excluida_em, restaurantes }) => ({
        id,
        titulo,
        ultima_em,
        arquivada_em,
        excluida: excluida_em !== null,
        casa: {
          id: restaurantes.id,
          nome: restaurantes.nome,
          fuso: restaurantes.fuso,
        },
      })
    );
  return { conversas, haMais: data.length > MAXIMO_DE_CONVERSAS_NO_ADMIN };
}

/**
 * Uma conversa de qualquer casa, com a casa e as mensagens (da mais antiga para
 * a mais recente). Nulo se o id não for um uuid ou a conversa não existir: a
 * página responde "não encontrada". A casa vem da própria conversa, não da
 * sessão (o admin não tem casa). A conversa sem mensagem abre vazia, não some:
 * a lista a esconde, mas quem chega por um link merece ver o que há.
 */
export async function conversaParaAdmin(
  id: string
): Promise<DetalheDaConversaParaAdmin | null> {
  await exigirAdmin();
  if (!idSchema.safeParse(id).success) return null;
  const supabase = await createClient();

  const [conversa, mensagens] = await Promise.all([
    supabase
      .from("mentor_conversas")
      .select(
        "id, titulo, ultima_em, arquivada_em, excluida_em, restaurantes!inner(id, nome, fuso)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("mentor_mensagens")
      .select("id, papel, texto, criada_em")
      .eq("conversa_id", id)
      .order("criada_em", { ascending: true }),
  ]);
  if (conversa.error || mensagens.error || !mensagens.data) falhaNaLeitura();
  if (!conversa.data) return null;

  const { titulo, ultima_em, arquivada_em, excluida_em, restaurantes } =
    conversa.data;
  return {
    id: conversa.data.id,
    titulo,
    ultima_em,
    arquivada_em,
    excluida: excluida_em !== null,
    casa: {
      id: restaurantes.id,
      nome: restaurantes.nome,
      fuso: restaurantes.fuso,
    },
    mensagens: mensagensValidas(mensagens.data),
  };
}
