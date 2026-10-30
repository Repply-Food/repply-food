export type MensagemIA = { papel: "dono" | "mentor"; texto: string };
export type DefinicaoFerramenta = {
  nome: string;
  descricao: string;
  parametros: Record<string, unknown>; // JSON Schema
};
export type PedidoFerramenta = {
  nome: string;
  argumentos: Record<string, unknown>;
};
export type RespostaIA =
  | { tipo: "texto"; texto: string }
  | { tipo: "ferramenta"; pedidos: PedidoFerramenta[] };
export type ResultadoFerramenta = { nome: string; resultado: unknown };

export interface ProvedorIA {
  responder(entrada: {
    instrucoes: string; // trilhos + cartilha
    historico: MensagemIA[]; // a conversa até aqui
    ferramentas: DefinicaoFerramenta[];
    resultados?: ResultadoFerramenta[]; // devoluções de ferramenta da rodada anterior
  }): Promise<RespostaIA>;
}
