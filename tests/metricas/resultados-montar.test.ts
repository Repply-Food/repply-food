import {
  type LinhasDeResultados,
  montarDadosDeResultados,
} from "@/lib/metricas/resultados/montar-resultados";
import { describe, expect, it } from "vitest";

function linhas(
  sobrescritas: Partial<LinhasDeResultados> = {}
): LinhasDeResultados {
  return {
    resumo: [
      {
        faturamento: "8420.00",
        taxa_servico: "842.00",
        contas: 31,
        pessoas: 74,
        ticket_conta: "271.61",
        ticket_pessoa: "113.78",
        descontos_total: "120.00",
        percentual_descontos: 0.0143,
        referencia_faturamento: "7451.25",
        variacao_faturamento: 0.13,
        referencia_contas: 28,
        variacao_contas: 0.1071,
        referencia_ticket_conta: 266.12,
        variacao_ticket_conta: 0.0206,
      },
    ],
    vendasDiarias: [
      {
        dia_operacao: "2026-10-20",
        faturamento: "2400.00",
        taxa_servico: "240.00",
      },
    ],
    ocupacao: [{ tipo: "Mesa", faturamento: "6000.00", participacao: 0.7126 }],
    horas: [{ hora: 12, faturamento: "3100.00" }],
    mapa: [{ dia_semana: 5, hora: 12, media_contas: 4.25 }],
    turnos: [
      {
        turno: "Almoço",
        faturamento: "3500.00",
        contas: 14,
        permanencia_media: "01:22:00",
      },
    ],
    equipe: [
      {
        cod_garcom: 27,
        faturamento: "3500.00",
        contas: 14,
        pessoas: 29,
        ticket_conta: "250.00",
        ticket_pessoa: "120.69",
        taxa_servico: "350.00",
      },
    ],
    descontos: [{ cod_operador_fechamento: 99, descontos: "120.00" }],
    meta: [
      {
        faturamento_mes: "58000.00",
        meta: "120000.00",
        andamento: 0.4833,
        projecao: "116000.00",
        projecao_disponivel: true,
      },
    ],
    ...sobrescritas,
  };
}

describe("montarDadosDeResultados", () => {
  it("preserva dinheiro em string, taxa separada e referência nula", () => {
    const [resumo] = linhas().resumo;
    if (!resumo) throw new Error("fixture_invalida");
    const dados = montarDadosDeResultados(
      linhas({
        resumo: [
          {
            ...resumo,
            referencia_faturamento: null,
            variacao_faturamento: null,
            referencia_contas: null,
            variacao_contas: null,
            referencia_ticket_conta: null,
            variacao_ticket_conta: null,
            ticket_pessoa: null,
            percentual_descontos: null,
          },
        ],
      })
    );

    expect(dados.resumo.faturamento).toBe("8420.00");
    expect(dados.resumo.taxaServico).toBe("842.00");
    expect(dados.resumo.referencia.faturamento).toBeNull();
    expect(dados.resumo.ticketPessoa).toBeNull();
    expect(dados.resumo.percentualDescontos).toBeNull();
  });

  it("mapeia todas as listas sem recalcular valores nem remover nulos", () => {
    const [pessoa] = linhas().equipe;
    if (!pessoa) throw new Error("fixture_invalida");
    const dados = montarDadosDeResultados(
      linhas({
        ocupacao: [{ tipo: "Mesa", faturamento: "0", participacao: null }],
        turnos: [
          {
            turno: "Jantar",
            faturamento: "0.00",
            contas: 0,
            permanencia_media: null,
          },
        ],
        equipe: [
          {
            ...pessoa,
            ticket_pessoa: null,
          },
        ],
      })
    );

    expect(dados.vendasDiarias).toEqual([
      {
        diaOperacao: "2026-10-20",
        faturamento: "2400.00",
        taxaServico: "240.00",
      },
    ]);
    expect(dados.ocupacao).toEqual([
      { tipo: "Mesa", faturamento: "0", participacao: null },
    ]);
    expect(dados.horas).toEqual([{ hora: 12, faturamento: "3100.00" }]);
    expect(dados.mapa).toEqual([{ diaSemana: 5, hora: 12, mediaContas: 4.25 }]);
    expect(dados.turnos).toEqual([
      {
        turno: "Jantar",
        faturamento: "0.00",
        contas: 0,
        permanenciaMedia: null,
      },
    ]);
    expect(dados.equipe[0]?.ticketPessoa).toBeNull();
    expect(dados.descontos).toEqual([
      { codOperadorFechamento: 99, descontos: "120.00" },
    ]);
  });

  it("retorna meta nula fora do período mensal", () => {
    expect(montarDadosDeResultados(linhas({ meta: [] })).meta).toBeNull();
  });

  it("falha ao faltar a linha agregada", () => {
    expect(() => montarDadosDeResultados(linhas({ resumo: [] }))).toThrow(
      "linha_ausente"
    );
  });
});
