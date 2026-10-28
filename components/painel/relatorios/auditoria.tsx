import { dataEHoraNaCasa } from "@/lib/admin/datas";
import { formatarQuantidade, formatarValor } from "@/lib/relatorios/formatacao";
import type { ResultadoDoRelatorio } from "@/lib/relatorios/tipos";
import {
  CartaoLinha,
  GradeIndicadores,
  Indicador,
  type LinhaTabela,
  SecaoRelatorio,
  TabelaResponsiva,
  rotuloAusente,
} from "./componentes-comuns";

function nomeDoTipo(tipo: string) {
  const nomes: Record<string, string> = {
    cancelamento_produto: "Cancelamento de produto",
    perda_cartao: "Perda de cartão",
    alteracao_limites: "Alteração de limites",
    exclusao_taxa_servico: "Exclusão de taxa de serviço",
    transferencia_produtos: "Transferência de produtos",
  };
  return nomes[tipo] ?? "Evento de auditoria";
}

export function PainelAuditoria({
  resultado,
  fuso,
}: {
  resultado: ResultadoDoRelatorio<"auditoria">;
  fuso: string;
}) {
  const cancelamentos = resultado.resumo.porTipo.find(
    (item) => item.tipo === "cancelamento_produto"
  );
  const linhas: LinhaTabela[] = resultado.linhas.map((linha, indice) => {
    const momento = dataEHoraNaCasa(linha.momento, fuso);
    const campos: { rotulo: string; valor: string }[] = [];
    switch (linha.tipo) {
      case "cancelamento_produto":
        campos.push(
          { rotulo: "Produto", valor: rotuloAusente(linha.produto) },
          {
            rotulo: "Código do produto",
            valor: rotuloAusente(linha.codigoProduto),
          },
          { rotulo: "Quantidade", valor: formatarQuantidade(linha.quantidade) },
          {
            rotulo: "Valor unitário",
            valor: formatarValor(linha.valorUnitario),
          },
          { rotulo: "Total informado", valor: formatarValor(linha.total) }
        );
        break;
      case "perda_cartao":
        campos.push(
          { rotulo: "Cartão", valor: rotuloAusente(linha.cartaoAnterior) },
          { rotulo: "Operador", valor: rotuloAusente(linha.operador) }
        );
        break;
      case "alteracao_limites":
        campos.push(
          {
            rotulo: "Cartão anterior",
            valor: rotuloAusente(linha.cartaoAnterior),
          },
          { rotulo: "Cartão novo", valor: rotuloAusente(linha.cartaoNovo) },
          {
            rotulo: "Limite mínimo anterior",
            valor: formatarValor(linha.limiteMinimoAnterior),
          },
          {
            rotulo: "Limite mínimo novo",
            valor: formatarValor(linha.limiteMinimoNovo),
          },
          {
            rotulo: "Limite máximo anterior",
            valor: formatarValor(linha.limiteMaximoAnterior),
          },
          {
            rotulo: "Limite máximo novo",
            valor: formatarValor(linha.limiteMaximoNovo),
          }
        );
        break;
      case "exclusao_taxa_servico":
        campos.push(
          { rotulo: "Cartão", valor: rotuloAusente(linha.cartaoAnterior) },
          { rotulo: "Operador", valor: rotuloAusente(linha.operador) }
        );
        break;
      case "transferencia_produtos":
        campos.push(
          {
            rotulo: "Cartão anterior",
            valor: rotuloAusente(linha.cartaoAnterior),
          },
          { rotulo: "Cartão novo", valor: rotuloAusente(linha.cartaoNovo) },
          { rotulo: "Produto", valor: rotuloAusente(linha.produto) },
          {
            rotulo: "Código do produto",
            valor: rotuloAusente(linha.codigoProduto),
          },
          { rotulo: "Quantidade", valor: formatarQuantidade(linha.quantidade) }
        );
        break;
    }
    const detalhes = campos
      .map((campo) => `${campo.rotulo}: ${campo.valor}`)
      .join(" · ");
    return {
      chave: `${linha.tipo}:${linha.momento}:${linha.codigoOperador ?? "-"}:${indice}`,
      celulas: [
        nomeDoTipo(linha.tipo),
        momento,
        rotuloAusente(linha.operador),
        detalhes,
      ],
      cartao: (
        <CartaoLinha
          titulo={nomeDoTipo(linha.tipo)}
          campos={[
            { rotulo: "Momento", valor: momento },
            { rotulo: "Operador", valor: rotuloAusente(linha.operador) },
            ...campos,
          ]}
        />
      ),
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <GradeIndicadores>
        <Indicador
          titulo="Ocorrências"
          valor={String(resultado.resumo.ocorrencias)}
        />
        <Indicador
          titulo="Cancelamentos de produto"
          valor={String(cancelamentos?.ocorrencias ?? 0)}
        />
        <Indicador
          titulo="Quantidade cancelada informada"
          valor={formatarQuantidade(cancelamentos?.quantidade ?? null)}
        />
        <Indicador
          titulo="Valor informado dos cancelamentos"
          valor={formatarValor(cancelamentos?.total ?? null)}
        />
      </GradeIndicadores>
      <p className="text-sm text-muted-foreground">
        Os eventos de auditoria descrevem alterações registradas pela SCC;
        transferência não representa valor perdido.
      </p>
      <SecaoRelatorio titulo="Eventos de auditoria">
        <TabelaResponsiva
          rotulo="Eventos de auditoria"
          colunas={["Tipo", "Momento", "Operador", "Detalhes"]}
          linhas={linhas}
        />
      </SecaoRelatorio>
    </div>
  );
}
