"use server";

import "server-only";
import type { Resultado } from "@/lib/admin/tipos";
import { exigirAdmin, exigirCasa } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * As ações de sessão do mentor: renomear, arquivar, excluir e apagar de
 * verdade. A mesma fronteira de segurança da tela de envio
 * (`enviar-action.ts`): quem chama uma função do servidor pode ser qualquer
 * um, com qualquer argumento, então cada função confere tudo por dentro:
 *  - o restaurante é o da SESSÃO (`exigirCasa`), nunca um argumento, e vai em
 *    todo filtro junto com o id da conversa (a RLS é a trava; o filtro é a
 *    segunda camada, porque o admin lê qualquer casa e a RLS sozinha não
 *    distingue uma da outra para ele);
 *  - o admin em modo leitura não organiza pelo caminho do dono (D-38): a RLS
 *    já o barraria (as escritas pedem `not eh_admin_repply()`), mas a resposta
 *    é uma frase do produto, não zero linhas silenciosas;
 *  - o apagar-de-verdade é ação à parte, só admin (`exigirAdmin()`), com a
 *    chave de serviço — o único caminho que apaga a linha (o banco não tem
 *    política de DELETE para `authenticated`);
 *  - renomear, arquivar e excluir nunca tocam em conversa excluída: ela sumiu
 *    da vista do dono, e zero linhas afetadas nunca é sucesso.
 *
 * Excluir é só uma marca (`excluida_em`): a linha continua no banco e a faxina
 * apaga de verdade após 60 dias (D-75). Excluir de novo não recomeça o prazo:
 * conversa já excluída devolve ok sem escrever. Arquivar também é marca
 * (`arquivada_em`) e pode ser desfeito. Todo erro vira frase do produto; o log
 * leva só o código (D-29).
 */

const FRASE_ADMIN =
  "no modo leitura do admin não dá para organizar as conversas";
const FRASE_CONVERSA = "não encontrei essa conversa; comece uma nova";
const FRASE_TITULO_VAZIO = "escreva um título para a conversa";
const FALHA_ORGANIZAR =
  "não foi possível organizar as conversas agora. Tente de novo em instantes.";
const FALHA_APAGAR =
  "não foi possível apagar a conversa agora. Tente de novo em instantes.";
const FRASE_SOMENTE_EXCLUIDA =
  "só dá para apagar de verdade a conversa que o dono já excluiu";

const CODIGO_NO_LOG = "falha_sessoes_mentor";

/**
 * O mesmo teto do título que nasce sozinho da primeira pergunta
 * (`tituloDe` em `conversa.ts`). Constante própria, de propósito: importar o
 * cérebro aqui puxaria o provedor de IA para este arquivo, e nada de IA gera
 * título (YAGNI). Se o teto mudar lá, muda aqui junto.
 */
const TAMANHO_DO_TITULO = 60;

const FRASE_TITULO_LONGO = `o título ficou longo demais; use até ${TAMANHO_DO_TITULO} letras`;

const tituloSchema = z
  .string({ error: FRASE_TITULO_VAZIO })
  .trim()
  .min(1, FRASE_TITULO_VAZIO)
  .max(TAMANHO_DO_TITULO, FRASE_TITULO_LONGO);

const idSchema = z.uuid();

function falhaAoOrganizar(): Resultado {
  logError(CODIGO_NO_LOG);
  return { ok: false, error: FALHA_ORGANIZAR };
}

/**
 * Renomeia uma conversa da casa da sessão. O título vem aparado, nem vazio
 * nem com mais de 60 letras.
 */
export async function renomearConversa(
  slug: string,
  conversaId: string,
  titulo: string
): Promise<Resultado> {
  const { casa, modoAdmin } = await exigirCasa(slug);
  if (modoAdmin) return { ok: false, error: FRASE_ADMIN };

  const validado = tituloSchema.safeParse(titulo);
  if (!validado.success) {
    return {
      ok: false,
      error: validado.error.issues[0]?.message ?? FRASE_TITULO_VAZIO,
    };
  }
  if (!idSchema.safeParse(conversaId).success) {
    return { ok: false, error: FRASE_CONVERSA };
  }

  const supabase = await createClient();
  const escrita = await supabase
    .from("mentor_conversas")
    .update({ titulo: validado.data })
    .eq("id", conversaId)
    .eq("restaurante_id", casa.id)
    .is("excluida_em", null)
    .select("id");
  if (escrita.error) return falhaAoOrganizar();
  // Zero linhas: não é desta casa ou sumiu da vista do dono (excluída).
  if (!escrita.data || escrita.data.length !== 1) {
    return { ok: false, error: FRASE_CONVERSA };
  }

  revalidatePath(`/r/${slug}/mentor`);
  return { ok: true };
}

