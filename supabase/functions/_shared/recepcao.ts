import { z } from "zod";

/**
 * Validação do envelope do SCC (contrato-de-dados.md §4 e §5).
 *
 * Cópia canônica: a Edge Function `receber-envio` (Deno) importa daqui e o
 * Node (gerador de dados fictícios e testes) importa via
 * `lib/validators/recepcao.ts`, que só re-exporta este arquivo.
 */

const DATA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function dataNoCalendario(valor: string): boolean {
  const partes = DATA_RE.exec(valor);
  if (!partes) {
    return false;
  }
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  if (mes < 1 || mes > 12 || dia < 1) {
    return false;
  }
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}

/** Data local `AAAA-MM-DD` no calendário real (rejeita `2026-13-40`). */
const dataLocal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "formato AAAA-MM-DD")
  .refine(dataNoCalendario, "data fora do calendário");

/** Hora local `HH:MM:SS` (rejeita `25:99:99`). */
const horaLocal = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/, "formato HH:MM:SS");

/** Dinheiro em número com no máximo 2 casas decimais. */
const dinheiro = z
  .number()
  .finite()
  .refine((valor) => Number(valor.toFixed(2)) === valor, {
    message: "no máximo 2 casas decimais",
  });

/** `"Sim"`/`"Não"` ou booleano (contrato §5). */
const pago = z.union([z.literal("Sim"), z.literal("Não"), z.boolean()]);

const entradaSchema = z
  .object({
    codEntrada: z.number().int(),
    DataEntrada: dataLocal,
    HoraEntrada: horaLocal,
    DataSaida: dataLocal.nullable().optional(),
    HoraSaida: horaLocal.nullable().optional(),
    ValorItens: dinheiro.optional(),
    ValorDescontos: dinheiro.optional(),
    ValorAcrescimos: dinheiro.optional(),
    TaxaServico: dinheiro.optional(),
    Complemento: dinheiro.optional(),
    ValorConsumido: dinheiro,
    Pago: pago,
    codCartaoMesa: z.number().int().nullable().optional(),
    CodGarcon: z.number().int().nullable().optional(),
    codOperadorHab: z.number().int().nullable().optional(),
    codOperadorDesab: z.number().int().nullable().optional(),
    codCliente: z.number().int().nullable().optional(),
    NumeroOcupantes: z.number().int().optional(),
    TipoOcupacao: z.string().optional(),
    TipoCartao: z.string().nullable().optional(),
  })
  // Campos desconhecidos são preservados: o `processar_envio` os leva para extras.
  .passthrough();

export const envelopeSchema = z
  .object({
    versao_formato: z.literal(1),
    versao_scc: z.string().min(1, "obrigatório"),
    enviado_em: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/,
        "formato AAAA-MM-DDTHH:MM:SS"
      ),
    modo: z.literal("janela"),
    janela: z
      .object({
        desde: dataLocal,
        ate: dataLocal,
      })
      .refine((janela) => janela.desde <= janela.ate, {
        message: "janela.desde depois de janela.ate",
      }),
    // Sempre 1/1 na versão 1 (contrato §4); reservado para o futuro.
    lote: z.object({
      numero: z.literal(1),
      total: z.literal(1),
    }),
    // O limite de 2.000 entradas responde 413 no receber-envio, não 422
    // (contrato §7), por isso não entra no schema.
    entradas: z.array(entradaSchema),
  })
  .passthrough();

export type Envelope = z.infer<typeof envelopeSchema>;

export function validarEnvelope(dados: unknown) {
  return envelopeSchema.safeParse(dados);
}
