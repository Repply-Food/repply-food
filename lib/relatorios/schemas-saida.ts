import type { Relatorio } from "@/lib/validators/relatorios";
import { z } from "zod";
import {
  linhaAuditoriaSchema as auditoria,
  linhaCaixaSchema as caixa,
  linhaComissaoSchema as comissao,
  dataCivilSchema,
  linhaFinanceiroSchema as financeiro,
  manifestoBaseSchema,
  linhaNotaSchema as nota,
  linhaProdutosSchema as produtos,
  recursosPorRelatorio,
} from "../../supabase/functions/_shared/relatorios/schemas";
import { revisaoSchema } from "./filtros";

// Somas podem exceder numeric(20,6) da origem; nunca converter decimais em number.
const decimal = z.string().regex(/^-?\d+(\.\d{1,6})?$/);
const componente = decimal.nullable();
const contagem = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiva = contagem.min(1);

export const linhaProdutosSaidaSchema = z
  .object({
    codigoProduto: produtos.shape.codigo_produto,
    produto: produtos.shape.produto,
    codigoPdv: produtos.shape.codigo_pdv,
    pdv: produtos.shape.pdv,
    codigoGrupo: produtos.shape.codigo_grupo,
    grupo: produtos.shape.grupo,
    quantidade: decimal,
    vendas: decimal,
    custos: componente,
    diferenca: componente,
  })
  .strict();
export const resumoProdutosSchema = z
  .object({
    quantidade: decimal,
    vendas: decimal,
    custos: componente,
    diferenca: componente,
  })
  .strict();

export const linhaComissaoSaidaSchema = z
  .object({
    codigoOperador: comissao.shape.codigo_operador,
    operador: comissao.shape.operador,
    funcao: comissao.shape.funcao,
    vendasElegiveis: decimal,
    comissaoOficial: componente,
  })
  .strict();
export const resumoComissaoSchema = z
  .object({
    vendasElegiveis: decimal,
    comissaoOficial: componente,
    operadoresSemComissao: contagem,
  })
  .strict();

export const linhaCaixaSaidaSchema = z
  .object({
    codigoLancamento: caixa.shape.codigo_lancamento,
    diaMovimento: dataCivilSchema,
    diaCivil: dataCivilSchema,
    momento: caixa.shape.momento,
    codigoOperador: caixa.shape.codigo_operador,
    operador: caixa.shape.operador,
    tipo: caixa.shape.tipo,
    codigoCategoria: caixa.shape.codigo_categoria,
    categoria: caixa.shape.categoria,
    valor: caixa.shape.valor,
  })
  .strict();
export const resumoCaixaSchema = z
  .object({
    creditos: decimal.refine((v) => !v.startsWith("-")),
    debitos: decimal.refine((v) => !v.startsWith("-")),
    saldo: decimal,
  })
  .strict();

export const linhaAuditoriaSaidaSchema = z
  .object({
    tipo: auditoria.shape.tipo,
    momento: auditoria.shape.momento,
    codigoOperador: auditoria.shape.codigo_operador,
    operador: auditoria.shape.operador,
    cartaoAnterior: auditoria.shape.cartao_anterior,
    cartaoNovo: auditoria.shape.cartao_novo,
    codigoProduto: auditoria.shape.codigo_produto,
    produto: auditoria.shape.produto,
    quantidade: auditoria.shape.quantidade,
    valorUnitario: auditoria.shape.valor_unitario,
    total: auditoria.shape.total,
    limiteMinimoAnterior: auditoria.shape.limite_minimo_anterior,
    limiteMinimoNovo: auditoria.shape.limite_minimo_novo,
    limiteMaximoAnterior: auditoria.shape.limite_maximo_anterior,
    limiteMaximoNovo: auditoria.shape.limite_maximo_novo,
    diaMovimento: dataCivilSchema,
  })
  .strict();
