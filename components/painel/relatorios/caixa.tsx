import { dataBr, horaNaCasa } from "@/lib/admin/datas";
import { formatarValor } from "@/lib/relatorios/formatacao";
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

export function PainelCaixa({
  resultado,
  fuso,
}: {
  resultado: ResultadoDoRelatorio<"caixa">;
  fuso: string;
}) {
  const linhas: LinhaTabela[] = resultado.linhas.map((linha) => {
    const dataHora = `${dataBr(linha.diaCivil)} ${horaNaCasa(linha.momento, fuso)}`;
    const tipo = linha.tipo === "credito" ? "Crédito" : "Débito";
    return {
      chave: linha.codigoLancamento,
      celulas: [
        rotuloAusente(linha.operador),
        dataHora,
        `${linha.categoria} (${linha.codigoCategoria})`,
        tipo,
        formatarValor(linha.valor),
      ],
      cartao: (
        <CartaoLinha
          titulo={`${tipo} · ${formatarValor(linha.valor)}`}
          campos={[
            { rotulo: "Operador", valor: rotuloAusente(linha.operador) },
            { rotulo: "Data civil e hora", valor: dataHora },
            { rotulo: "Categoria", valor: linha.categoria },
            {
              rotulo: "Código da categoria",
              valor: <code>{linha.codigoCategoria}</code>,
            },
            {
              rotulo: "Lançamento",
              valor: <code>{linha.codigoLancamento}</code>,
            },
          ]}
        />
      ),
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <GradeIndicadores>
        <Indicador
          titulo="Créditos"
          valor={formatarValor(resultado.resumo.creditos)}
        />
        <Indicador
          titulo="Débitos"
          valor={formatarValor(resultado.resumo.debitos)}
        />
        <Indicador
          titulo="Saldo dos lançamentos"
          valor={formatarValor(resultado.resumo.saldo)}
        />
      </GradeIndicadores>
      <p className="text-sm text-muted-foreground">
        Motivo e credor não foram enviados pela SCC neste relatório.
      </p>
      <SecaoRelatorio titulo="Totais completos por operador e dia civil">
        {resultado.resumo.grupos.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {resultado.resumo.grupos.map((grupo) => (
              <li
                className="rounded-md border p-3 text-sm"
                key={`${grupo.codigoOperador ?? "-"}:${grupo.diaCivil}`}
              >
                <h3 className="mb-2 font-semibold">
                  {rotuloAusente(grupo.codigoOperador)} ·{" "}
                  {dataBr(grupo.diaCivil)}
                </h3>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <dt>Créditos</dt>
                  <dd>{formatarValor(grupo.creditos)}</dd>
                  <dt>Débitos</dt>
                  <dd>{formatarValor(grupo.debitos)}</dd>
                  <dt>Saldo</dt>
                  <dd>{formatarValor(grupo.saldo)}</dd>
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border p-3 text-sm text-muted-foreground">
            Nenhum lançamento neste período.
          </p>
        )}
      </SecaoRelatorio>
      <SecaoRelatorio titulo="Lançamentos no caixa">
        <TabelaResponsiva
          rotulo="Lançamentos no caixa"
          colunas={[
            "Operador",
            "Data civil e hora",
            "Categoria",
            "Tipo",
            "Valor",
          ]}
          linhas={linhas}
        />
      </SecaoRelatorio>
    </div>
  );
}
