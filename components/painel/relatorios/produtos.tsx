import { formatarQuantidade, formatarValor } from "@/lib/relatorios/formatacao";
import type { ResultadoDoRelatorio } from "@/lib/relatorios/tipos";
import {
  CartaoLinha,
  GradeIndicadores,
  Indicador,
  type LinhaTabela,
  SecaoRelatorio,
  TabelaResponsiva,
} from "./componentes-comuns";

export function PainelProdutos({
  resultado,
}: {
  resultado: ResultadoDoRelatorio<"produtos">;
}) {
  const linhas: LinhaTabela[] = resultado.linhas.map((linha, indice) => {
    const grupo = linha.grupo ?? linha.codigoGrupo ?? "Sem grupo informado";
    const pdv = linha.pdv ?? linha.codigoPdv ?? "Sem PDV informado";
    const continuacao = indice === 0 && resultado.paginacao.pagina > 1;
    return {
      chave: `${linha.codigoPdv ?? "-"}:${linha.codigoGrupo ?? "-"}:${linha.codigoProduto}:${indice}`,
      celulas: [
        <span key="grupo">
          {pdv} · {grupo}
          {continuacao ? (
            <small className="block text-muted-foreground">
              Este grupo pode continuar da página anterior
            </small>
          ) : null}
        </span>,
        <span key="produto">{linha.produto}</span>,
        <code key="codigo">{linha.codigoProduto}</code>,
        formatarQuantidade(linha.quantidade),
        formatarValor(linha.vendas),
        formatarValor(linha.custos),
      ],
      cartao: (
        <CartaoLinha
          titulo={`${pdv} · ${grupo}`}
          campos={[
            { rotulo: "Produto", valor: linha.produto },
            { rotulo: "Código", valor: <code>{linha.codigoProduto}</code> },
            {
              rotulo: "Quantidade",
              valor: formatarQuantidade(linha.quantidade),
            },
            { rotulo: "Vendas", valor: formatarValor(linha.vendas) },
            { rotulo: "Custos", valor: formatarValor(linha.custos) },
            {
              rotulo: "Diferença",
              valor: formatarValor(linha.diferenca),
            },
            ...(continuacao
              ? [
                  {
                    rotulo: "Grupo",
                    valor: "Este grupo pode continuar da página anterior",
                  },
                ]
              : []),
          ]}
        />
      ),
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <GradeIndicadores>
        <Indicador
          titulo="Vendas"
          valor={formatarValor(resultado.resumo.vendas)}
        />
        <Indicador
          titulo="Custos"
          valor={formatarValor(resultado.resumo.custos)}
        />
        <Indicador
          titulo="Diferença vendas − custos"
          valor={formatarValor(resultado.resumo.diferenca)}
        />
        <Indicador
          titulo="Quantidade"
          valor={formatarQuantidade(resultado.resumo.quantidade)}
        />
      </GradeIndicadores>
      <SecaoRelatorio titulo="Totais completos por grupo">
        {resultado.resumo.grupos.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {resultado.resumo.grupos.map((grupo) => (
              <li
                className="rounded-md border p-3 text-sm"
                key={`${grupo.codigoPdv ?? "-"}:${grupo.codigoGrupo ?? "-"}`}
              >
                <h3 className="mb-2 font-semibold">
                  PDV {grupo.codigoPdv ?? "não informado"} · grupo{" "}
                  {grupo.codigoGrupo ?? "não informado"}
                </h3>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <dt>Quantidade</dt>
                  <dd>{formatarQuantidade(grupo.quantidade)}</dd>
                  <dt>Vendas</dt>
                  <dd>{formatarValor(grupo.vendas)}</dd>
                  <dt>Custos</dt>
                  <dd>{formatarValor(grupo.custos)}</dd>
                  <dt>Diferença</dt>
                  <dd>{formatarValor(grupo.diferenca)}</dd>
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border p-3 text-sm text-muted-foreground">
            Nenhum grupo para este período.
          </p>
        )}
      </SecaoRelatorio>
      <SecaoRelatorio titulo="Produtos">
        <TabelaResponsiva
          rotulo="Produtos vendidos"
          colunas={[
            "PDV e grupo",
            "Produto",
            "Código",
            "Quantidade",
            "Vendas",
            "Custos",
          ]}
          linhas={linhas}
        />
      </SecaoRelatorio>
    </div>
  );
}
