import { formatarQuantidade, formatarValor } from "@/lib/relatorios/formatacao";
import type { ResultadoCompletoDoRelatorio } from "@/lib/relatorios/pdf-dados";
import type { ConsultaRelatorio } from "@/lib/relatorios/tipos";
import type { Relatorio } from "@/lib/validators/relatorios";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement, ReactNode } from "react";

const estilos = StyleSheet.create({
  pagina: {
    paddingTop: 142,
    paddingBottom: 42,
    paddingHorizontal: 30,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: "#0A0A0A",
  },
  topo: {
    position: "absolute",
    top: 24,
    left: 30,
    right: 30,
    height: 108,
    borderBottomWidth: 2,
    borderBottomColor: "#FF5A1F",
    paddingBottom: 7,
  },
  titulo: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  textoTopo: { color: "#404040", fontSize: 7, marginBottom: 2 },
  aviso: { marginTop: 3, fontFamily: "Helvetica-Bold", color: "#7C2D12" },
  rodape: {
    position: "absolute",
    bottom: 18,
    left: 30,
    right: 30,
    textAlign: "right",
    fontSize: 7,
    color: "#525252",
  },
  secao: { marginBottom: 13 },
  tituloSecao: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#D4D4D4",
    paddingBottom: 3,
  },
  linhaResumo: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: "#E5E5E5",
    paddingVertical: 3,
  },
  rotulo: { color: "#525252", flex: 1 },
  valor: { fontFamily: "Helvetica-Bold", textAlign: "right", maxWidth: "60%" },
  tabela: { width: "100%", marginBottom: 12 },
  cabecalho: {
    flexDirection: "row",
    backgroundColor: "#F5F5F5",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#A3A3A3",
    paddingVertical: 4,
  },
  linhaTabela: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#D4D4D4",
    paddingVertical: 3,
  },
  celula: { paddingHorizontal: 3, lineHeight: 1.2 },
  cabecalhoTexto: { fontFamily: "Helvetica-Bold", color: "#404040" },
  nota: { fontSize: 7, color: "#525252", marginTop: 3 },
});

function dataBr(dia: string): string {
  const [ano, mes, numero] = dia.split("-");
  return ano && mes && numero ? `${numero}/${mes}/${ano}` : dia;
}

function dataHora(iso: string | null, fuso: string): string {
  if (iso === null) return "Não informado pela SCC";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "Não informado pela SCC";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

const rotulosFiltro = {
  pdv: "PDV",
  grupo: "grupo",
  garcom: "garçom",
  mesaDe: "mesa a partir de",
  mesaAte: "mesa até",
  operador: "operador",
  tipo: "tipo",
  categoria: "categoria",
  cliente: "código do cliente",
} as const;

function textoFiltros(consulta: ConsultaRelatorio): string {
  const partes = Object.entries(rotulosFiltro).flatMap(([chave, rotulo]) => {
    const valor = consulta.filtros[chave as keyof typeof rotulosFiltro];
    return valor === undefined ? [] : [`${rotulo}: ${valor}`];
  });
  return partes.length
    ? `Filtros: ${partes.join(" · ")}`
    : "Filtros adicionais: todos";
}

export function DocumentoBase({
  titulo,
  casa,
  consulta,
  resultado,
  fuso,
  geradoEm,
  children,
}: {
  titulo: string;
  casa: { nome: string };
  consulta: ConsultaRelatorio;
  resultado: ResultadoCompletoDoRelatorio<Relatorio>;
  fuso: string;
  geradoEm: Date;
  children: ReactNode;
}): ReactElement<DocumentProps> {
  const cobertura = resultado.cobertura;
  const faltantes = cobertura.ausentes.length
    ? `Dias sem envio: ${cobertura.ausentes.map(dataBr).join(", ")}`
    : "Todos os dias do período foram recebidos";
  return (
    <Document title={`${titulo} · repply food.`} author="repply food.">
      <Page size="A4" orientation="landscape" style={estilos.pagina} wrap>
        <View style={estilos.topo} fixed>
          <Text style={estilos.titulo}>{titulo}</Text>
          <Text style={estilos.textoTopo}>
            {casa.nome} · {dataBr(consulta.filtros.inicio)} a{" "}
            {dataBr(consulta.filtros.fim)} ·{" "}
            {consulta.filtros.fonte === "online" ? "On-line" : "Histórico"}
          </Text>
          <Text style={estilos.textoTopo}>
            Fuso: {fuso} · Capturado em {dataHora(cobertura.capturadoEm, fuso)}{" "}
            · Gerado em {dataHora(geradoEm.toISOString(), fuso)}
          </Text>
          <Text style={estilos.textoTopo}>{textoFiltros(consulta)}</Text>
          <Text style={estilos.textoTopo}>{faltantes}</Text>
          <Text style={estilos.textoTopo}>
            Cobertura: {cobertura.recebidos} de {cobertura.esperados} dias ·
            Natureza:{" "}
            {cobertura.simulacao
              ? "demonstração fictícia"
              : "dados enviados pela SCC"}
          </Text>
          {resultado.situacao === "parcial" ? (
            <Text style={estilos.aviso}>
              Totais parciais — há dias sem envio da SCC.
            </Text>
          ) : null}
          {cobertura.simulacao ? (
            <Text style={estilos.aviso}>Dados fictícios de demonstração.</Text>
          ) : null}
          {resultado.situacao === "sem_dados" ? (
            <Text style={estilos.aviso}>
              A SCC ainda não enviou este relatório para o período.
            </Text>
          ) : null}
        </View>
        <View>{children}</View>
        <Text
          style={estilos.rodape}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Página ${pageNumber} de ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

export function SecaoPdf({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <View style={estilos.secao}>
      <Text style={estilos.tituloSecao}>{titulo}</Text>
      {children}
    </View>
  );
}

export function ResumoPdf({
  rotulo,
  valor,
}: { rotulo: string; valor: string }) {
  return (
    <View style={estilos.linhaResumo} wrap={false}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Text style={estilos.valor}>{valor}</Text>
    </View>
  );
}

export function TabelaPdf({
  cabecalho,
  linhas,
  larguras,
}: {
  cabecalho: string[];
  linhas: string[][];
  larguras?: number[];
}) {
  const celula = (valor: string, indice: number) => ({
    ...estilos.celula,
    width: `${larguras?.[indice] ?? 100 / cabecalho.length}%`,
  });
  return (
    <View style={estilos.tabela}>
      <View style={estilos.cabecalho} fixed>
        {cabecalho.map((rotulo, indice) => (
          <Text
            key={`${rotulo}-${indice}`}
            style={[celula(rotulo, indice), estilos.cabecalhoTexto]}
          >
            {rotulo}
          </Text>
        ))}
      </View>
      {linhas.map((linha, indice) => (
        <View
          key={`${linha.join("-")}-${indice}`}
          style={estilos.linhaTabela}
          wrap={false}
        >
          {linha.map((valor, coluna) => (
            <Text key={`${coluna}-${valor}`} style={celula(valor, coluna)}>
              {valor}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function valorPdf(valor: string | null): string {
  return formatarValor(valor);
}

export function quantidadePdf(valor: string | null): string {
  return formatarQuantidade(valor);
}

export function dataCivilPdf(dia: string): string {
  return dataBr(dia);
}

export function dataHoraPdf(iso: string, fuso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "Não informado pela SCC";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}
