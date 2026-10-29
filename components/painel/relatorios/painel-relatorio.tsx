import { resultadoSchemas } from "@/lib/relatorios/schemas-saida";
import type { ResultadoDoRelatorio } from "@/lib/relatorios/tipos";
import type { Relatorio } from "@/lib/validators/relatorios";
import { PainelAuditoria } from "./auditoria";
import { PainelCaixa } from "./caixa";
import { PainelComissao } from "./comissao";
import { PainelFinanceiro } from "./financeiro";
import { PainelNotasAssinadas } from "./notas-assinadas";
import { PainelProdutos } from "./produtos";

/** Seleção fechada; cada saída passa pelo schema do respectivo relatório. */
export function PainelRelatorio({
  relatorio,
  resultado,
  fuso = "America/Recife",
}: {
  relatorio: Relatorio;
  resultado: ResultadoDoRelatorio<Relatorio>;
  fuso?: string;
}) {
  switch (relatorio) {
    case "produtos":
      return (
        <PainelProdutos
          resultado={resultadoSchemas.produtos.parse(resultado)}
        />
      );
    case "comissao":
      return (
        <PainelComissao
          resultado={resultadoSchemas.comissao.parse(resultado)}
        />
      );
    case "caixa":
      return (
        <PainelCaixa
          resultado={resultadoSchemas.caixa.parse(resultado)}
          fuso={fuso}
        />
      );
    case "auditoria":
      return (
        <PainelAuditoria
          resultado={resultadoSchemas.auditoria.parse(resultado)}
          fuso={fuso}
        />
      );
    case "notas-assinadas":
      return (
        <PainelNotasAssinadas
          resultado={resultadoSchemas["notas-assinadas"].parse(resultado)}
        />
      );
    case "financeiro":
      return (
        <PainelFinanceiro
          resultado={resultadoSchemas.financeiro.parse(resultado)}
        />
      );
  }
}
