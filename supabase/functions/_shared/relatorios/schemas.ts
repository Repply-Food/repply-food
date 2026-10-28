import { z } from "zod";
import { MAX_LINHAS_CARGA, MAX_LINHAS_PAGINA, MAX_PAGINAS } from "./limites";

export const RELATORIOS = [
  "financeiro",
  "produtos",
  "comissao",
  "caixa",
  "auditoria",
  "notas-assinadas",
] as const;

export type Relatorio = (typeof RELATORIOS)[number];

const decimalSchema = z.string().regex(/^-?\d{1,14}(\.\d{1,6})?$/);
const codigoSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_.-]+$/);
const rotulo = (max = 120) =>
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
const dataCivilSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((valor) => {
    const ano = Number(valor.slice(0, 4));
    const mes = Number(valor.slice(5, 7));
    const dia = Number(valor.slice(8, 10));
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    return (
      data.getUTCFullYear() === ano &&
      data.getUTCMonth() === mes - 1 &&
      data.getUTCDate() === dia
    );
  });
const instanteSchema = z.string().datetime({ offset: true });
const sequenciaSchema = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine(
    (valor) =>
      /^[1-9]\d{0,18}$/.test(valor) &&
      BigInt(valor) <= 9_223_372_036_854_775_807n
  );
const inteiroPositivoSchema = z.number().int().min(0).max(2_147_483_647);

const linhaProdutosSchema = z
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

const linhaComissaoSchema = z
  .object({
    codigo_operador: codigoSchema,
    operador: rotulo(120).nullable(),
    funcao: rotulo(80).nullable(),
    vendas_elegiveis: decimalSchema,
    comissao_oficial: decimalSchema.nullable(),
  })
  .strict();

const linhaCaixaSchema = z
  .object({
    codigo_lancamento: codigoSchema,
    momento: instanteSchema,
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

const linhaAuditoriaSchema = z
  .object({
    tipo: z.enum(tiposAuditoria),
    momento: instanteSchema,
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

const linhaNotaSchema = z
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
const linhaFinanceiroSchema = z
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

const recursosPorRelatorio: Record<Relatorio, readonly string[]> = {
  produtos: ["pdv", "grupo", "garcom", "mesa"],
  comissao: ["operador"],
  caixa: ["operador", "tipo", "categoria"],
  auditoria: ["operador", "tipo"],
  "notas-assinadas": ["cliente"],
  financeiro: [],
} as const;

const manifestoBaseSchema = z.object({
  versao_formato: z.literal(1),
  carga_id: z.string().uuid(),
  dia_movimento: dataCivilSchema,
  fonte: z.enum(["historico", "online"]),
  sequencia: sequenciaSchema,
  capturado_em: instanteSchema,
  natureza: z.enum(["scc", "simulacao"]),
});

function recursosSchema(relatorio: Relatorio) {
  const permitidos = [...recursosPorRelatorio[relatorio]];
  const item =
    permitidos.length === 0
      ? z.never()
      : z.enum(permitidos as [string, ...string[]]);
  return z
    .array(item)
    .max(permitidos.length)
    .refine((recursos) => new Set(recursos).size === recursos.length);
}

const manifestoSchemas = RELATORIOS.map((relatorio) =>
  manifestoBaseSchema
    .extend({
      relatorio: z.literal(relatorio),
      recursos: recursosSchema(relatorio),
      total_paginas: z.number().int().min(1).max(MAX_PAGINAS),
      total_linhas: z.number().int().min(0).max(MAX_LINHAS_CARGA),
    })
    .strict()
);

const manifestoSchema = z.union(
  manifestoSchemas as unknown as [z.ZodTypeAny, ...z.ZodTypeAny[]]
);

export type Manifesto = {
  versao_formato: 1;
  carga_id: string;
  relatorio: Relatorio;
  dia_movimento: string;
  fonte: "historico" | "online";
  sequencia: string;
  capturado_em: string;
  natureza: "scc" | "simulacao";
  recursos: string[];
  total_paginas: number;
  total_linhas: number;
};

const esquemaPorRelatorio = {
  produtos: linhaProdutosSchema,
  comissao: linhaComissaoSchema,
  caixa: linhaCaixaSchema,
  auditoria: linhaAuditoriaSchema,
  "notas-assinadas": linhaNotaSchema,
  financeiro: linhaFinanceiroSchema,
} as const;

const pedidoPaginaSchemas = RELATORIOS.map((relatorio) =>
  z
    .object({
      acao: z.literal("pagina"),
      manifesto: manifestoSchemas[RELATORIOS.indexOf(relatorio)] ?? z.never(),
      numero: z.number().int().min(1).max(MAX_PAGINAS),
      linhas: z.array(esquemaPorRelatorio[relatorio]).max(MAX_LINHAS_PAGINA),
    })
    .strict()
    .superRefine((pedido, contexto) => {
      const manifesto = pedido.manifesto as Manifesto;
      if (
        manifesto.total_paginas === 1 &&
        manifesto.total_linhas !== pedido.linhas.length
      ) {
        contexto.addIssue({
          code: "custom",
          message: "Total de linhas diverge da página única",
          path: ["manifesto", "total_linhas"],
        });
      }
      if (
        manifesto.relatorio === "financeiro" &&
        (manifesto.total_paginas !== 1 ||
          manifesto.total_linhas !== 1 ||
          pedido.linhas.length !== 1)
      ) {
        contexto.addIssue({
          code: "custom",
          message: "Fotografia financeira exige uma linha única",
          path: ["linhas"],
        });
      }
      if (pedido.numero > manifesto.total_paginas) {
        contexto.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Página fora do manifesto",
          path: ["numero"],
        });
      }
      if (
        manifesto.total_linhas === 0 &&
        (manifesto.total_paginas !== 1 ||
          pedido.numero !== 1 ||
          pedido.linhas.length !== 0)
      ) {
        contexto.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Publicação vazia deve conter uma página vazia",
          path: ["linhas"],
        });
      }
    })
);

