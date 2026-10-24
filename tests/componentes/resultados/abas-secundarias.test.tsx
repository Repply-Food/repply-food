// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AbaDescontos } from "@/components/painel/resultados/aba-descontos";
import { AbaEquipe } from "@/components/painel/resultados/aba-equipe";
import { AbaHorarios } from "@/components/painel/resultados/aba-horarios";
import { MapaCalor } from "@/components/painel/resultados/mapa-calor";
import type { DadosDeResultados } from "@/lib/metricas/resultados/tipos";

function azulDoFundo(el: HTMLElement): number {
  const m = el.style.backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  return m?.[3] ? Number(m[3]) : Number.NaN;
}

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
    referencia: {
      faturamento: null,
      contas: null,
      pessoas: null,
      ticketConta: null,
      ticketPessoa: null,
    },
    variacao: {
      faturamento: null,
      contas: null,
      pessoas: null,
      ticketConta: null,
      ticketPessoa: null,
    },
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

  it("pinta a célula mais cheia com laranja mais forte (calor), mantendo o número em texto", () => {
    render(
      <MapaCalor
        mapa={[
          { diaSemana: 1, hora: 12, mediaContas: 1 },
          { diaSemana: 6, hora: 20, mediaContas: 10 },
        ]}
      />
    );

    const quieta = screen.getByLabelText("Segunda, 12h: média de 1 contas");
    const cheia = screen.getByLabelText("Sábado, 20h: média de 10 contas");
    // O número continua escrito (cor nunca é o único canal — regra da marca).
    expect(cheia.textContent).toContain("10 contas");
    // Laranja tem pouco azul: a célula cheia é mais laranja que a quieta.
    expect(azulDoFundo(cheia)).toBeLessThan(azulDoFundo(quieta));
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
