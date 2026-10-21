import type { Meta } from "../tipos";

export type DadosDeResultados = {
  resumo: {
    faturamento: string;
    taxaServico: string;
    contas: number;
    pessoas: number;
    ticketConta: string | null;
    ticketPessoa: string | null;
    descontosTotal: string;
    percentualDescontos: number | null;
    referencia: {
      faturamento: string | null;
      contas: number | null;
      ticketConta: string | null;
    };
    variacao: {
      faturamento: number | null;
      contas: number | null;
      ticketConta: number | null;
    };
  };
  vendasDiarias: {
    diaOperacao: string;
    faturamento: string;
    taxaServico: string;
  }[];
  ocupacao: {
    tipo: string;
    faturamento: string;
    participacao: number | null;
  }[];
  horas: { hora: number; faturamento: string }[];
  mapa: { diaSemana: number; hora: number; mediaContas: number | null }[];
  turnos: {
    turno: string;
    faturamento: string;
    contas: number;
    permanenciaMedia: string | null;
  }[];
  equipe: {
    codGarcom: number;
    faturamento: string;
    contas: number;
    pessoas: number;
    ticketConta: string | null;
    ticketPessoa: string | null;
    taxaServico: string;
  }[];
  descontos: { codOperadorFechamento: number; descontos: string }[];
  meta: Meta | null;
};
