import { formatarBRL } from "@/lib/format/dinheiro";
import type { FiltrosResultados } from "@/lib/metricas/resultados/filtros";
import type { DadosDeResultados } from "@/lib/metricas/resultados/tipos";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement, ReactNode } from "react";

const estilos = StyleSheet.create({
  pagina: {
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 8.5,
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
  subtitulo: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginTop: 7,
    marginBottom: 3,
  },
  linha: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  rotulo: { color: "#525252" },
  tabela: { marginTop: 3, borderTopWidth: 1, borderTopColor: "#D4D4D4" },
  linhaTabela: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
    paddingVertical: 3,
  },
  celula: { flex: 1 },
  cabecalho: { fontFamily: "Helvetica-Bold", color: "#525252" },
  rodape: { marginTop: "auto", color: "#525252", fontSize: 8 },
});

function comparacao(filtros: FiltrosResultados): string {
  return filtros.comparacao === "semana"
    ? "Mesmo dia da semana"
    : "Período anterior";
}

function valorCodigo(prefixo: string, codigo: number | null): string {
  return codigo === null
    ? `Sem ${prefixo.toLowerCase()}`
    : `${prefixo} ${codigo}`;
}

function percentual(valor: number | null): string {
  return valor === null
    ? "—"
    : `${(valor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function data(dia: string): string {
  const [ano, mes, diaDoMes] = dia.split("-");
  return ano && mes && diaDoMes ? `${diaDoMes}/${mes}/${ano}` : dia;
}

function diaSemana(dia: number): string {
  return (
    ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][
      dia
    ] ?? "Dia"
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Text>{valor}</Text>
    </View>
  );
}

function Tabela({
  cabecalho,
  linhas,
}: { cabecalho: string[]; linhas: string[][] }) {
  return (
    <View style={estilos.tabela}>
      <View style={estilos.linhaTabela}>
        {cabecalho.map((item) => (
          <Text key={item} style={[estilos.celula, estilos.cabecalho]}>
            {item}
          </Text>
        ))}
      </View>
      {linhas.map((linha, indice) => (
        <View key={`${linha.join("-")}-${indice}`} style={estilos.linhaTabela}>
          {linha.map((item, coluna) => (
            <Text key={`${item}-${coluna}`} style={estilos.celula}>
              {item}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
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
  const { resumo } = dados;
  return (
    <Document title={`Resultados — ${casa.nome}`} author="repply food.">
      <Page size="A4" style={estilos.pagina} wrap>
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
        <View style={estilos.secao} wrap={false}>
          <Text style={estilos.tituloSecao}>Vendas</Text>
          <Linha
            rotulo="Faturamento da casa"
            valor={formatarBRL(resumo.faturamento)}
          />
          <Linha
            rotulo="Taxa de serviço (fora do faturamento)"
            valor={formatarBRL(resumo.taxaServico)}
          />
          <Linha rotulo="Contas" valor={String(resumo.contas)} />
          <Linha rotulo="Pessoas" valor={String(resumo.pessoas)} />
          <Linha
            rotulo="Ticket por conta"
            valor={
              resumo.ticketConta === null
                ? "—"
                : formatarBRL(resumo.ticketConta)
            }
          />
          <Linha
            rotulo="Ticket por pessoa"
            valor={
              resumo.ticketPessoa === null
                ? "—"
                : formatarBRL(resumo.ticketPessoa)
            }
          />
          <Text style={estilos.subtitulo}>Comparação</Text>
          <Tabela
            cabecalho={["Métrica", "Referência", "Variação"]}
            linhas={[
              [
                "Faturamento",
                resumo.referencia.faturamento === null
                  ? "—"
                  : formatarBRL(resumo.referencia.faturamento),
                percentual(resumo.variacao.faturamento),
              ],
              [
                "Contas",
                resumo.referencia.contas === null
                  ? "—"
                  : String(resumo.referencia.contas),
                percentual(resumo.variacao.contas),
              ],
              [
                "Pessoas",
                resumo.referencia.pessoas === null
                  ? "—"
                  : String(resumo.referencia.pessoas),
                percentual(resumo.variacao.pessoas),
              ],
              [
                "Por conta",
                resumo.referencia.ticketConta === null
                  ? "—"
                  : formatarBRL(resumo.referencia.ticketConta),
                percentual(resumo.variacao.ticketConta),
              ],
              [
                "Por pessoa",
                resumo.referencia.ticketPessoa === null
                  ? "—"
                  : formatarBRL(resumo.referencia.ticketPessoa),
                percentual(resumo.variacao.ticketPessoa),
              ],
            ]}
          />
          <Text style={estilos.subtitulo}>Faturamento diário</Text>
          <Tabela
            cabecalho={["Dia", "Faturamento", "Taxa separada"]}
            linhas={dados.vendasDiarias.map((venda) => [
              data(venda.diaOperacao),
              formatarBRL(venda.faturamento),
              formatarBRL(venda.taxaServico),
            ])}
          />
          <Text style={estilos.subtitulo}>Ocupação</Text>
          <Tabela
            cabecalho={["Tipo", "Faturamento", "Participação"]}
            linhas={dados.ocupacao.map((item) => [
              item.tipo,
              formatarBRL(item.faturamento),
              percentual(item.participacao),
            ])}
          />
          {filtros.atalho === "mes" && dados.meta ? (
            <>
              <Text style={estilos.subtitulo}>Meta do mês</Text>
              <Linha
                rotulo="Faturamento no mês"
                valor={formatarBRL(dados.meta.faturamentoMes)}
              />
              <Linha
                rotulo="Meta"
                valor={
                  dados.meta.meta === null
                    ? "Sem meta"
                    : formatarBRL(dados.meta.meta)
                }
              />
              <Linha
                rotulo="Projeção"
                valor={
                  dados.meta.projecao === null
                    ? "—"
                    : formatarBRL(dados.meta.projecao)
                }
              />
              <Linha
                rotulo="Andamento"
                valor={percentual(dados.meta.andamento)}
              />
            </>
          ) : null}
        </View>
        <View style={estilos.secao} break>
          <Text style={estilos.tituloSecao}>Horários</Text>
          <Text style={estilos.subtitulo}>Faturamento por hora</Text>
          <Tabela
            cabecalho={["Hora", "Faturamento"]}
            linhas={dados.horas.map((item) => [
              `${String(item.hora).padStart(2, "0")}:00`,
              formatarBRL(item.faturamento),
            ])}
          />
          <Text style={estilos.subtitulo}>Mapa de calor · média de contas</Text>
          <Tabela
            cabecalho={["Dia e hora", "Média"]}
            linhas={dados.mapa.map((item) => [
              `${diaSemana(item.diaSemana)}, ${item.hora}h`,
              item.mediaContas === null
                ? "—"
                : item.mediaContas.toLocaleString("pt-BR"),
            ])}
          />
          <Text style={estilos.subtitulo}>Turnos e permanência</Text>
          <Tabela
            cabecalho={["Turno", "Faturamento", "Contas", "Permanência"]}
            linhas={dados.turnos.map((item) => [
              item.turno,
              formatarBRL(item.faturamento),
              String(item.contas),
              item.permanenciaMedia ?? "—",
            ])}
          />
        </View>
        <View style={estilos.secao} break>
          <Text style={estilos.tituloSecao}>Equipe</Text>
          <Tabela
            cabecalho={[
              "Garçom",
              "Faturamento",
              "Contas",
              "Pessoas",
              "Por conta",
              "Por pessoa",
              "Taxa",
            ]}
            linhas={dados.equipe.map((item) => [
              valorCodigo("Garçom", item.codGarcom),
              formatarBRL(item.faturamento),
              String(item.contas),
              String(item.pessoas),
              item.ticketConta === null ? "—" : formatarBRL(item.ticketConta),
              item.ticketPessoa === null ? "—" : formatarBRL(item.ticketPessoa),
              formatarBRL(item.taxaServico),
            ])}
          />
        </View>
        <View style={estilos.secao} break>
          <Text style={estilos.tituloSecao}>Descontos</Text>
          <Linha rotulo="Total" valor={formatarBRL(resumo.descontosTotal)} />
          <Linha
            rotulo="Percentual do faturamento"
            valor={percentual(resumo.percentualDescontos)}
          />
          <Text style={estilos.subtitulo}>Por operador</Text>
          <Tabela
            cabecalho={["Operador", "Descontos"]}
            linhas={dados.descontos.map((item) => [
              valorCodigo("Operador", item.codOperadorFechamento),
              formatarBRL(item.descontos),
            ])}
          />
        </View>
        <Text style={estilos.rodape} fixed>
          repply food.
        </Text>
      </Page>
    </Document>
  );
}
