"use server";

import { exigirCasa } from "@/lib/auth/sessao";
import { z } from "zod";
import { responderNoMentor } from "./conversa";

/**
 * A fronteira de segurança da tela do mentor. A tela já esconde o campo do
 * admin e já limita o texto, mas NADA disso vale aqui: quem chama uma função do
 * servidor pode ser qualquer um, com qualquer argumento. Por isso esta função
 * confere tudo por dentro:
 *  - o restaurante é o da SESSÃO (`exigirCasa`), nunca um argumento;
 *  - o admin em modo leitura não envia (D-38) e não gasta o limite do cliente;
 *  - o texto é validado aqui, antes de chegar ao cérebro.
 *
 * O provedor de IA NÃO é argumento nem variável de módulo: o cérebro cria uma
 * instância por chamada (o Gemini guarda estado nela e duas requisições não
 * podem dividir).
 *
 * TEMPO: o cérebro pode fazer até ~6 chamadas ao provedor, e a Vercel mata a
 * função no tempo padrão. Um arquivo "use server" só pode exportar funções, então
 * o `maxDuration` não mora aqui: fica em `app/r/[slug]/mentor/page.tsx`, e o
 * Next aplica o da página a toda função do servidor chamada por ela.
 */

const FRASE_ADMIN = "no modo leitura do admin o mentor não responde";
const FRASE_VAZIA = "escreva sua pergunta para o mentor";
const FRASE_LONGA =
  "sua pergunta ficou longa demais; resuma em até 4000 caracteres";

const TAMANHO_MAXIMO_DA_PERGUNTA = 4000;

const perguntaSchema = z
  .string({ error: FRASE_VAZIA })
  .trim()
  .min(1, FRASE_VAZIA)
  .max(TAMANHO_MAXIMO_DA_PERGUNTA, FRASE_LONGA);

type Resultado =
  | { ok: true; data: { conversaId: string; resposta: string } }
  | { ok: false; error: string };

export async function enviarMensagemAction(
  slug: string,
  conversaId: string | null,
  texto: string
): Promise<Resultado> {
  // Guarda primeiro: o restaurante só pode vir daqui.
  const { casa, modoAdmin } = await exigirCasa(slug);
  if (modoAdmin) return { ok: false, error: FRASE_ADMIN };

  const pergunta = perguntaSchema.safeParse(texto);
  if (!pergunta.success) {
    return {
      ok: false,
      error: pergunta.error.issues[0]?.message ?? FRASE_VAZIA,
    };
  }

  const resultado = await responderNoMentor({
    restauranteId: casa.id,
    conversaId,
    mensagemDoDono: pergunta.data,
  });
  if (!resultado.ok) return { ok: false, error: resultado.error };
  return {
    ok: true,
    data: { conversaId: resultado.conversaId, resposta: resultado.resposta },
  };
}
