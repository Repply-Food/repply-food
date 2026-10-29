import type { ResultadoCompletoDoRelatorio } from "@/lib/relatorios/pdf-dados";
import { resultadoSchemas } from "@/lib/relatorios/schemas-saida";
import type { ConsultaRelatorio } from "@/lib/relatorios/tipos";
import type { Relatorio } from "@/lib/validators/relatorios";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { DocumentoAuditoria } from "./auditoria";
import { DocumentoCaixa } from "./caixa";
import { DocumentoComissao } from "./comissao";
import { DocumentoFinanceiro } from "./financeiro";
import { DocumentoNotasAssinadas } from "./notas-assinadas";
import { DocumentoProdutos } from "./produtos";

function validarCompleto<R extends Relatorio>(
  schema: { parse(value: unknown): unknown },
  resultado: ResultadoCompletoDoRelatorio<R>
): ResultadoCompletoDoRelatorio<R> {
  // O schema de página limita tamanho a 100. No PDF, as linhas já foram
  // validadas página a página pelo leitor; a validação aqui confere o formato
  // completo sem fingir que a exportação coube em uma página.
  schema.parse({
    ...resultado,
    paginacao: {
      pagina: 1,
      tamanho: Math.max(1, Math.min(100, resultado.linhas.length)),
      totalLinhas: resultado.paginacao.totalLinhas,
    },
  });
  return resultado;
}

/** Despacho fechado: a saída já foi validada pelo leitor e é revalidada aqui. */
export function DocumentoRelatorio({
  casa,
  relatorio,
  consulta,
  resultado,
  fuso,
  geradoEm,
}: {
  casa: { nome: string };
  relatorio: Relatorio;
  consulta: ConsultaRelatorio;
  resultado: ResultadoCompletoDoRelatorio<Relatorio>;
  fuso: string;
  geradoEm: Date;
}): ReactElement<DocumentProps> {
  switch (relatorio) {
    case "produtos":
      return (
        <DocumentoProdutos
          casa={casa}
          consulta={consulta}
          resultado={
            validarCompleto(
              resultadoSchemas.produtos,
              resultado
            ) as ResultadoCompletoDoRelatorio<"produtos">
          }
          fuso={fuso}
          geradoEm={geradoEm}
        />
      );
    case "comissao":
      return (
        <DocumentoComissao
          casa={casa}
          consulta={consulta}
          resultado={
            validarCompleto(
              resultadoSchemas.comissao,
              resultado
            ) as ResultadoCompletoDoRelatorio<"comissao">
          }
          fuso={fuso}
          geradoEm={geradoEm}
        />
      );
    case "caixa":
      return (
        <DocumentoCaixa
          casa={casa}
          consulta={consulta}
          resultado={
            validarCompleto(
              resultadoSchemas.caixa,
              resultado
            ) as ResultadoCompletoDoRelatorio<"caixa">
          }
          fuso={fuso}
          geradoEm={geradoEm}
        />
      );
    case "auditoria":
      return (
        <DocumentoAuditoria
          casa={casa}
          consulta={consulta}
          resultado={
            validarCompleto(
              resultadoSchemas.auditoria,
              resultado
            ) as ResultadoCompletoDoRelatorio<"auditoria">
          }
          fuso={fuso}
          geradoEm={geradoEm}
        />
      );
    case "notas-assinadas":
      return (
        <DocumentoNotasAssinadas
          casa={casa}
          consulta={consulta}
          resultado={
            validarCompleto(
              resultadoSchemas["notas-assinadas"],
              resultado
            ) as ResultadoCompletoDoRelatorio<"notas-assinadas">
          }
          fuso={fuso}
          geradoEm={geradoEm}
        />
      );
    case "financeiro":
      return (
        <DocumentoFinanceiro
          casa={casa}
          consulta={consulta}
          resultado={
            validarCompleto(
              resultadoSchemas.financeiro,
              resultado
            ) as ResultadoCompletoDoRelatorio<"financeiro">
          }
          fuso={fuso}
          geradoEm={geradoEm}
        />
      );
  }
}
