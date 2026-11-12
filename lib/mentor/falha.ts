import "server-only";

/**
 * A falha já classificada do mentor: só o código vai para o log, nunca o
 * motivo cru (pergunta do dono, nome de arquivo, erro do banco ou do
 * provedor — D-29).
 *
 * Módulo-folha, sem dependências: `conversa.ts` (cérebro) e `anexos.ts`
 * (arquivos) lançam a MESMA classe, então o `enviar-action`, que cruza os
 * dois, pega os dois lados com um único `instanceof`.
 */
export type CodigoDeFalha =
  | "falha_mentor_provedor"
  | "falha_mentor_limite"
  | "falha_mentor_geral"
  | "falha_anexos_mentor";

export class FalhaDoMentor extends Error {
  constructor(readonly codigo: CodigoDeFalha) {
    super(codigo);
  }
}
