import type { ResultadoCompletoDoRelatorio } from "@/lib/relatorios/pdf-dados";
import type { ConsultaRelatorio } from "@/lib/relatorios/tipos";
import {
  DocumentoBase,
  ResumoPdf,
  SecaoPdf,
  TabelaPdf,
  valorPdf,
} from "./base";

export function DocumentoComissao({
  casa,
  consulta,
  resultado,
  fuso,
  geradoEm,
}: {
  casa: { nome: string };
  consulta: ConsultaRelatorio;
  resultado: ResultadoCompletoDoRelatorio<"comissao">;
  fuso: string;
  geradoEm: Date;
}) {
  return (
    <DocumentoBase
      titulo="Comissão"
      casa={casa}
      consulta={consulta}
      resultado={resultado}
      fuso={fuso}
      geradoEm={geradoEm}
    >
      <SecaoPdf titulo="Resumo completo">
        <ResumoPdf
          rotulo="Vendas elegíveis"
          valor={valorPdf(resultado.resumo.vendasElegiveis)}
        />
        <ResumoPdf
          rotulo="Comissão oficial informada pela SCC"
          valor={valorPdf(resultado.resumo.comissaoOficial)}
        />
        <ResumoPdf
          rotulo="Operadores sem comissão informada"
          valor={String(resultado.resumo.operadoresSemComissao)}
        />
      </SecaoPdf>
      <SecaoPdf titulo="Por operador">
        <TabelaPdf
          cabecalho={[
            "Operador / código",
            "Função",
            "Vendas elegíveis",
            "Comissão oficial",
          ]}
          larguras={[28, 24, 24, 24]}
          linhas={resultado.linhas.map((linha) => [
            `${linha.operador} · ${linha.codigoOperador}`,
            linha.funcao ?? "Não informado pela SCC",
            valorPdf(linha.vendasElegiveis),
            valorPdf(linha.comissaoOficial),
          ])}
        />
      </SecaoPdf>
    </DocumentoBase>
  );
}
