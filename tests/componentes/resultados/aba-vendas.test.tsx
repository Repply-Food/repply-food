// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AbaVendas } from "@/components/painel/resultados/aba-vendas";
import type { FiltrosResultados } from "@/lib/metricas/resultados/filtros";
import type { DadosDeResultados } from "@/lib/metricas/resultados/tipos";

const filtros: FiltrosResultados = {
  aba: "vendas",
  comparacao: "anterior",
  atalho: "7d",
  inicio: "2026-10-14",
  fim: "2026-10-20",
  quantidadeDias: 7,
  rotuloPeriodo: "14 de outubro a 20 de outubro de 2026",
  query: new URLSearchParams("aba=vendas&periodo=7d&comparacao=anterior"),
};

const dados: DadosDeResultados = {
  resumo: {
    faturamento: "42180.00",
    taxaServico: "4218.00",
    contas: 191,
    pessoas: 603,
    ticketConta: "220.84",
    ticketPessoa: "69.95",
    descontosTotal: "0.00",
    percentualDescontos: null,
    referencia: { faturamento: "38500.00", contas: 180, ticketConta: "213.89" },
    variacao: { faturamento: 0.09, contas: 0.06, ticketConta: 0.03 },
  },
  vendasDiarias: [
    {
      diaOperacao: "2026-10-14",
      faturamento: "42180.00",
      taxaServico: "4218.00",
    },
  ],
  ocupacao: [],
  horas: [],
  mapa: [],
  turnos: [],
  equipe: [],
  descontos: [],
  meta: null,
};

afterEach(cleanup);

describe("AbaVendas", () => {
  it("mostra taxa fora do faturamento e gráfico diário acessível", () => {
    render(<AbaVendas dados={dados} filtros={filtros} />);

    expect(
      screen.getByText(/taxa de serviço \(fora do faturamento\)/i)
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /faturamento por dia/i })
    ).toBeTruthy();
  });
});
