import { formatarBRL } from "@/lib/format/dinheiro";
import type { FiltrosResultados } from "@/lib/metricas/resultados/filtros";
import type { DadosDeResultados } from "@/lib/metricas/resultados/tipos";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

const estilos = StyleSheet.create({
  pagina: {
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#0A0A0A",
  },
  topo: {
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#FF5A1F",
    paddingBottom: 10,
  },
  titulo: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  sutileza: { color: "#525252", marginBottom: 2 },
  secao: { marginBottom: 14 },
  tituloSecao: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  linha: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  rotulo: { color: "#525252" },
  rodape: { marginTop: "auto", color: "#525252", fontSize: 8 },
});

function comparacao(filtros: FiltrosResultados): string {
  return filtros.comparacao === "semana"
    ? "Mesmo dia da semana"
    : "Período anterior";
}

function valorCodigo(prefixo: string, codigo: number | null): string {
  return codigo === null ? `${prefixo} não informado` : `${prefixo} ${codigo}`;
}

export function DocumentoResultadosPdf({
  casa,
  filtros,
  dados,
  fuso,
  geradoEm,
}: {
  casa: { nome: string };
  filtros: FiltrosResultados;
  dados: DadosDeResultados;
  fuso: string;
  geradoEm: Date;
}): ReactElement<DocumentProps> {
  return (
    <Document title={`Resultados — ${casa.nome}`} author="repply food.">
      <Page size="A4" style={estilos.pagina}>
        <View style={estilos.topo}>
          <Text style={estilos.titulo}>Resultados</Text>
          <Text style={estilos.sutileza}>{casa.nome}</Text>
          <Text style={estilos.sutileza}>{filtros.rotuloPeriodo}</Text>
          <Text style={estilos.sutileza}>
            Comparação: {comparacao(filtros)}
          </Text>
          <Text style={estilos.sutileza}>
            Gerado em {geradoEm.toLocaleString("pt-BR", { timeZone: fuso })}
          </Text>
        </View>

        <View style={estilos.secao}>
          <Text style={estilos.tituloSecao}>Vendas</Text>
          <View style={estilos.linha}>
            <Text style={estilos.rotulo}>Faturamento da casa</Text>
            <Text>{formatarBRL(dados.resumo.faturamento)}</Text>
          </View>
          <View style={estilos.linha}>
            <Text style={estilos.rotulo}>Taxa de serviço</Text>
            <Text>{formatarBRL(dados.resumo.taxaServico)}</Text>
          </View>
          <View style={estilos.linha}>
            <Text style={estilos.rotulo}>Contas</Text>
            <Text>{dados.resumo.contas}</Text>
          </View>
          <View style={estilos.linha}>
            <Text style={estilos.rotulo}>Pessoas</Text>
            <Text>{dados.resumo.pessoas}</Text>
          </View>
        </View>

        <View style={estilos.secao}>
          <Text style={estilos.tituloSecao}>Horários</Text>
          {dados.horas.length === 0 ? (
            <Text style={estilos.rotulo}>Sem dados no período.</Text>
          ) : (
            dados.horas.map((hora) => (
              <View key={hora.hora} style={estilos.linha}>
                <Text
                  style={estilos.rotulo}
                >{`${String(hora.hora).padStart(2, "0")}:00`}</Text>
                <Text>{formatarBRL(hora.faturamento)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={estilos.secao}>
          <Text style={estilos.tituloSecao}>Equipe</Text>
          {dados.equipe.length === 0 ? (
            <Text style={estilos.rotulo}>Sem dados no período.</Text>
          ) : (
            dados.equipe.map((pessoa) => (
              <View
                key={pessoa.codGarcom ?? "sem-codigo"}
                style={estilos.linha}
              >
                <Text style={estilos.rotulo}>
                  {valorCodigo("Garçom", pessoa.codGarcom)}
                </Text>
                <Text>{formatarBRL(pessoa.faturamento)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={estilos.secao}>
          <Text style={estilos.tituloSecao}>Descontos</Text>
          <View style={estilos.linha}>
            <Text style={estilos.rotulo}>Total</Text>
            <Text>{formatarBRL(dados.resumo.descontosTotal)}</Text>
          </View>
          {dados.descontos.map((desconto) => (
            <View
              key={desconto.codOperadorFechamento ?? "sem-codigo"}
              style={estilos.linha}
            >
              <Text style={estilos.rotulo}>
                {valorCodigo("Operador", desconto.codOperadorFechamento)}
              </Text>
              <Text>{formatarBRL(desconto.descontos)}</Text>
            </View>
          ))}
        </View>

        <Text style={estilos.rodape}>repply food.</Text>
      </Page>
    </Document>
  );
}
