"use server";

import "server-only";
import type { Resultado } from "@/lib/admin/tipos";
import { exigirCasa } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * As ações das lembranças do mentor: apagar uma ficha e esquecer tudo. A
 * mesma fronteira de segurança das ações de sessão (`sessoes-actions.ts`):
 * quem chama uma função do servidor pode ser qualquer um, com qualquer
 * argumento, então cada função confere tudo por dentro:
 *  - o restaurante é o da SESSÃO (`exigirCasa`), nunca um argumento, e vai em
 *    todo filtro junto com o id da ficha (a RLS é a trava; o filtro é a
 *    segunda camada, porque o admin lê qualquer casa e a RLS sozinha não
 *    distingue uma da outra para ele);
 *  - o admin em modo leitura não mexe pelo caminho do dono (D-38): a RLS já o
 *    barraria (não há política de escrita em `mentor_memorias` para
 *    `authenticated`), mas a resposta é uma frase do produto, não zero linhas
 *    silenciosas;
 *  - a escrita vai pela chave de serviço, porque o navegador nunca escreve
 *    ficha direto (INSERT/UPDATE/DELETE recusados para `authenticated`) — o
 *    único caminho de escrita é este, após conferir a casa;
 *  - apagar ficha de outra casa devolve frase (zero linhas nunca é sucesso);
 *    esquecer-tudo sem ficha nenhuma devolve ok (nada para esquecer).
 *
 * Todo erro vira frase do produto; o log leva só o código (D-29).
 */

const FRASE_ADMIN = "no modo leitura do admin não dá para mexer nas lembranças";
const FRASE_FICHA = "não encontrei essa lembrança; ela pode ter sido apagada";
const FALHA_LEMBRANCAS =
  "não foi possível mexer nas lembranças agora. Tente de novo em instantes.";

const CODIGO_NO_LOG = "falha_memoria_mentor";

const idSchema = z.uuid();

function caminhoDasLembrancas(slug: string): string {
  return `/r/${slug}/mentor/lembrancas`;
}

function falhaNasLembrancas(): Resultado {
  logError(CODIGO_NO_LOG);
  return { ok: false, error: FALHA_LEMBRANCAS };
}

/**
 * Apaga uma ficha da casa da sessão. A ficha some da lista na hora — e o
 * mentor para de usá-la na próxima resposta.
 */
export async function apagarFicha(
  slug: string,
  fichaId: string
): Promise<Resultado> {
  const { casa, modoAdmin } = await exigirCasa(slug);
  if (modoAdmin) return { ok: false, error: FRASE_ADMIN };

  if (!idSchema.safeParse(fichaId).success) {
    return { ok: false, error: FRASE_FICHA };
  }

  const banco = createServiceClient();
  const apagada = await banco
    .from("mentor_memorias")
    .delete()
    .eq("id", fichaId)
    .eq("restaurante_id", casa.id)
    .select("id");
  if (apagada.error) return falhaNasLembrancas();
  // Zero linhas: não é desta casa ou já foi apagada.
  if (!apagada.data || apagada.data.length !== 1) {
    return { ok: false, error: FRASE_FICHA };
  }

  revalidatePath(caminhoDasLembrancas(slug));
  return { ok: true };
}

/**
 * Esquece tudo: apaga TODAS as fichas da casa da sessão, de uma vez. O mentor
 * para de usá-las na hora. Idempotente: sem ficha nenhuma devolve ok.
 */
export async function esquecerTudo(slug: string): Promise<Resultado> {
  const { casa, modoAdmin } = await exigirCasa(slug);
  if (modoAdmin) return { ok: false, error: FRASE_ADMIN };

  const banco = createServiceClient();
  const apagadas = await banco
    .from("mentor_memorias")
    .delete()
    .eq("restaurante_id", casa.id)
    .select("id");
  if (apagadas.error) return falhaNasLembrancas();

  revalidatePath(caminhoDasLembrancas(slug));
  return { ok: true };
}
