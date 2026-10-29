import type { ResultadoCompletoDoRelatorio } from "@/lib/relatorios/pdf-dados";
import type { ConsultaRelatorio } from "@/lib/relatorios/tipos";
import {
  DocumentoBase,
  ResumoPdf,
  SecaoPdf,
  TabelaPdf,
  dataCivilPdf,
  dataHoraPdf,
  valorPdf,
} from "./base";

export function DocumentoCaixa({
  casa,
  consulta,
  resultado,
  fuso,
  geradoEm,
}: {
  casa: { nome: string };
  consulta: ConsultaRelatorio;
  resultado: ResultadoCompletoDoRelatorio<"caixa">;
  fuso: string;
  geradoEm: Date;
}) {
  return (
    <DocumentoBase
      titulo="Lançamentos no caixa"
      casa={casa}
      consulta={consulta}
      resultado={resultado}
      fuso={fuso}
      geradoEm={geradoEm}
    >
      <SecaoPdf titulo="Resumo completo">
        <ResumoPdf
          rotulo="Créditos"
          valor={valorPdf(resultado.resumo.creditos)}
        />
        <ResumoPdf
          rotulo="Débitos"
          valor={valorPdf(resultado.resumo.debitos)}
        />
        <ResumoPdf
          rotulo="Saldo dos lançamentos"
          valor={valorPdf(resultado.resumo.saldo)}
        />
      </SecaoPdf>
      <SecaoPdf titulo="Totais completos por operador e dia civil">
        <TabelaPdf
          cabecalho={[
            "Operador / código",
            "Dia civil",
            "Créditos",
            "Débitos",
            "Saldo",
          ]}
          larguras={[28, 18, 18, 18, 18]}
          linhas={resultado.resumo.grupos.map((grupo) => [
            grupo.codigoOperador ?? "Não informado pela SCC",
            dataCivilPdf(grupo.diaCivil),
            valorPdf(grupo.creditos),
            valorPdf(grupo.debitos),
            valorPdf(grupo.saldo),
          ])}
        />
      </SecaoPdf>
      <SecaoPdf titulo="Lançamentos">
        <TabelaPdf
          cabecalho={[
            "Operador",
            "Dia civil",
            "Momento",
            "Categoria",
            "Tipo",
            "Valor",
          ]}
          larguras={[20, 14, 18, 22, 12, 14]}
          linhas={resultado.linhas.map((linha) => [
            `${linha.operador ?? "Não informado pela SCC"}${linha.codigoOperador ? ` · ${linha.codigoOperador}` : ""}`,
            dataCivilPdf(linha.diaCivil),
            dataHoraPdf(linha.momento, fuso),
            `${linha.categoria ?? "Não informado pela SCC"}${linha.codigoCategoria ? ` · ${linha.codigoCategoria}` : ""}`,
            linha.tipo === "credito" ? "Crédito" : "Débito",
            valorPdf(linha.valor),
          ])}
        />
      </SecaoPdf>
    </DocumentoBase>
  );
}
