/**
 * O que `responderNoMentor` devolve. No erro, `error` é sempre uma frase do
 * produto, escrita para o dono ler: nunca o texto de um erro do banco, do
 * provedor de IA ou de qualquer outra camada (CLAUDE.md §5).
 */
export type ResultadoDoMentor =
  | { ok: true; conversaId: string; resposta: string }
  | { ok: false; error: string };
