import type { ResultadoCompletoDoRelatorio } from "@/lib/relatorios/pdf-dados";
import type { ConsultaRelatorio } from "@/lib/relatorios/tipos";
import {
  DocumentoBase,
  ResumoPdf,
  SecaoPdf,
  TabelaPdf,
  dataCivilPdf,
  valorPdf,
} from "./base";

export function DocumentoNotasAssinadas({
  casa,
  consulta,
  resultado,
  fuso,
  geradoEm,
}: {
  casa: { nome: string };
  consulta: ConsultaRelatorio;
  resultado: ResultadoCompletoDoRelatorio<"notas-assinadas">;
  fuso: string;
  geradoEm: Date;
}) {
  return (
    <DocumentoBase
      titulo="Notas assinadas"
      casa={casa}
      consulta={consulta}
      resultado={resultado}
      fuso={fuso}
      geradoEm={geradoEm}
    >
      <SecaoPdf titulo="Resumo completo">
        <ResumoPdf
          rotulo="Total das notas"
          valor={valorPdf(resultado.resumo.valor)}
        />
        <ResumoPdf
          rotulo="Quantidade de notas"
          valor={String(resultado.resumo.notas)}
        />
      </SecaoPdf>
      <SecaoPdf titulo="Notas por código do cliente">
        <TabelaPdf
          cabecalho={[
            "Código do cliente",
            "Nota",
            "Entrada",
            "Movimento",
            "Valor",
          ]}
          larguras={[24, 19, 19, 19, 19]}
          linhas={resultado.linhas.map((linha) => [
            linha.codigoCliente,
            linha.codigoNota,
            linha.codigoEntrada,
            dataCivilPdf(linha.diaMovimento),
            valorPdf(linha.valor),
          ])}
        />
        <ResumoPdf
          rotulo="Identificação do cliente"
          valor="Somente o código enviado pela SCC; nomes não são armazenados nem exibidos."
        />
      </SecaoPdf>
    </DocumentoBase>
  );
}
