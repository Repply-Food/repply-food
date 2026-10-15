import "server-only";
import { obterSessao } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import type { AcaoAdmin } from "./historico";

type ClienteServidor = Awaited<ReturnType<typeof createClient>>;

/**
 * Uma linha no histórico (D-59), pelo login do admin: a RLS só aceita
 * `autor = auth.uid()`. A falha não desfaz a ação, que já aconteceu: fica no
 * log pelo código, e a função devolve `false`.
 */
export async function registrarNoHistorico(
  supabase: ClienteServidor,
  e: {
    autor: string;
    restauranteId: string;
    acao: AcaoAdmin;
    detalhe?: string | null;
  }
): Promise<boolean> {
  const { error } = await supabase.from("registro_admin").insert({
    autor: e.autor,
    restaurante_id: e.restauranteId,
    acao: e.acao,
    detalhe: e.detalhe ?? null,
  });
  if (error) {
    logError("falha_registro_admin");
    return false;
  }
  return true;
}

/**
 * "abriu o painel do cliente" (D-59), chamado pelo layout da casa. O banco
 * aceita no máximo uma linha por hora por admin e casa (índice único): a
 * segunda tentativa dá 23505 e não é falha. Nunca lança: o painel abre mesmo
 * se o histórico falhar.
 */
export async function registrarAberturaDoPainel(
  restauranteId: string
): Promise<void> {
  try {
    const sessao = await obterSessao();
    if (!sessao?.ehAdmin) return;
    const supabase = await createClient();
    const { error } = await supabase.from("registro_admin").insert({
      autor: sessao.userId,
      restaurante_id: restauranteId,
      acao: "abriu_painel",
    });
    if (error && error.code !== "23505") logError("falha_registro_admin");
  } catch {
    logError("falha_registro_admin");
  }
}
