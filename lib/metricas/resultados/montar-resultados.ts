import type { Database } from "@/types/database.types";
import type { DadosDeResultados } from "./tipos";

type Funcoes = Database["public"]["Functions"];
type Linha<Nome extends keyof Funcoes> =
  Funcoes[Nome]["Returns"] extends (infer L)[] ? L : never;
type ComNulos<L, Colunas extends keyof L> = Omit<L, Colunas> & {
  [C in Colunas]: L[C] | null;
};

export type LinhasDeResultados = {
  resumo: readonly ComNulos<
    Linha<"metrica_resultados_resumo">,
    | "ticket_conta"
    | "ticket_pessoa"
    | "percentual_descontos"
    | "referencia_faturamento"
    | "variacao_faturamento"
    | "referencia_contas"
    | "variacao_contas"
    | "referencia_ticket_conta"
    | "variacao_ticket_conta"
  >[];
  vendasDiarias: readonly Linha<"metrica_resultados_vendas_diarias">[];
  ocupacao: readonly ComNulos<
    Linha<"metrica_resultados_ocupacao">,
    "participacao"
  >[];
  horas: readonly Linha<"metrica_resultados_horas">[];
  mapa: readonly ComNulos<
    Linha<"metrica_resultados_mapa_calor">,
    "media_contas"
  >[];
  turnos: readonly ComNulos<
    Linha<"metrica_resultados_turnos">,
    "permanencia_media"
  >[];
  equipe: readonly ComNulos<
    Linha<"metrica_resultados_equipe">,
    "ticket_conta" | "ticket_pessoa"
  >[];
  descontos: readonly Linha<"metrica_resultados_descontos">[];
  meta: readonly ComNulos<
    Linha<"metrica_meta_do_mes">,
    "meta" | "andamento" | "projecao"
  >[];
};

function umaLinha<L>(linhas: readonly L[]): L {
  const [linha] = linhas;
  if (!linha) throw new Error("linha_ausente");
  return linha;
}

export function montarDadosDeResultados(
  linhas: LinhasDeResultados
): DadosDeResultados {
  const resumo = umaLinha(linhas.resumo);
  const [meta] = linhas.meta;

  return {
    resumo: {
      faturamento: resumo.faturamento,
      taxaServico: resumo.taxa_servico,
      contas: resumo.contas,
      pessoas: resumo.pessoas,
      ticketConta: resumo.ticket_conta,
      ticketPessoa: resumo.ticket_pessoa,
      descontosTotal: resumo.descontos_total,
      percentualDescontos: resumo.percentual_descontos,
      referencia: {
        faturamento: resumo.referencia_faturamento,
        contas: resumo.referencia_contas,
        ticketConta: resumo.referencia_ticket_conta,
      },
      variacao: {
        faturamento: resumo.variacao_faturamento,
        contas: resumo.variacao_contas,
        ticketConta: resumo.variacao_ticket_conta,
      },
    },
    vendasDiarias: linhas.vendasDiarias.map((venda) => ({
      diaOperacao: venda.dia_operacao,
      faturamento: venda.faturamento,
      taxaServico: venda.taxa_servico,
    })),
    ocupacao: linhas.ocupacao.map((ocupacao) => ({
      tipo: ocupacao.tipo,
      faturamento: ocupacao.faturamento,
      participacao: ocupacao.participacao,
    })),
    horas: linhas.horas.map((hora) => ({
      hora: hora.hora,
      faturamento: hora.faturamento,
    })),
    mapa: linhas.mapa.map((ponto) => ({
      diaSemana: ponto.dia_semana,
      hora: ponto.hora,
      mediaContas: ponto.media_contas,
    })),
    turnos: linhas.turnos.map((turno) => ({
      turno: turno.turno,
      faturamento: turno.faturamento,
      contas: turno.contas,
      permanenciaMedia: turno.permanencia_media,
    })),
    equipe: linhas.equipe.map((pessoa) => ({
      codGarcom: pessoa.cod_garcom,
      faturamento: pessoa.faturamento,
      contas: pessoa.contas,
      pessoas: pessoa.pessoas,
      ticketConta: pessoa.ticket_conta,
      ticketPessoa: pessoa.ticket_pessoa,
      taxaServico: pessoa.taxa_servico,
    })),
    descontos: linhas.descontos.map((desconto) => ({
      codOperadorFechamento: desconto.cod_operador_fechamento,
      descontos: desconto.descontos,
    })),
    meta: meta
      ? {
          faturamentoMes: meta.faturamento_mes,
          meta: meta.meta,
          andamento: meta.andamento,
          projecao: meta.projecao,
          projecaoDisponivel: meta.projecao_disponivel,
        }
      : null,
  };
}