/**
 * Arquiva (`arquivar = true`) ou traz de volta (`arquivar = false`) uma
 * conversa da casa da sessão.
 */
export async function arquivarConversa(
  slug: string,
  conversaId: string,
  arquivar: boolean
): Promise<Resultado> {
  const { casa, modoAdmin } = await exigirCasa(slug);
  if (modoAdmin) return { ok: false, error: FRASE_ADMIN };

  if (typeof arquivar !== "boolean") return falhaAoOrganizar();
  if (!idSchema.safeParse(conversaId).success) {
    return { ok: false, error: FRASE_CONVERSA };
  }

  const supabase = await createClient();
  const escrita = await supabase
    .from("mentor_conversas")
    .update({ arquivada_em: arquivar ? new Date().toISOString() : null })
    .eq("id", conversaId)
    .eq("restaurante_id", casa.id)
    .is("excluida_em", null)
    .select("id");
  if (escrita.error) return falhaAoOrganizar();
  if (!escrita.data || escrita.data.length !== 1) {
    return { ok: false, error: FRASE_CONVERSA };
  }

  revalidatePath(`/r/${slug}/mentor`);
  return { ok: true };
}

/**
 * Exclui uma conversa da casa da sessão: só marca `excluida_em`, sem apagar a
 * linha. Idempotente: conversa já excluída devolve ok sem escrever (a data
 * original fica valendo e o prazo de 60 dias não recomeça).
 */
export async function excluirConversa(
  slug: string,
  conversaId: string
): Promise<Resultado> {
  const { casa, modoAdmin } = await exigirCasa(slug);
  if (modoAdmin) return { ok: false, error: FRASE_ADMIN };

  if (!idSchema.safeParse(conversaId).success) {
    return { ok: false, error: FRASE_CONVERSA };
  }

  const supabase = await createClient();
  const atual = await supabase
    .from("mentor_conversas")
    .select("id, excluida_em")
    .eq("id", conversaId)
    .eq("restaurante_id", casa.id)
    .maybeSingle();
  if (atual.error) return falhaAoOrganizar();
  if (!atual.data) return { ok: false, error: FRASE_CONVERSA };
  if (atual.data.excluida_em !== null) return { ok: true };

  const escrita = await supabase
    .from("mentor_conversas")
    .update({ excluida_em: new Date().toISOString() })
    .eq("id", conversaId)
    .eq("restaurante_id", casa.id)
    .is("excluida_em", null)
    .select("id");
  if (escrita.error) return falhaAoOrganizar();
  if (!escrita.data || escrita.data.length !== 1) {
    return { ok: false, error: FRASE_CONVERSA };
  }

  revalidatePath(`/r/${slug}/mentor`);
  return { ok: true };
}

/**
 * Apaga uma conversa DE VERDADE, com as mensagens (o `on delete cascade`
 * leva elas junto). Só o admin no suporte, com a chave de serviço: o dono
 * nunca alcança este caminho (`exigirAdmin()` é a primeira linha, antes até
 * de olhar o id).
 *
 * Só apaga conversa EXCLUÍDA (`excluida_em` não nulo): a tela só mostra o
 * botão na excluída, e a ação garante o mesmo — sem exclusão do dono, frase
 * de produto e nenhum DELETE. O DELETE repete o filtro, contra a corrida em
 * que a conversa deixou de ser excluída entre a leitura e a escrita.
 */
export async function apagarConversaDeVerdade(
  conversaId: string
): Promise<Resultado> {
  await exigirAdmin();
  if (!idSchema.safeParse(conversaId).success) {
    return { ok: false, error: FRASE_CONVERSA };
  }

  const banco = createServiceClient();
  const atual = await banco
    .from("mentor_conversas")
    .select("id, excluida_em")
    .eq("id", conversaId)
    .maybeSingle();
  if (atual.error) {
    logError(CODIGO_NO_LOG);
    return { ok: false, error: FALHA_APAGAR };
  }
  if (!atual.data) return { ok: false, error: FRASE_CONVERSA };
  if (atual.data.excluida_em === null) {
    return { ok: false, error: FRASE_SOMENTE_EXCLUIDA };
  }

  const apagada = await banco
    .from("mentor_conversas")
    .delete()
    .eq("id", conversaId)
    .not("excluida_em", "is", null)
    .select("id");
  if (apagada.error) {
    logError(CODIGO_NO_LOG);
    return { ok: false, error: FALHA_APAGAR };
  }
  if (!apagada.data || apagada.data.length !== 1) {
    return { ok: false, error: FRASE_CONVERSA };
  }

  revalidatePath("/admin/mentor/conversas");
  return { ok: true };
}
