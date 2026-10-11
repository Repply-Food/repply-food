/**
 * Validação do envelope do SCC para o Node (gerador de dados fictícios e
 * testes). A cópia canônica vive em
 * `supabase/functions/_shared/recepcao.ts` porque a Edge Function
 * `receber-envio` só importa de dentro de `supabase/functions/`.
 */
export {
  envelopeSchema,
  validarEnvelope,
  type Envelope,
} from "../../supabase/functions/_shared/recepcao.ts";