const pedidoRelatoriosInterno = z.union([
  ...(pedidoPaginaSchemas as unknown as [
    z.ZodTypeAny,
    z.ZodTypeAny,
    z.ZodTypeAny,
    z.ZodTypeAny,
    z.ZodTypeAny,
    z.ZodTypeAny,
  ]),
  z
    .object({ acao: z.literal("publicar"), carga_id: z.string().uuid() })
    .strict(),
]);

export type PedidoPagina<R extends Relatorio, L> = {
  acao: "pagina";
  manifesto: Manifesto & { relatorio: R };
  numero: number;
  linhas: L[];
};
export type PedidoRelatorios =
  | PedidoPagina<"produtos", LinhaProdutos>
  | PedidoPagina<"comissao", LinhaComissao>
  | PedidoPagina<"caixa", LinhaCaixa>
  | PedidoPagina<"auditoria", LinhaAuditoria>
  | PedidoPagina<"notas-assinadas", LinhaNota>
  | PedidoPagina<"financeiro", LinhaFinanceiro>
  | { acao: "publicar"; carga_id: string };
export const pedidoRelatoriosSchema: z.ZodType<PedidoRelatorios> =
  pedidoRelatoriosInterno as z.ZodType<PedidoRelatorios>;

const manifestoFotografiaSchemas = RELATORIOS.map((relatorio) =>
  manifestoBaseSchema
    .extend({
      relatorio: z.literal(relatorio),
      recursos: recursosSchema(relatorio),
    })
    .strict()
);

const fotografiaInterna = z
  .object({
    manifesto: z.union(
      manifestoFotografiaSchemas as unknown as [z.ZodTypeAny, ...z.ZodTypeAny[]]
    ),
    linhas: z.array(z.unknown()),
  })
  .strict()
  .superRefine((fotografia, contexto) => {
    const manifesto = fotografia.manifesto as ManifestoFotografia;
    const linhas = fotografia.linhas as unknown[];
    const esquema = esquemaPorRelatorio[manifesto.relatorio];
    if (linhas.length > MAX_LINHAS_CARGA) {
      contexto.addIssue({
        code: "custom",
        message: "Carga excede o limite de linhas",
        path: ["linhas"],
      });
      return;
    }
    if (manifesto.relatorio === "financeiro" && linhas.length !== 1) {
      contexto.addIssue({
        code: "custom",
        message: "Fotografia financeira exige uma linha única",
        path: ["linhas"],
      });
    }
    linhas.forEach((linha, indice) => {
      const resultado = esquema.safeParse(linha);
      if (!resultado.success) {
        for (const problema of resultado.error.issues) {
          contexto.addIssue({
            ...problema,
            path: ["linhas", indice, ...problema.path],
          });
        }
      }
    });
  });

export type ManifestoFotografia = Omit<
  Manifesto,
  "total_paginas" | "total_linhas"
>;
export type Fotografia = {
  manifesto: ManifestoFotografia;
  linhas: LinhaRelatorio[];
};
export const fotografiaSchema: z.ZodType<Fotografia> =
  fotografiaInterna as z.ZodType<Fotografia>;
