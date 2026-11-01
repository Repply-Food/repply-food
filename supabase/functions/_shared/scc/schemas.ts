import { z } from "zod";
import {
  MAX_PAGINAS,
  MAX_REGISTROS_CARGA,
  MAX_REGISTROS_PAGINA,
} from "./limites.ts";
export const decimalSchema = z.string().regex(/^-?\d{1,14}(\.\d{1,6})?$/);
export const codigoSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_.-]+$/);
export const rotulo = (max = 120) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((valor) =>
      [...valor].every((caractere) => {
        const codigo = caractere.charCodeAt(0);
        return codigo > 0x1f && (codigo < 0x7f || codigo > 0x9f);
      })
    );
const codigoNullable = codigoSchema.nullable();
const rotuloNullable = rotulo().nullable();
export const dataCivilSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((valor) => {
    const ano = Number(valor.slice(0, 4));
    const mes = Number(valor.slice(5, 7));
    const dia = Number(valor.slice(8, 10));
    if (ano < 1 || ano > 9999) return false;
    const data = new Date(0);
    data.setUTCFullYear(ano, mes - 1, dia);
    return (
      data.getUTCFullYear() === ano &&
      data.getUTCMonth() === mes - 1 &&
      data.getUTCDate() === dia
    );
  });
export const instanteSchema = z
  .string()
  .datetime({ offset: true })
  .refine(
    (valor) =>
      !valor.startsWith("0000-") && /(Z|[+-](0\d|1[0-5]):[0-5]\d)$/.test(valor),
    "Instante fora do intervalo aceito pelo PostgreSQL"
  );
const momentoSchema = instanteSchema.refine((valor) => {
  const ano = Number(valor.slice(0, 4));
  return ano >= 2 && ano <= 9998;
}, "Momento fora da faixa segura para calcular o dia civil");
export const sequenciaSchema = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine(
    (valor) =>
      /^[1-9]\d{0,18}$/.test(valor) &&
      BigInt(valor) <= 9_223_372_036_854_775_807n
  );
export const inteiroPositivoSchema = z.number().int().min(0).max(2_147_483_647);

export const linhaProdutosSchema = z
  .object({
    codigo_produto: codigoSchema,
    produto: rotulo(),
    codigo_pdv: codigoNullable,
    pdv: rotuloNullable,
    codigo_grupo: codigoNullable,
    grupo: rotuloNullable,
    codigo_garcom: codigoNullable,
    garcom: rotuloNullable,
    mesa: inteiroPositivoSchema.nullable(),
    quantidade: decimalSchema,
    vendas: decimalSchema,
    custos: decimalSchema.nullable(),
  })
  .strict();

export const linhaComissaoSchema = z
  .object({
    codigo_operador: codigoSchema,
    operador: rotulo(120).nullable(),
    funcao: rotulo(80).nullable(),
    vendas_elegiveis: decimalSchema,
    comissao_oficial: decimalSchema.nullable(),
  })
  .strict();

export const linhaCaixaSchema = z
  .object({
    codigo_lancamento: codigoSchema,
    momento: momentoSchema,
    codigo_operador: codigoNullable,
    operador: rotuloNullable,
    tipo: z.enum(["credito", "debito"]),
    codigo_categoria: codigoSchema,
    categoria: rotulo(),
    valor: decimalSchema.refine((valor) => !valor.startsWith("-")),
  })
  .strict();

const tiposAuditoria = [
  "cancelamento_produto",
  "perda_cartao",
  "alteracao_limites",
  "exclusao_taxa_servico",
  "transferencia_produtos",
] as const;

export const linhaAuditoriaSchema = z
  .object({
    tipo: z.enum(tiposAuditoria),
    momento: momentoSchema,
    codigo_operador: codigoNullable,
    operador: rotuloNullable,
    cartao_anterior: codigoNullable,
    cartao_novo: codigoNullable,
    codigo_produto: codigoNullable,
    produto: rotuloNullable,
    quantidade: decimalSchema.nullable(),
    valor_unitario: decimalSchema.nullable(),
    total: decimalSchema.nullable(),
    limite_minimo_anterior: decimalSchema.nullable(),
    limite_minimo_novo: decimalSchema.nullable(),
    limite_maximo_anterior: decimalSchema.nullable(),
    limite_maximo_novo: decimalSchema.nullable(),
  })
  .strict();

export const linhaNotaSchema = z
  .object({
    codigo_nota: codigoSchema,
    codigo_entrada: codigoSchema,
    codigo_cliente: codigoSchema,
    valor: decimalSchema.refine((valor) => !valor.startsWith("-")),
  })
  .strict();

const meioSchema = z
  .object({
    codigo: codigoSchema,
    rotulo: rotulo(),
    classe: z.enum([
      "dinheiro",
      "credito",
      "debito",
      "pix",
      "nota_assinada",
      "desconto",
      "outro",
    ]),
    valor: decimalSchema,
  })
  .strict();

