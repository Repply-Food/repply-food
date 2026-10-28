import { dataBr } from "@/lib/admin/datas";
import { formatarValor } from "@/lib/relatorios/formatacao";
import type { ResultadoDoRelatorio } from "@/lib/relatorios/tipos";
import {
  CartaoLinha,
  GradeIndicadores,
  Indicador,
  type LinhaTabela,
  SecaoRelatorio,
  TabelaResponsiva,
} from "./componentes-comuns";

export function PainelNotasAssinadas({
  resultado,
}: {
  resultado: ResultadoDoRelatorio<"notas-assinadas">;
}) {
  const linhas: LinhaTabela[] = resultado.linhas.map((linha, indice) => ({
    chave: `${linha.codigoNota}:${linha.codigoEntrada}:${indice}`,
    celulas: [
      <code key="cliente">{linha.codigoCliente}</code>,
      <code key="nota">{linha.codigoNota}</code>,
      <code key="entrada">{linha.codigoEntrada}</code>,
      dataBr(linha.diaMovimento),
      formatarValor(linha.valor),
    ],
    cartao: (
      <CartaoLinha
        titulo={`Nota ${linha.codigoNota}`}
        campos={[
          {
            rotulo: "Código do cliente",
            valor: <code>{linha.codigoCliente}</code>,
          },
          {
            rotulo: "Código da entrada",
            valor: <code>{linha.codigoEntrada}</code>,
          },
          { rotulo: "Movimento", valor: dataBr(linha.diaMovimento) },
          { rotulo: "Valor", valor: formatarValor(linha.valor) },
        ]}
      />
    ),
  }));

  return (
    <div className="flex flex-col gap-5">
      <GradeIndicadores>
        <Indicador
          titulo="Total das notas"
          valor={formatarValor(resultado.resumo.valor)}
        />
        <Indicador
          titulo="Quantidade de notas"
          valor={String(resultado.resumo.notas)}
        />
      </GradeIndicadores>
      <p className="text-sm text-muted-foreground">
        Os clientes aparecem somente pelo código recebido; nomes pessoais não
        são armazenados.
      </p>
      <SecaoRelatorio titulo="Notas assinadas">
        <TabelaResponsiva
          rotulo="Notas assinadas"
          colunas={[
            "Cliente (código)",
            "Nota",
            "Entrada",
            "Movimento",
            "Valor",
          ]}
          linhas={linhas}
        />
      </SecaoRelatorio>
    </div>
  );
}
