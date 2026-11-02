import "server-only";
import { exigirAdmin } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

/**
 * A leitura da cartilha para o editor do admin. A cartilha é o "prompt" do
 * mentor e o dono NUNCA a enxerga. Por isso:
 *  - `exigirAdmin()` vem primeiro, dentro da própria leitura: a RLS devolveria
 *    zero linhas a quem não é admin, e zero linhas aqui significaria "sem
 *    cartilha" (um editor vazio, em vez de barrar a pessoa);
 *  - a leitura vai pelo cliente do admin logado (a RLS é a segunda trava). Não
 *    usa a função `mentor_cartilha_ativa()`: ela é só do cliente de serviço e
 *    devolve só o texto; é do cérebro do mentor (`lib/mentor/conversa.ts`).
 *
 * Falha de leitura vira a tela de erro (`app/error.tsx`), nunca "sem cartilha":
 * um editor vazio convidaria o admin a salvar por cima de um texto que ele
 * simplesmente não conseguiu ver. O log leva só o código.
 */

export type CartilhaAtiva = {
  id: string;
  texto: string;
  criada_em: string;
};

/**
 * A cartilha que vale agora: a ativa mais recente (o mesmo critério da função
 * do cérebro, com o desempate pelo id). Nulo se não houver nenhuma ativa.
 */
export async function cartilhaAtiva(): Promise<CartilhaAtiva | null> {
  await exigirAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mentor_cartilhas")
    .select("id, texto, criada_em")
    .eq("ativa", true)
    .order("criada_em", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logError("falha_admin");
    throw new Error("falha_leitura_cartilha");
  }
  return data
    ? { id: data.id, texto: data.texto, criada_em: data.criada_em }
    : null;
}