const publicoSchema = z
  .object({
    sexo: z.enum(["masculino", "feminino", "nao_informado"]),
    categoria: z.enum([
      "pagante",
      "convidado",
      "lista",
      "camarote",
      "vip",
      "servico",
      "outro",
    ]),
    quantidade: inteiroPositivoSchema,
  })
  .strict();

const componenteSchema = decimalSchema.nullable();
export const linhaFinanceiroSchema = z
  .object({
    componentes: z
      .object({
        consumo: componenteSchema,
        servico: componenteSchema,
        complemento: componenteSchema,
        taxas_entrada: componenteSchema,
        produto_embutido: componenteSchema,
        flyers: componenteSchema,
      })
      .strict(),
    totais_oficiais: z
      .object({
        projetado: componenteSchema,
        recebido: componenteSchema,
        notas_assinadas: componenteSchema,
        descontos: componenteSchema,
      })
      .strict(),
    entradas: z
      .object({
        habilitados: inteiroPositivoSchema.nullable(),
        reabilitados: inteiroPositivoSchema.nullable(),
        encerrados: inteiroPositivoSchema.nullable(),
        abertos: inteiroPositivoSchema.nullable(),
      })
      .strict(),
    meios: z.array(meioSchema).max(100),
    publico: z
      .array(publicoSchema)
      .max(21)
      .superRefine((celulas, contexto) => {
        const chaves = new Set<string>();
        for (const [indice, celula] of celulas.entries()) {
          const chave = `${celula.sexo}:${celula.categoria}`;
          if (chaves.has(chave)) {
            contexto.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Célula de público duplicada",
              path: [indice],
            });
          }
          chaves.add(chave);
        }
      }),
  })
  .strict();

export type LinhaProdutos = z.infer<typeof linhaProdutosSchema>;
export type LinhaComissao = z.infer<typeof linhaComissaoSchema>;
export type LinhaCaixa = z.infer<typeof linhaCaixaSchema>;
export type LinhaAuditoria = z.infer<typeof linhaAuditoriaSchema>;
export type LinhaNota = z.infer<typeof linhaNotaSchema>;
export type LinhaFinanceiro = z.infer<typeof linhaFinanceiroSchema>;
export type LinhaRelatorio =
  | LinhaProdutos
  | LinhaComissao
  | LinhaCaixa
  | LinhaAuditoria
  | LinhaNota
  | LinhaFinanceiro;

export const TIPOS_ENVIO = [
  "entradas",
  "cadastro_produtos",
  "itens_vendidos",
  "comissoes",
  "movimentos_caixa",
  "eventos_auditoria",
  "notas_assinadas",
  "financeiro",
] as const;
export type TipoEnvio = (typeof TIPOS_ENVIO)[number];
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/);
const extraEntrada = z
  .union([z.string(), z.number().finite(), z.boolean(), z.null()])
  .optional();
export const entradaSchema = z
  .object({
    codEntrada: z.number().int(),
    DataEntrada: dataCivilSchema,
    HoraEntrada: hora,
    DataSaida: dataCivilSchema.nullable(),
    HoraSaida: hora.nullable(),
    ValorItens: decimalSchema,
    ValorDescontos: decimalSchema,
    ValorAcrescimos: decimalSchema,
    TaxaServico: decimalSchema,
    Complemento: decimalSchema,
    ValorConsumido: decimalSchema,
    Pago: z.union([z.literal("Sim"), z.literal("Não"), z.boolean()]),
    codCartaoMesa: z.number().int().nullable(),
    CodGarcon: z.number().int().nullable(),
    codOperadorHab: z.number().int().nullable(),
    codOperadorDesab: z.number().int().nullable(),
    codCliente: z.number().int().nullable(),
    NumeroOcupantes: z.number().int(),
    TipoOcupacao: z.string(),
    TipoCartao: z.string(),
    Reabilitado: extraEntrada,
    Flyer: extraEntrada,
    ConferenciaDeMesa: extraEntrada,
    HabilitacaoAutomatica: extraEntrada,
    DesabilitacaoAutomatica: extraEntrada,
    LimiteMinimo: extraEntrada,
    LimiteMaximo: extraEntrada,
    ECF: extraEntrada,
    CER: extraEntrada,
    COO: extraEntrada,
  })
  .strict()
  .refine((e) => (e.DataSaida === null) === (e.HoraSaida === null));
export const cadastroProdutoSchema = z
  .object({
    codigo_produto: codigoSchema,
    produto: rotulo(),
    codigo_grupo: codigoNullable,
    grupo: rotuloNullable,
    preco_custo_atual: decimalSchema.nullable(),
    ativo: z.boolean(),
    alterado_em: instanteSchema,
  })
  .strict();
