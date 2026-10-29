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

export function PainelComissao({
  resultado,
}: {
  resultado: ResultadoDoRelatorio<"comissao">;
}) {
  const linhas: LinhaTabela[] = resultado.linhas.map((linha) => ({
    chave: linha.codigoOperador,
    celulas: [
      rotuloAusente(linha.operador),
      rotuloAusente(linha.funcao),
      formatarValor(linha.vendasElegiveis),
      formatarValor(linha.comissaoOficial),
    ],
    cartao: (
      <CartaoLinha
        titulo={rotuloAusente(linha.operador)}
        campos={[
          {
            rotulo: "Código do operador",
            valor: <code>{linha.codigoOperador}</code>,
          },
          { rotulo: "Função", valor: rotuloAusente(linha.funcao) },
          {
            rotulo: "Vendas elegíveis",
            valor: formatarValor(linha.vendasElegiveis),
          },
          {
            rotulo: "Comissão oficial",
            valor: formatarValor(linha.comissaoOficial),
          },
        ]}
      />
    ),
  }));

  return (
    <div className="flex flex-col gap-5">
      <GradeIndicadores>
        <Indicador
          titulo="Vendas elegíveis"
          valor={formatarValor(resultado.resumo.vendasElegiveis)}
        />
        <Indicador
          titulo="Comissão oficial informada pela SCC"
          valor={formatarValor(resultado.resumo.comissaoOficial)}
        />
        <Indicador
          titulo="Operadores sem comissão informada"
          valor={String(resultado.resumo.operadoresSemComissao)}
        />
      </GradeIndicadores>
      {resultado.resumo.operadoresSemComissao > 0 ? (
        <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          {resultado.resumo.operadoresSemComissao} operador
          {resultado.resumo.operadoresSemComissao === 1 ? "" : "es"} sem
          comissão informada pela SCC.
        </p>
      ) : null}
      <SecaoRelatorio titulo="Comissão por operador">
        <TabelaResponsiva
          rotulo="Comissão por operador"
          colunas={[
            "Operador",
            "Função",
            "Vendas elegíveis",
            "Comissão oficial",
          ]}
          linhas={linhas}
        />
      </SecaoRelatorio>
    </div>
  );
}
