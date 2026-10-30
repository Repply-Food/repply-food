import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Teto de usos do mentor por casa em cada dia de operação. Folgado de
 * propósito no v1; "configurar" é trocar esta constante (o banco não guarda
 * teto por casa).
 */
export const TETO_DIARIO = 50;

/**
 * Conta mais um uso do mentor na casa (no dia de operação dela) e diz se ainda
 * está dentro do teto. Usa o cliente do dono: a RLS garante que ele só mexe no
 * uso da casa dele. O incremento acontece mesmo quando barra (no v1, uma
 * tentativa barrada conta).
 *
 * Qualquer erro do contador LANÇA: quem chama trata como "não dá para seguir
 * agora". Nunca devolve `true` por falta de resposta, e a mensagem do banco não
 * sai daqui.
 */
export async function dentroDoLimite(restauranteId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mentor_registrar_uso", {
    p_restaurante_id: restauranteId,
  });
  if (error || typeof data !== "number") {
    throw new Error("falha_ao_registrar_uso_do_mentor");
  }
  return data <= TETO_DIARIO;
}
