import { z } from "zod";

// Mês = dia 1 de um mês real (01–12).
const MES = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
// numeric(12,2): até 10 dígitos inteiros e 2 casas.
const VALOR = /^\d{1,10}(\.\d{1,2})?$/;

export const metaSchema = z.object({
  mes: z.string().regex(MES, "Mês inválido."),
  // "" remove a meta do mês; qualquer valor presente cabe em numeric(12,2) e é > 0.
  valor: z
    .string()
    .refine((v) => v === "" || VALOR.test(v), {
      message: "Valor inválido ou alto demais (até 10 dígitos).",
    })
    .refine((v) => v === "" || Number(v) > 0, {
      message: "Informe um valor maior que zero.",
    }),
});
export type MetaInput = z.infer<typeof metaSchema>;

export const turnosSchema = z.object({
  almocoAte: z.string().regex(HORA, "Informe um horário válido (ex.: 17:00)."),
});
export type TurnosInput = z.infer<typeof turnosSchema>;
