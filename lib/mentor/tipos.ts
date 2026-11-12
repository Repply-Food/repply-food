/**
 * O que `responderNoMentor` devolve. No erro, `error` é sempre uma frase do
 * produto, escrita para o dono ler: nunca o texto de um erro do banco, do
 * provedor de IA ou de qualquer outra camada (CLAUDE.md §5).
 *
 * No sucesso, `anexosFalharam` diz se algum anexo não entrou (subida ou
 * vínculo): falso quando tudo ok (ou sem anexo); verdadeiro é o aviso "alguns
 * anexos não entraram, reenvie só eles" — a resposta sai mesmo assim.
 */
export type ResultadoDoMentor =
  | {
      ok: true;
      conversaId: string;
      resposta: string;
      anexosFalharam: boolean;
    }
  | { ok: false; error: string };
