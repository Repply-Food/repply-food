import type { Relatorio } from "@/lib/validators/relatorios";
import { z } from "zod";
import {
  codigoSchema,
  dataCivilSchema,
  inteiroPositivoSchema,
  linhaAuditoriaSchema,
  linhaCaixaSchema,
} from "../../supabase/functions/_shared/relatorios/schemas";
import { REGISTRO_RELATORIOS } from "./registro";
import type { ConsultaRelatorio } from "./tipos";

export const revisaoSchema = z.string().regex(/^(0|[1-9]\d*)$/);
const inteiroUrl = (schema: z.ZodNumber) =>
  z.string().regex(/^\d+$/).transform(Number).pipe(schema);
const filtrosSchema = z
  .object({
    inicio: dataCivilSchema,
    fim: dataCivilSchema,
    fonte: z.enum(["historico", "online"]),
    pdv: codigoSchema.optional(),
    grupo: codigoSchema.optional(),
    garcom: codigoSchema.optional(),
    mesaDe: inteiroUrl(inteiroPositivoSchema).optional(),
    mesaAte: inteiroUrl(inteiroPositivoSchema).optional(),
    operador: codigoSchema.optional(),
    tipo: z.string().optional(),
    categoria: z.string().optional(),
    cliente: codigoSchema.optional(),
  })
  .strict();
const consultaUrlSchema = filtrosSchema
  .extend({
    pagina: inteiroUrl(z.number().int().min(1).max(2_147_483_647)).optional(),
    revisao: revisaoSchema.optional(),
  })
  .strict();

/** Não aplica defaults de data/fonte: toda consulta informa o movimento SCC. */
export function parseConsulta(
  relatorio: Relatorio,
  entrada: URLSearchParams
): ConsultaRelatorio {
  const permitidos = new Set<string>([
    "inicio",
    "fim",
    "fonte",
    "pagina",
    "revisao",
    ...REGISTRO_RELATORIOS[relatorio].filtros,
  ]);
  const valores: Record<string, string> = {};
  const recebidos = new Set<string>();
  for (const [chave, valor] of entrada) {
    if (!permitidos.has(chave) || recebidos.has(chave))
      throw new Error("consulta_invalida");
    recebidos.add(chave);
    if (
      valor === "" &&
      !["inicio", "fim", "fonte", "pagina", "revisao"].includes(chave)
    )
      continue;
    valores[chave] = valor;
  }
  const { pagina = 1, revisao, ...filtros } = consultaUrlSchema.parse(valores);
  const dias =
    (Date.parse(`${filtros.fim}T00:00:00Z`) -
      Date.parse(`${filtros.inicio}T00:00:00Z`)) /
      86_400_000 +
    1;
  if (dias < 1 || dias > 366 || (filtros.fonte === "online" && dias !== 1))
    throw new Error("periodo_invalido");
  if (
    filtros.mesaDe !== undefined &&
    filtros.mesaAte !== undefined &&
    filtros.mesaDe > filtros.mesaAte
  )
    throw new Error("mesa_invalida");
  if (filtros.tipo !== undefined) {
    if (relatorio === "caixa") linhaCaixaSchema.shape.tipo.parse(filtros.tipo);
    else if (relatorio === "auditoria")
      linhaAuditoriaSchema.shape.tipo.parse(filtros.tipo);
    else throw new Error("tipo_invalido");
  }
  if (filtros.categoria !== undefined) {
    const partes = filtros.categoria.split(":");
    if (partes.length !== 2) throw new Error("categoria_invalida");
    const direcao = linhaCaixaSchema.shape.tipo.parse(partes[0]);
    codigoSchema.parse(partes[1]);
    if (filtros.tipo !== undefined && filtros.tipo !== direcao)
      throw new Error("categoria_invalida");
  }
  return { filtros, pagina, ...(revisao === undefined ? {} : { revisao }) };
}

export function serializarConsulta(consulta: ConsultaRelatorio): string {
  const parametros = new URLSearchParams();
  const chaves = [
    "inicio",
    "fim",
    "fonte",
    "pdv",
    "grupo",
    "garcom",
    "mesaDe",
    "mesaAte",
    "operador",
    "tipo",
    "categoria",
    "cliente",
  ] as const;
  for (const chave of chaves) {
    const valor = consulta.filtros[chave];
    if (valor !== undefined) parametros.set(chave, String(valor));
  }
  parametros.set("pagina", String(consulta.pagina));
  if (consulta.revisao !== undefined)
    parametros.set("revisao", consulta.revisao);
  return parametros.toString();
}
