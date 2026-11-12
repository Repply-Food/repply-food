"use server";

import "server-only";
import { exigirCasa } from "@/lib/auth/sessao";
import { casaTemModulo } from "@/lib/painel/modulos";
import { z } from "zod";
import { urlParaBaixar } from "./anexos";

/**
 * A ação de baixar anexo do mentor. A mesma fronteira de segurança da tela de
 * envio (`enviar-action.ts`): quem chama uma função do servidor pode ser
 * qualquer um, com qualquer argumento, então cada função confere tudo por
 * dentro:
 *  - o restaurante é o da SESSÃO (`exigirCasa`), nunca um argumento, e vai
 *    junto do id do anexo na leitura (a RLS é a trava; o filtro é a segunda
 *    camada, porque o admin lê qualquer casa e a RLS sozinha não distingue
 *    uma da outra para ele);
 *  - o admin em modo leitura não baixa pelo caminho do dono (D-38): a RLS já
 *    o barraria (só leitura em `mentor_anexos` para `authenticated`), mas a
 *    resposta é uma frase do produto, não zero linhas silenciosas;
 *  - a casa sem o módulo do mentor não alcança (a aba nem abre, e aqui a
 *    trava se repete).
 *
 * O navegador nunca toca no cofre direto (sem política nenhuma em
 * `storage.objects`): o que sai daqui é um link assinado de 120 segundos, e
 * nunca o caminho do cofre.
 *
 * O admin no suporte baixa pelo outro caminho: a página do admin (`app/admin/
 * mentor/conversas/[id]/page.tsx`) assina cada anexo no servidor e a tela só
 * abre o link — sem botão nem ação de escrita, como manda o D-38.
 */

const FRASE_SEM_MODULO = "o mentor não está disponível nesta casa";
const FRASE_ADMIN = "no modo leitura do admin não dá para baixar anexos";
const FRASE_ANEXO = "não encontrei esse anexo";

const idSchema = z.uuid();

type ResultadoBaixar = { ok: true; url: string } | { ok: false; error: string };

/** O link temporário (120 s) para o dono baixar o anexo da casa da sessão. */
export async function baixarAnexo(
  slug: string,
  anexoId: string
): Promise<ResultadoBaixar> {
  const { casa, modoAdmin } = await exigirCasa(slug);
  if (!casaTemModulo(casa.modulos, "mentor")) {
    return { ok: false, error: FRASE_SEM_MODULO };
  }
  if (modoAdmin) return { ok: false, error: FRASE_ADMIN };

  if (!idSchema.safeParse(anexoId).success) {
    return { ok: false, error: FRASE_ANEXO };
  }

  // Nulo = não é desta casa, não existe ou o cofre falhou (com log lá
  // dentro): de todo jeito, frase do produto sem vazar o caminho.
  const url = await urlParaBaixar(casa.id, anexoId);
  if (!url) return { ok: false, error: FRASE_ANEXO };
  return { ok: true, url };
}
