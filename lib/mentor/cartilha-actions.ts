"use server";

import "server-only";
import type { Resultado } from "@/lib/admin/tipos";
import { exigirAdmin } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * Salvar a cartilha do mentor (o texto que afina as respostas dele). Quem chama
 * uma função do servidor pode ser qualquer um, com qualquer argumento, então a
 * decisão mora aqui e não na página:
 *  1. `exigirAdmin()` é a PRIMEIRA linha. O cliente de serviço ignora a RLS, e
 *     essa é a única trava entre a internet e o prompt de todos os mentores;
 *  2. o texto é validado aqui (aparado, nem vazio nem gigante);
 *  3. a tela recebe frase do produto; o log leva só o código (nunca o texto da
 *     cartilha nem o `error.message` do Postgres).
 *
 * Um arquivo "use server" só exporta funções async: constantes e tipos ficam de
 * fora (foi o que travou o build da tela do mentor).
 */

const FRASE_VAZIA = "Escreva o texto da cartilha.";
const FRASE_LONGA =
  "A cartilha ficou longa demais; resuma em até 20.000 caracteres.";
const FALHA =
  "Não foi possível salvar a cartilha agora. Tente de novo em instantes.";

/** A cartilha vai inteira ao modelo a cada pergunta de cada dono: tem teto. */
const TAMANHO_MAXIMO = 20_000;

const textoSchema = z
  .string({ error: FRASE_VAZIA })
  .trim()
  .min(1, FRASE_VAZIA)
  .max(TAMANHO_MAXIMO, FRASE_LONGA);

export async function salvarCartilhaAction(texto: string): Promise<Resultado> {
  const sessao = await exigirAdmin();
  const validado = textoSchema.safeParse(texto);
  if (!validado.success) {
    return {
      ok: false,
      error: validado.error.issues[0]?.message ?? FRASE_VAZIA,
    };
  }

  const banco = createServiceClient();

  // 1) Insere a nova versão, ativa. Primeiro ela, depois a limpeza: se a segunda
  //    etapa falhar sobram DUAS ativas e vale a mais recente (a nova). Na ordem
  //    inversa, uma falha deixaria ZERO ativas e o mentor responderia sem a voz
  //    que a Repply afinou. `.single()` dá erro se não voltar exatamente uma
  //    linha: zero linhas escritas nunca é sucesso.
  const { data: nova, error: erroDoInsert } = await banco
    .from("mentor_cartilhas")
    .insert({ texto: validado.data, ativa: true, criada_por: sessao.userId })
    .select("id, criada_em")
    .single();
  if (erroDoInsert || !nova) {
    logError("falha_admin");
    return { ok: false, error: FALHA };
  }

  // 2) Desativa as ativas MAIS ANTIGAS que a nova (histórico preservado). Não
  //    é `id <> nova`: duas pessoas salvando ao mesmo tempo desativariam a
  //    versão uma da outra e sobrariam zero. Comparando por data, sobra sempre a
  //    mais recente. Aqui zero linhas é normal (pode não haver cartilha anterior
  //    ativa), então não se exige contagem; só o erro conta, e ele não desfaz o
  //    salvamento: a nova já é a que vale. Vai para o log; o próximo salvamento
  //    limpa a sobra.
  const { error: erroDaLimpeza } = await banco
    .from("mentor_cartilhas")
    .update({ ativa: false })
    .eq("ativa", true)
    .lt("criada_em", nova.criada_em);
  if (erroDaLimpeza) logError("falha_admin");

  revalidatePath("/admin/mentor");
  return { ok: true };
}
