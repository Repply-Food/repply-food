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

/**
 * Um anexo pronto para a IA: o tipo declarado (da extensão), o mime
 * conferido, o nome seguro e o conteúdo em base64. A extração de memória
 * NUNCA recebe anexos: ficha é texto, arquivo é conteúdo da conversa.
 */
export type AnexoParaIA = {
  tipo: "imagem" | "pdf" | "planilha";
  mime: string;
  nome: string;
  dados: string; // base64
};

export interface ProvedorIA {
  responder(entrada: {
    instrucoes: string; // trilhos + cartilha
    historico: MensagemIA[]; // a conversa até aqui
    ferramentas: DefinicaoFerramenta[];
    resultados?: ResultadoFerramenta[]; // devoluções de ferramenta da rodada anterior
    anexos?: AnexoParaIA[]; // arquivos da pergunta atual, só na primeira chamada
  }): Promise<RespostaIA>;
}
