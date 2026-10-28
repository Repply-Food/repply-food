import { EstadoRelatorio } from "@/components/painel/relatorios/estado";
import type { ResultadoDoRelatorio } from "@/lib/relatorios/tipos";
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

const resultado: ResultadoDoRelatorio<"produtos"> = {
  situacao: "parcial",
  revisao: "2",
  cobertura: {
    esperados: 3,
    recebidos: 2,
    ausentes: ["2026-10-27"],
    capturadoEm: "2026-10-28T02:00:00+00:00",
    simulacao: true,
    recursos: ["pdv"],
  },
  linhas: [],
  resumo: {
    quantidade: "0.000",
    vendas: "0.00",
    custos: null,
    diferenca: null,
  },
  paginacao: { pagina: 1, tamanho: 50, totalLinhas: 0 },
};

describe("estado do relatório", () => {
  it("explica cobertura parcial, dados fictícios e horário no fuso da casa", () => {
    render(
      <EstadoRelatorio
        resultado={resultado}
        fuso="America/Fortaleza"
        temFiltros={false}
      />
    );
    expect(screen.getByText("Totais parciais")).toBeTruthy();
    expect(screen.getByText(/2026-10-27/)).toBeTruthy();
    expect(screen.getByText("Dados fictícios de demonstração")).toBeTruthy();
    expect(screen.getByText(/capturados em/)).toBeTruthy();
    expect(screen.queryByText("Sem movimento no período")).toBeNull();
    const completo = { ...resultado, situacao: "completo" as const };
    const { rerender } = render(
      <EstadoRelatorio
        resultado={completo}
        fuso="America/Fortaleza"
        temFiltros={false}
      />
    );
    expect(screen.getByText("Sem movimento no período")).toBeTruthy();
    rerender(
      <EstadoRelatorio
        resultado={completo}
        fuso="America/Fortaleza"
        temFiltros
      />
    );
    expect(screen.getByText("Sem resultados para os filtros")).toBeTruthy();
  });

  it("distingue ausência de envio e zero linhas para filtros escolhidos", () => {
    const semDados: ResultadoDoRelatorio<"produtos"> = {
      ...resultado,
      situacao: "sem_dados",
      cobertura: {
        ...resultado.cobertura,
        recebidos: 0,
        ausentes: ["2026-10-26", "2026-10-27", "2026-10-28"],
      },
    };
    const { rerender } = render(
      <EstadoRelatorio
        resultado={semDados}
        fuso="America/Fortaleza"
        temFiltros={false}
      />
    );
    expect(
      screen.getByText("A SCC ainda não enviou este relatório para o período")
    ).toBeTruthy();
    rerender(
      <EstadoRelatorio
        resultado={{ ...resultado, situacao: "completo" }}
        fuso="America/Fortaleza"
        temFiltros
      />
    );
    expect(screen.getByText("Sem resultados para os filtros")).toBeTruthy();
  });
});
