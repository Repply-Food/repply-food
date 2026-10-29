// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DadosDeResultados } from "@/lib/metricas/resultados/tipos";

const { exigirCasa, obterResultados, maybeSingle } = vi.hoisted(() => ({
  exigirCasa: vi.fn(),
  obterResultados: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/metricas/resultados", () => ({ obterResultados }));
// Os controles de período usam o roteador do Next; aqui só navegam no cliente.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// A página lê fuso e hora_virada da casa por um select simples.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}));

import PaginaResultados from "@/app/r/[slug]/resultados/page";

function base(): DadosDeResultados {
  return {
    resumo: {
      faturamento: "8420.00",
      taxaServico: "842.00",
      contas: 40,
      pessoas: 117,
      ticketConta: "210.50",
      ticketPessoa: "72.00",
      descontosTotal: "0.00",
      percentualDescontos: 0,
      referencia: {
        faturamento: "7450.00",
        contas: 38,
        pessoas: 110,
        ticketConta: "196.05",
        ticketPessoa: "67.73",
      },
      variacao: {
        faturamento: 0.13,
        contas: 0.05,
        pessoas: 0.06,
        ticketConta: 0.07,
        ticketPessoa: 0.06,
      },
    },
    vendasDiarias: [
      {
        diaOperacao: "2026-10-28",
        faturamento: "8420.00",
        taxaServico: "842.00",
      },
    ],
    ocupacao: [{ tipo: "Mesa", faturamento: "8420.00", participacao: 1 }],
    horas: [{ hora: 20, faturamento: "8420.00" }],
    mapa: [{ diaSemana: 3, hora: 20, mediaContas: 4 }],
    turnos: [
      {
        turno: "Jantar",
        faturamento: "8420.00",
        contas: 40,
        permanenciaMedia: "01:10:00",
      },
    ],
    equipe: [],
    descontos: [],
    meta: null,
  };
}

async function abrir(dados: DadosDeResultados = base()) {
  obterResultados.mockResolvedValue(dados);
  render(
    await PaginaResultados({
      params: Promise.resolve({ slug: "casa-x" }),
      searchParams: Promise.resolve({}),
    })
  );
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  exigirCasa.mockResolvedValue({
    sessao: { email: "dono@exemplo.com", ehAdmin: false },
    casa: { id: "c1", slug: "casa-x" },
    modoAdmin: false,
  });
  maybeSingle.mockResolvedValue({
    data: { fuso: "America/Sao_Paulo", hora_virada: "05:00:00" },
    error: null,
  });
});

describe("tela Resultados", () => {
  it("mostra as abas e, ao fim, o catálogo dos seis relatórios da SCC", async () => {
    await abrir();

    expect(
      screen.getByRole("navigation", { name: "Abas de resultados" })
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Relatórios da SCC" })
    ).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: /abrir relatório/i })
    ).toHaveLength(6);
  });
});
