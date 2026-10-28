import type { ResultadoCompletoDoRelatorio } from "@/lib/relatorios/pdf-dados";
import type { ConsultaRelatorio } from "@/lib/relatorios/tipos";
import {
  DocumentoBase,
  ResumoPdf,
  SecaoPdf,
  TabelaPdf,
  dataCivilPdf,
  dataHoraPdf,
  quantidadePdf,
  valorPdf,
} from "./base";

const tipos: Record<string, string> = {
  cancelamento_produto: "Cancelamento de produto",
  perda_cartao: "Perda de cartão",
  alteracao_limites: "Alteração de limites",
  exclusao_taxa_servico: "Exclusão de taxa de serviço",
  transferencia_produtos: "Transferência de produtos",
};

function detalheEvento(
  linha: ResultadoCompletoDoRelatorio<"auditoria">["linhas"][number]
): string {
  const ausente = "Não informado pela SCC";
  switch (linha.tipo) {
    case "cancelamento_produto":
      return [
        `Produto: ${linha.produto ?? ausente} · ${linha.codigoProduto ?? "—"}`,
        `Quantidade: ${quantidadePdf(linha.quantidade)}`,
        `Valor unitário: ${valorPdf(linha.valorUnitario)}`,
        `Total informado: ${valorPdf(linha.total)}`,
      ].join(" · ");
    case "perda_cartao":
      return `Cartão: ${linha.cartaoAnterior ?? ausente} · operador: ${linha.operador ?? ausente}`;
    case "alteracao_limites":
      return [
        `Cartão: ${linha.cartaoAnterior ?? ausente} → ${linha.cartaoNovo ?? ausente}`,
        `Mínimo: ${valorPdf(linha.limiteMinimoAnterior)} → ${valorPdf(linha.limiteMinimoNovo)}`,
        `Máximo: ${valorPdf(linha.limiteMaximoAnterior)} → ${valorPdf(linha.limiteMaximoNovo)}`,
      ].join(" · ");
    case "exclusao_taxa_servico":
      return `Cartão: ${linha.cartaoAnterior ?? ausente} · operador: ${linha.operador ?? ausente}`;
    case "transferencia_produtos":
      return [
        `Cartão: ${linha.cartaoAnterior ?? ausente} → ${linha.cartaoNovo ?? ausente}`,
        `Produto: ${linha.produto ?? ausente} · ${linha.codigoProduto ?? "—"}`,
        `Quantidade: ${quantidadePdf(linha.quantidade)}`,
        "Transferência não representa valor perdido",
      ].join(" · ");
  }
}

export function DocumentoAuditoria({
  casa,
  consulta,
  resultado,
  fuso,
  geradoEm,
}: {
  casa: { nome: string };
  consulta: ConsultaRelatorio;
  resultado: ResultadoCompletoDoRelatorio<"auditoria">;
  fuso: string;
  geradoEm: Date;
}) {
  return (
    <DocumentoBase
      titulo="Auditoria"
      casa={casa}
      consulta={consulta}
      resultado={resultado}
      fuso={fuso}
      geradoEm={geradoEm}
    >
      <SecaoPdf titulo="Resumo completo por tipo de evento">
        <ResumoPdf
          rotulo="Ocorrências"
          valor={String(resultado.resumo.ocorrencias)}
        />
        <TabelaPdf
          cabecalho={[
            "Tipo",
            "Ocorrências",
            "Quantidade informada",
            "Valor informado",
          ]}
          larguras={[40, 20, 20, 20]}
          linhas={resultado.resumo.porTipo.map((item) => [
            tipos[item.tipo] ?? item.tipo,
            String(item.ocorrencias),
            quantidadePdf(item.quantidade),
            valorPdf(item.total),
          ])}
        />
      </SecaoPdf>
      <SecaoPdf titulo="Eventos">
        <TabelaPdf
          cabecalho={[
            "Tipo",
            "Movimento",
            "Dia do evento",
            "Operador",
            "Detalhes registrados",
          ]}
          larguras={[20, 18, 14, 18, 30]}
          linhas={resultado.linhas.map((linha) => [
            tipos[linha.tipo] ?? linha.tipo,
            dataHoraPdf(linha.momento, fuso),
            dataCivilPdf(linha.diaMovimento),
            `${linha.operador ?? "Não informado pela SCC"}${linha.codigoOperador ? ` · ${linha.codigoOperador}` : ""}`,
            detalheEvento(linha),
          ])}
        />
      </SecaoPdf>
    </DocumentoBase>
  );
}
