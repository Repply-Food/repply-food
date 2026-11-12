import "server-only";
import { ProvedorGemini } from "./gemini";
import type { ProvedorIA } from "./tipos";

export type {
  AnexoParaIA,
  DefinicaoFerramenta,
  MensagemIA,
  PedidoFerramenta,
  ProvedorIA,
  RespostaIA,
  ResultadoFerramenta,
} from "./tipos";

/** Um provedor que só falha, com a causa dita com clareza, quando alguém o usa. */
function provedorQueFalha(motivo: string): ProvedorIA {
  return {
    responder: async () => {
      throw new Error(motivo);
    },
  };
}

/**
 * Escolhe o provedor de IA do mentor pelo ambiente (MENTOR_IA_PROVEDOR, padrão
 * "gemini"). Nunca lança ao ser chamada: assim importar o mentor não quebra a
 * build nem o servidor sem a chave. O erro aparece só ao pedir uma resposta.
 * Devolve uma instância nova a cada chamada: use uma por requisição.
 */
export function escolherProvedor(): ProvedorIA {
  const chave = process.env.MENTOR_IA_CHAVE?.trim();
  if (!chave) return provedorQueFalha("MENTOR_IA_CHAVE ausente");

  const nome = process.env.MENTOR_IA_PROVEDOR?.trim().toLowerCase() || "gemini";
  switch (nome) {
    case "gemini":
      return new ProvedorGemini({ chave });
    default:
      return provedorQueFalha("MENTOR_IA_PROVEDOR desconhecido");
  }
}
