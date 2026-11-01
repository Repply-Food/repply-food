import { z } from "zod";
import { MAX_LINHAS_CARGA, MAX_LINHAS_PAGINA, MAX_PAGINAS } from "./limites.ts";

export const RELATORIOS = [
  "financeiro",
  "produtos",
  "comissao",
  "caixa",
  "auditoria",
  "notas-assinadas",
] as const;

export type Relatorio = (typeof RELATORIOS)[number];

import {
  type LinhaAuditoria,
  type LinhaCaixa,
  type LinhaComissao,
  type LinhaFinanceiro,
  type LinhaNota,
  type LinhaProdutos,
  type LinhaRelatorio,
  dataCivilSchema,
  instanteSchema,
  linhaAuditoriaSchema,
  linhaCaixaSchema,
  linhaComissaoSchema,
  linhaFinanceiroSchema,
  linhaNotaSchema,
  linhaProdutosSchema,
  sequenciaSchema,
} from "../scc/schemas.ts";
export {
  codigoSchema,
  dataCivilSchema,
  inteiroPositivoSchema,
  linhaProdutosSchema,
  linhaComissaoSchema,
  linhaCaixaSchema,
  linhaAuditoriaSchema,
  linhaNotaSchema,
  linhaFinanceiroSchema,
  type LinhaProdutos,
  type LinhaComissao,
  type LinhaCaixa,
  type LinhaAuditoria,
  type LinhaNota,
  type LinhaFinanceiro,
  type LinhaRelatorio,
} from "../scc/schemas.ts";

export const recursosPorRelatorio: Record<Relatorio, readonly string[]> = {
  produtos: ["pdv", "grupo", "garcom", "mesa"],
  comissao: ["operador"],
  caixa: ["operador", "tipo", "categoria"],
  auditoria: ["operador", "tipo"],
  "notas-assinadas": ["cliente"],
  financeiro: [],
} as const;

export const manifestoBaseSchema = z.object({
  versao_formato: z.literal(1),
  carga_id: z.string().uuid(),
  dia_movimento: dataCivilSchema,
  fonte: z.enum(["historico", "online"]),
  sequencia: sequenciaSchema,
  capturado_em: instanteSchema.refine(
    (valor) =>
      !valor.startsWith("0000-") && /(Z|[+-](0\d|1[0-5]):[0-5]\d)$/.test(valor)
  ),
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
          manifesto.total_linhas > 1 ||
          pedido.linhas.length > 1)
      ) {
        contexto.addIssue({
          code: "custom",
          message: "Fotografia financeira aceita zero ou uma linha",
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
    if (manifesto.relatorio === "financeiro" && linhas.length > 1) {
      contexto.addIssue({
        code: "custom",
        message: "Fotografia financeira aceita zero ou uma linha",
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
