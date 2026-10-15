import { entrarSchema } from "@/lib/auth/schemas";
import { z } from "zod";
import { cnpjValido, formatarCnpj, limparCnpj } from "./cnpj";
import { diaValido, somarDias } from "./datas";
import { FUSO_PADRAO, ehFusoDoBrasil } from "./fusos";
import {
  DIA_FECHADO,
  type Intervalo,
  formularioDosIntervalos,
  intervalosDoFormulario,
  intervalosSchema,
  problemaNoDia,
} from "./horario";

const diaSchema = z.object({
  modo: z.enum(["fechado", "um", "dois"]),
  abre1: z.string(),
  fecha1: z.string(),
  abre2: z.string(),
  fecha2: z.string(),
});

/**
 * Cadastro e edição (mesmo formulário). Os erros apontam o campo; o do "pelo
 * menos um dia aberto" aponta `dias` (o react-hook-form o põe em
 * `errors.dias.root`). O servidor confere de novo com este mesmo esquema.
 */
export const restauranteSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(2, "Digite o nome do restaurante")
      .max(80, "Use até 80 caracteres"),
    cnpj: z.string().trim().max(20, "CNPJ inválido: confira os números"),
    fuso: z.string(),
    horaVirada: z.string(),
    dias: z.array(diaSchema).length(7),
  })
  .superRefine((d, ctx) => {
    const cnpj = limparCnpj(d.cnpj);
    if (cnpj !== "" && !cnpjValido(cnpj)) {
      ctx.addIssue({
        code: "custom",
        path: ["cnpj"],
        message: "CNPJ inválido: confira os números",
      });
    }
    if (!ehFusoDoBrasil(d.fuso)) {
      ctx.addIssue({
        code: "custom",
        path: ["fuso"],
        message: "Escolha um fuso da lista",
      });
    }
    if (!/^([0-9]|1[0-9]|2[0-3])$/.test(d.horaVirada)) {
      ctx.addIssue({
        code: "custom",
        path: ["horaVirada"],
        message: "Escolha a hora",
      });
    }
    d.dias.forEach((dia, indice) => {
      const problema = problemaNoDia(dia);
      if (problema) {
        ctx.addIssue({
          code: "custom",
          path: ["dias", indice],
          message: problema,
        });
      }
    });
    if (d.dias.every((dia) => dia.modo === "fechado")) {
      ctx.addIssue({
        code: "custom",
        path: ["dias"],
        message: "Abra a casa em pelo menos um dia",
      });
    }
  });
export type RestauranteInput = z.infer<typeof restauranteSchema>;

export const VALORES_INICIAIS: RestauranteInput = {
  nome: "",
  cnpj: "",
  fuso: FUSO_PADRAO,
  horaVirada: "5",
  dias: Array.from({ length: 7 }, () => ({ ...DIA_FECHADO })),
};

export type DadosDoRestaurante = {
  nome: string;
  cnpj: string | null;
  fuso: string;
  hora_virada: string;
  horario_funcionamento: Intervalo[];
};

/** Do formulário (já validado) para as colunas de `restaurantes`. */
export function paraOBanco(d: RestauranteInput): DadosDoRestaurante {
  const cnpj = limparCnpj(d.cnpj);
  return {
    nome: d.nome,
    cnpj: cnpj === "" ? null : cnpj,
    fuso: d.fuso,
    hora_virada: `${d.horaVirada.padStart(2, "0")}:00`,
    horario_funcionamento: intervalosDoFormulario(d.dias),
  };
}

/** Da linha de `restaurantes` para o formulário de edição. */
export function formularioDoRestaurante(r: {
  nome: string;
  cnpj: string | null;
  fuso: string;
  hora_virada: string;
  horario_funcionamento: unknown;
}): RestauranteInput {
  const intervalos = intervalosSchema.safeParse(r.horario_funcionamento);
  return {
    nome: r.nome,
    cnpj: r.cnpj ? formatarCnpj(r.cnpj) : "",
    fuso: r.fuso,
    horaVirada: String(Number(r.hora_virada.slice(0, 2))),
    dias: formularioDosIntervalos(intervalos.success ? intervalos.data : []),
  };
}

/** O mesmo e-mail da tela de entrar: limpo e minúsculo. */
export const emailSchema = z.object({ email: entrarSchema.shape.email });
export type EmailInput = z.infer<typeof emailSchema>;

export const DIAS_MAXIMOS_DO_REENVIO = 120;

export function primeiroDiaDoReenvio(hoje: string): string {
  return somarDias(hoje, -DIAS_MAXIMOS_DO_REENVIO);
}

/** `hoje` é o dia de hoje no fuso da casa (`hojeNaCasa`). */
export function problemaNoReenvio(desde: string, hoje: string): string | null {
  if (!diaValido(desde)) return "Escolha uma data válida.";
  if (desde > hoje) return "A data não pode ser no futuro.";
  if (desde < primeiroDiaDoReenvio(hoje)) {
    return `A data não pode ser anterior a ${DIAS_MAXIMOS_DO_REENVIO} dias.`;
  }
  return null;
}
