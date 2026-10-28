import type { ResultadoCompletoDoRelatorio } from "@/lib/relatorios/pdf-dados";
import type { ConsultaRelatorio } from "@/lib/relatorios/tipos";
import {
  DocumentoBase,
  ResumoPdf,
  SecaoPdf,
  TabelaPdf,
  quantidadePdf,
  valorPdf,
} from "./base";

export function DocumentoProdutos({
  casa,
  consulta,
  resultado,
  fuso,
  geradoEm,
}: {
  casa: { nome: string };
  consulta: ConsultaRelatorio;
  resultado: ResultadoCompletoDoRelatorio<"produtos">;
  fuso: string;
  geradoEm: Date;
}) {
  return (
    <DocumentoBase
      titulo="Produtos vendidos"
      casa={casa}
      consulta={consulta}
      resultado={resultado}
      fuso={fuso}
      geradoEm={geradoEm}
    >
      <SecaoPdf titulo="Resumo completo do período">
        <ResumoPdf rotulo="Vendas" valor={valorPdf(resultado.resumo.vendas)} />
        <ResumoPdf
          rotulo="Custos informados"
          valor={valorPdf(resultado.resumo.custos)}
        />
        <ResumoPdf
          rotulo="Diferença vendas − custos"
          valor={valorPdf(resultado.resumo.diferenca)}
        />
        <ResumoPdf
          rotulo="Quantidade"
          valor={quantidadePdf(resultado.resumo.quantidade)}
        />
      </SecaoPdf>
      <SecaoPdf titulo="Totais completos por PDV e grupo">
        <TabelaPdf
          cabecalho={[
            "PDV / código",
            "Grupo / código",
            "Quantidade",
            "Vendas",
            "Custos",
            "Diferença",
          ]}
          larguras={[17, 20, 15, 15, 16, 17]}
          linhas={resultado.resumo.grupos.map((grupo) => [
            grupo.codigoPdv === null
              ? "Não informado pela SCC"
              : `PDV ${grupo.codigoPdv}`,
            grupo.codigoGrupo === null
              ? "Não informado pela SCC"
              : `Grupo ${grupo.codigoGrupo}`,
            quantidadePdf(grupo.quantidade),
            valorPdf(grupo.vendas),
            valorPdf(grupo.custos),
            valorPdf(grupo.diferenca),
          ])}
        />
      </SecaoPdf>
      <SecaoPdf titulo="Produtos">
        <TabelaPdf
          cabecalho={[
            "PDV",
            "Grupo",
            "Produto / código",
            "Quantidade",
            "Vendas",
            "Custos",
            "Diferença",
          ]}
          larguras={[12, 14, 22, 12, 12, 14, 14]}
          linhas={resultado.linhas.map((linha) => [
            `${linha.pdv ?? "Não informado pela SCC"} · ${linha.codigoPdv ?? "—"}`,
            `${linha.grupo ?? "Não informado pela SCC"} · ${linha.codigoGrupo ?? "—"}`,
            `${linha.produto} · ${linha.codigoProduto}`,
            quantidadePdf(linha.quantidade),
            valorPdf(linha.vendas),
            valorPdf(linha.custos),
            valorPdf(linha.diferenca),
          ])}
        />
      </SecaoPdf>
    </DocumentoBase>
  );
}
