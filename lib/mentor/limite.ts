import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Teto de usos do mentor por casa em cada dia de operação. Folgado de
 * propósito no v1; "configurar" é trocar esta constante (o banco não guarda
 * teto por casa).
 */
export const TETO_DIARIO = 50;

/**
 * Conta mais um uso do mentor na casa (no dia de operação dela) e diz se ainda
 * está dentro do teto. Usa o cliente do dono: a função do banco confere por
 * dentro que ele tem acesso à casa. O incremento é atômico e acontece ANTES de
 * qualquer chamada à IA (dois pedidos simultâneos não furam o teto), e também
 * quando barra: a tentativa barrada pelo teto conta. Já a tentativa em que a IA
 * não foi alcançada é devolvida por `devolverUso`.
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

/**
 * Devolve o uso que `dentroDoLimite` contou nesta MESMA chamada, quando a IA não
 * foi alcançada: a falha é nossa e não pode gastar a cota do dono. Só o cliente
 * de serviço executa a função do banco (se o dono pudesse, baixaria o próprio
 * contador e furaria o teto de custo), e `restauranteId` é o da sessão, nunca
 * do cliente. Quem chama só a usa depois de um `dentroDoLimite` que liberou.
 *
 * Erro LANÇA: quem chama decide o que fazer (o cérebro registra e segue, sem
 * esconder a falha original). A mensagem do banco não sai daqui.
 */
export async function devolverUso(restauranteId: string): Promise<void> {
  const { error } = await createServiceClient().rpc("mentor_devolver_uso", {
    p_restaurante_id: restauranteId,
  });
  if (error) throw new Error("falha_ao_devolver_uso_do_mentor");
}