const auditoriaPorTipoSchema = z
  .object({
    tipo: auditoria.shape.tipo,
    ocorrencias: contagem,
    quantidade: componente,
    total: componente,
  })
  .strict()
  .superRefine((valor, contexto) => {
    if (
      valor.tipo !== "cancelamento_produto" &&
      (valor.quantidade !== null || valor.total !== null)
    )
      contexto.addIssue({
        code: "custom",
        message: "Somente cancelamento tem soma de quantidade e valor",
      });
  });
function somaSegura(valores: readonly number[]): boolean {
  return (
    valores.reduce((total, valor) => total + BigInt(valor), 0n) <=
    BigInt(Number.MAX_SAFE_INTEGER)
  );
}
export const resumoAuditoriaSchema = z
  .object({
    ocorrencias: contagem,
    porTipo: z.array(auditoriaPorTipoSchema).max(5),
  })
  .strict()
  .superRefine((valor, contexto) => {
    if (!somaSegura(valor.porTipo.map((item) => item.ocorrencias)))
      contexto.addIssue({
        code: "custom",
        message: "Soma de ocorrências excede inteiro seguro",
      });
    if (
      new Set(valor.porTipo.map((item) => item.tipo)).size !==
      valor.porTipo.length
    )
      contexto.addIssue({
        code: "custom",
        message: "Tipo duplicado no resumo",
      });
  });

export const linhaNotaSaidaSchema = z
  .object({
    codigoNota: nota.shape.codigo_nota,
    codigoEntrada: nota.shape.codigo_entrada,
    diaMovimento: dataCivilSchema,
    codigoCliente: nota.shape.codigo_cliente,
    valor: nota.shape.valor,
  })
  .strict();
export const resumoNotasSchema = z
  .object({ notas: contagem, valor: decimal.refine((v) => !v.startsWith("-")) })
  .strict();

const componentesShape = financeiro.shape.componentes.shape;
const totaisShape = financeiro.shape.totais_oficiais.shape;
const componentesLinha = z
  .object({
    consumo: componentesShape.consumo,
    servico: componentesShape.servico,
    complemento: componentesShape.complemento,
    taxasEntrada: componentesShape.taxas_entrada,
    produtoEmbutido: componentesShape.produto_embutido,
    flyers: componentesShape.flyers,
  })
  .strict();
const totaisLinha = z
  .object({
    projetado: totaisShape.projetado,
    recebido: totaisShape.recebido,
    notasAssinadas: totaisShape.notas_assinadas,
    descontos: totaisShape.descontos,
  })
  .strict();
export const linhaFinanceiroSaidaSchema = z
  .object({
    diaMovimento: dataCivilSchema,
    componentes: componentesLinha,
    totaisOficiais: totaisLinha,
    entradas: financeiro.shape.entradas,
    meios: financeiro.shape.meios,
    publico: financeiro.shape.publico,
  })
  .strict();
const meioResumoSchema = financeiro.shape.meios.element
  .extend({ valor: decimal })
  .strict();
const publicoResumoSchema = financeiro.shape.publico.element
  .extend({ quantidade: contagem })
  .strict();
export const resumoFinanceiroSchema = z
  .object({
    componentes: z
      .object({
        consumo: componente,
        servico: componente,
        complemento: componente,
        taxasEntrada: componente,
        produtoEmbutido: componente,
        flyers: componente,
      })
      .strict(),
    totaisOficiais: z
      .object({
        projetado: componente,
        recebido: componente,
        notasAssinadas: componente,
        descontos: componente,
      })
      .strict(),
    entradas: z
      .object({
        habilitados: contagem.nullable(),
        reabilitados: contagem.nullable(),
        encerrados: contagem.nullable(),
        abertos: contagem.nullable(),
      })
      .strict(),
    meios: z.array(meioResumoSchema),
    publico: z.array(publicoResumoSchema).max(21),
  })
  .strict()
  .superRefine((valor, contexto) => {
    if (!somaSegura(valor.publico.map((item) => item.quantidade)))
      contexto.addIssue({
        code: "custom",
        message: "Soma de público excede inteiro seguro",
      });
    if (
      new Set(valor.publico.map((item) => `${item.sexo}:${item.categoria}`))
        .size !== valor.publico.length
    )
      contexto.addIssue({
        code: "custom",
        message: "Célula de público duplicada",
      });
    if (
      new Set(valor.meios.map((item) => `${item.codigo}:${item.classe}`))
        .size !== valor.meios.length
    )
      contexto.addIssue({
        code: "custom",
        message: "Meio duplicado no resumo",
      });
  });

