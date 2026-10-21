// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AbaDescontos } from "@/components/painel/resultados/aba-descontos";
import { AbaEquipe } from "@/components/painel/resultados/aba-equipe";
import { AbaHorarios } from "@/components/painel/resultados/aba-horarios";
import type { DadosDeResultados } from "@/lib/metricas/resultados/tipos";

const dados = {
  resumo: {
    faturamento: "42180.00",
    taxaServico: "4218.00",
    contas: 191,
    pessoas: 603,
    ticketConta: "220.84",
    ticketPessoa: "69.95",
    descontosTotal: "0.00",
    percentualDescontos: 0,
    referencia: { faturamento: null, contas: null, ticketConta: null },
    variacao: { faturamento: null, contas: null, ticketConta: null },
  },
  vendasDiarias: [],
  ocupacao: [],
  horas: [{ hora: 20, faturamento: "950.00" }],
  mapa: [{ diaSemana: 5, hora: 20, mediaContas: 3.5 }],
  turnos: [
    {
      turno: "Almoço",
      faturamento: "1800.00",
      contas: 12,
      permanenciaMedia: "01:15:00",
    },
    {
      turno: "Jantar",
      faturamento: "3200.00",
      contas: 20,
      permanenciaMedia: "02:00:00",
    },
  ],
  equipe: [
    {
      codGarcom: null,
      faturamento: "500.00",
      contas: 3,
      pessoas: 7,
      ticketConta: "166.67",
      ticketPessoa: "71.43",
      taxaServico: "50.00",
    },
  ],
  descontos: [{ codOperadorFechamento: null, descontos: "0.00" }],
  meta: null,
} satisfies DadosDeResultados;

afterEach(cleanup);

describe("abas secundárias de Resultados", () => {
  it("explica o mapa sem depender apenas de cor", () => {
    render(<AbaHorarios dados={dados} />);

    expect(screen.getByText(/média de contas por ocorrência/i)).toBeTruthy();
    expect(
      screen.getByLabelText("Sexta, 20h: média de 3,5 contas")
    ).toBeTruthy();
  });

  it("mantém códigos nulos separados", () => {
    render(
      <>
        <AbaEquipe dados={dados} />
        <AbaDescontos dados={dados} />
      </>
    );

    expect(screen.getAllByText("Sem garçom").length).toBeGreaterThan(0);
    expect(screen.getByText("Sem operador")).toBeTruthy();
  });

  it("distingue desconto zero de período sem movimento", () => {
    render(<AbaDescontos dados={dados} />);

    expect(screen.getAllByText("R$ 0,00").length).toBeGreaterThan(0);
    expect(screen.queryByText("Sem movimento no período")).toBeNull();
  });
});