export const itemVendidoSchema = linhaProdutosSchema.extend({
  codigo_entrada: codigoSchema,
  ordinal: inteiroPositivoSchema,
});
export type Entrada = z.infer<typeof entradaSchema>;
export type CadastroProduto = z.infer<typeof cadastroProdutoSchema>;
export type ItemVendido = z.infer<typeof itemVendidoSchema>;
export type Comissao = LinhaComissao;
export type MovimentoCaixa = LinhaCaixa;
export type EventoAuditoria = LinhaAuditoria;
export type NotaAssinada = LinhaNota;
export type Financeiro = LinhaFinanceiro;
const base = {
  versao_formato: z.literal(2),
  versao_scc: z.string().min(1),
  enviado_em: instanteSchema,
  id_envio: z.string().uuid(),
  sequencia: sequenciaSchema,
  natureza: z.enum(["scc", "simulacao"]),
  pagina: z
    .object({
      numero: z.number().int().min(1).max(MAX_PAGINAS),
      total: z.number().int().min(1).max(MAX_PAGINAS),
    })
    .strict(),
  total_registros: z.number().int().min(0).max(MAX_REGISTROS_CARGA),
};
const foto = {
  modo: z.literal("fotografia"),
  dia_movimento: dataCivilSchema,
  fonte: z.enum(["online", "historico"]),
  recursos: z
    .array(
      z.enum([
        "pdv",
        "grupo",
        "garcom",
        "mesa",
        "operador",
        "tipo",
        "categoria",
        "cliente",
      ])
    )
    .refine((v) => new Set(v).size === v.length),
};
const schema = z.discriminatedUnion("tipo_envio", [
  z
    .object({
      ...base,
      tipo_envio: z.literal("entradas"),
      modo: z.literal("janela"),
      janela: z
        .object({ desde: dataCivilSchema, ate: dataCivilSchema })
        .strict()
        .refine((v) => v.desde <= v.ate),
      dados: z.array(entradaSchema).max(MAX_REGISTROS_PAGINA),
    })
    .strict(),
  z
    .object({
      ...base,
      tipo_envio: z.literal("cadastro_produtos"),
      modo: z.literal("incremental"),
      dados: z.array(cadastroProdutoSchema).max(MAX_REGISTROS_PAGINA),
    })
    .strict(),
  z
    .object({
      ...base,
      ...foto,
      tipo_envio: z.literal("itens_vendidos"),
      dados: z.array(itemVendidoSchema).max(MAX_REGISTROS_PAGINA),
    })
    .strict(),
  z
    .object({
      ...base,
      ...foto,
      tipo_envio: z.literal("comissoes"),
      dados: z.array(linhaComissaoSchema).max(MAX_REGISTROS_PAGINA),
    })
    .strict(),
  z
    .object({
      ...base,
      ...foto,
      tipo_envio: z.literal("movimentos_caixa"),
      dados: z.array(linhaCaixaSchema).max(MAX_REGISTROS_PAGINA),
    })
    .strict(),
  z
    .object({
      ...base,
      ...foto,
      tipo_envio: z.literal("eventos_auditoria"),
      dados: z.array(linhaAuditoriaSchema).max(MAX_REGISTROS_PAGINA),
    })
    .strict(),
  z
    .object({
      ...base,
      ...foto,
      tipo_envio: z.literal("notas_assinadas"),
      dados: z.array(linhaNotaSchema).max(MAX_REGISTROS_PAGINA),
    })
    .strict(),
  z
    .object({
      ...base,
      ...foto,
      tipo_envio: z.literal("financeiro"),
      dados: z
        .array(
          linhaFinanceiroSchema.refine(
            (linha) =>
              new Set(linha.meios.map((meio) => meio.codigo)).size ===
              linha.meios.length
          )
        )
        .max(1),
    })
    .strict(),
]);
export const envioSccV2Schema = schema.superRefine((v, ctx) => {
  if (
    v.pagina.numero > v.pagina.total ||
    v.dados.length > v.total_registros ||
    v.total_registros >
      v.dados.length + (v.pagina.total - 1) * MAX_REGISTROS_PAGINA ||
    (v.pagina.total === 1 && v.dados.length !== v.total_registros) ||
    (v.total_registros === 0 &&
      (v.pagina.total !== 1 ||
        v.pagina.numero !== 1 ||
        v.dados.length !== 0)) ||
    (v.tipo_envio === "financeiro" &&
      (v.pagina.total !== 1 || v.total_registros > 1))
  )
    ctx.addIssue({
      code: "custom",
      message: "Contagem de páginas ou registros inválida",
    });
});
export type EnvioSccV2 = z.infer<typeof envioSccV2Schema>;
export function validarEnvioSccV2(valor: unknown) {
  return envioSccV2Schema.safeParse(valor);
}