export const resumosPorRelatorio = {
  produtos: resumoProdutosSchema,
  comissao: resumoComissaoSchema,
  caixa: resumoCaixaSchema,
  auditoria: resumoAuditoriaSchema,
  "notas-assinadas": resumoNotasSchema,
  financeiro: resumoFinanceiroSchema,
} as const;
/** Envelope discriminado para o leitor selecionar um resumo concreto. */
export const resumoSchema = z.discriminatedUnion("tipo", [
  z
    .object({ tipo: z.literal("produtos"), resumo: resumoProdutosSchema })
    .strict(),
  z
    .object({ tipo: z.literal("comissao"), resumo: resumoComissaoSchema })
    .strict(),
  z.object({ tipo: z.literal("caixa"), resumo: resumoCaixaSchema }).strict(),
  z
    .object({ tipo: z.literal("auditoria"), resumo: resumoAuditoriaSchema })
    .strict(),
  z
    .object({ tipo: z.literal("notas-assinadas"), resumo: resumoNotasSchema })
    .strict(),
  z
    .object({ tipo: z.literal("financeiro"), resumo: resumoFinanceiroSchema })
    .strict(),
]);

export const coberturaSchema = z
  .object({
    esperados: contagem.min(1).max(366),
    recebidos: contagem.max(366),
    ausentes: z.array(dataCivilSchema).max(366),
    capturadoEm: manifestoBaseSchema.shape.capturado_em.nullable(),
    simulacao: z.boolean(),
    recursos: z.array(z.string()),
  })
  .strict();
export const paginacaoSchema = z
  .object({
    pagina: positiva,
    tamanho: positiva.max(100),
    totalLinhas: contagem,
  })
  .strict();
function resultadoSchema<L extends z.ZodType, R extends z.ZodType>(
  relatorio: Relatorio,
  linha: L,
  resumo: R
) {
  return z
    .object({
      situacao: z.enum(["sem_dados", "parcial", "completo"]),
      revisao: revisaoSchema,
      cobertura: coberturaSchema.refine(
        (valor) =>
          valor.recursos.every((recurso) =>
            recursosPorRelatorio[relatorio].includes(recurso)
          ) && new Set(valor.recursos).size === valor.recursos.length,
        "Recurso inválido ou duplicado"
      ),
      linhas: z.array(linha),
      resumo,
      paginacao: paginacaoSchema,
    })
    .strict();
}
export const resultadoSchemas = {
  produtos: resultadoSchema(
    "produtos",
    linhaProdutosSaidaSchema,
    resumoProdutosSchema
  ),
  comissao: resultadoSchema(
    "comissao",
    linhaComissaoSaidaSchema,
    resumoComissaoSchema
  ),
  caixa: resultadoSchema("caixa", linhaCaixaSaidaSchema, resumoCaixaSchema),
  auditoria: resultadoSchema(
    "auditoria",
    linhaAuditoriaSaidaSchema,
    resumoAuditoriaSchema
  ),
  "notas-assinadas": resultadoSchema(
    "notas-assinadas",
    linhaNotaSaidaSchema,
    resumoNotasSchema
  ),
  financeiro: resultadoSchema(
    "financeiro",
    linhaFinanceiroSaidaSchema,
    resumoFinanceiroSchema
  ),
} as const;
