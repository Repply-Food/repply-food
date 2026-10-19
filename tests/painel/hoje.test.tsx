// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DadosDoHoje } from "@/lib/metricas/tipos";

const { exigirCasa, obterHoje, maybeSingle } = vi.hoisted(() => ({
  exigirCasa: vi.fn(),
  obterHoje: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/metricas/hoje", () => ({ obterHoje }));
// O relógio da atualização automática não deve exigir o provedor de rotas do Next.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// A página lê os 3 campos da casa (fuso, hora_virada, limite_conta_esquecida)
// por um select simples; aqui o cliente do servidor é um esboço encadeável.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}));

import PaginaHoje from "@/app/r/[slug]/hoje/page";

const CASA = {
  id: "c1",
  slug: "bar-do-ze",
  nome: "Bar do Zé",
  situacao: "ativo",
  fuso: "America/Sao_Paulo",
};

const UMA_SEXTA = "2026-10-09T21:40:00-03:00";

function base(): DadosDoHoje {
  return {
    faturamento: {
      valor: "8420.00",
      media: "7450.00",
      variacao: 0.13,
      taxaServico: "842.00",
      contasPagas: 40,
      pessoasPagas: 117,
    },
    porPessoa: { valor: "72.00", media: "69.00", variacao: 0.04 },
    mesasAbertas: {
      quantidade: 18,
      valorEmAberto: "3960.00",
      pessoasNaCasa: 64,
    },
    curva: [
      { minuto: 0, hoje: "0.00", tipico: "0.00" },
      { minuto: 360, hoje: "2000.00", tipico: "1800.00" },
      { minuto: 720, hoje: "8420.00", tipico: "7000.00" },
      { minuto: 1080, hoje: null, tipico: "12000.00" },
    ],
    contasEsquecidas: [
      {
        cod: 12,
        mesa: 12,
        abertaEm: UMA_SEXTA,
        abertaHa: "04:20:00",
        valor: "610.00",
      },
      {
        cod: 31,
        mesa: 31,
        abertaEm: UMA_SEXTA,
        abertaHa: "04:05:00",
        valor: "188.00",
      },
      {
        cod: 7,
        mesa: 7,
        abertaEm: UMA_SEXTA,
        abertaHa: "04:02:00",
        valor: "342.00",
      },
      {
        cod: 9,
        mesa: 9,
        abertaEm: UMA_SEXTA,
        abertaHa: "04:01:00",
        valor: "275.00",
      },
      {
        cod: 4,
        mesa: 4,
        abertaEm: UMA_SEXTA,
        abertaHa: "04:00:30",
        valor: "95.00",
      },
    ],
    meta: {
      faturamentoMes: "105000.00",
      meta: "170000.00",
      andamento: 0.62,
      projecao: "182000.00",
      projecaoDisponivel: true,
    },
  };
}

async function abrir(dados: DadosDoHoje) {
  obterHoje.mockResolvedValue(dados);
  render(await PaginaHoje({ params: Promise.resolve({ slug: "bar-do-ze" }) }));
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  exigirCasa.mockResolvedValue({
    sessao: { email: "dono@exemplo.com", ehAdmin: false },
    casa: CASA,
    modoAdmin: false,
  });
  maybeSingle.mockResolvedValue({
    data: {
      fuso: "America/Sao_Paulo",
      hora_virada: "05:00:00",
      limite_conta_esquecida: "04:00:00",
    },
    error: null,
  });
});

describe("tela Hoje", () => {
  it("mostra o faturamento da casa, a comparação e a taxa separada (D-14)", async () => {
    await abrir(base());
    expect(screen.getByText(/Faturamento da casa/)).toBeTruthy();
    expect(screen.getByText("R$ 8.420,00")).toBeTruthy();
    expect(screen.getByText(/13% vs\./)).toBeTruthy();
    expect(
      screen.getByText(/R\$ 842,00 de taxa de serviço \(fora do faturamento\)/)
    ).toBeTruthy();
  });

  it("mostra os três quadros (mesas, pessoas, por pessoa)", async () => {
    await abrir(base());
    expect(screen.getByText("Mesas abertas")).toBeTruthy();
    expect(screen.getByText("Pessoas")).toBeTruthy();
    expect(screen.getByText("Por pessoa")).toBeTruthy();
    expect(screen.getByText("64")).toBeTruthy();
    expect(screen.getByText("R$ 72,00")).toBeTruthy();
  });

  it("com conta esquecida: mostra o alerta, 3 visíveis + ver todas (D-33)", async () => {
    await abrir(base());
    expect(screen.getByText(/5 contas abertas há mais de 4h/)).toBeTruthy();
    // As três mais antigas aparecem; a quarta e a quinta ficam escondidas.
    expect(screen.getByText("R$ 610,00")).toBeTruthy();
    expect(screen.queryByText("R$ 95,00")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /ver todas \(5\)/ }));
    expect(screen.getByText("R$ 95,00")).toBeTruthy();
  });

  it("sem conta esquecida: o alerta não aparece e a meta sobe", async () => {
    await abrir({ ...base(), contasEsquecidas: [] });
    expect(screen.queryByText(/contas abertas há mais de/)).toBeNull();
    expect(screen.queryByRole("button", { name: /ver todas/ })).toBeNull();
  });

  it("com meta: mostra o andamento, a barra e a projeção", async () => {
    await abrir(base());
    expect(screen.getByText(/Meta de/)).toBeTruthy();
    expect(screen.getByText("62%")).toBeTruthy();
    expect(
      screen.getByText(
        /no ritmo atual, fecha em R\$ 182\.000,00 \(meta R\$ 170\.000,00\)/
      )
    ).toBeTruthy();
  });

  it("sem meta: diz 'sem meta definida', sem barra nem projeção", async () => {
    await abrir({
      ...base(),
      meta: {
        faturamentoMes: "105000.00",
        meta: null,
        andamento: null,
        projecao: "182000.00",
        projecaoDisponivel: true,
      },
    });
    expect(screen.getByText("sem meta definida")).toBeTruthy();
    expect(screen.queryByText(/no ritmo atual/)).toBeNull();
  });

  it("sem histórico (variação null): avisa que ainda junta o histórico (M01 e M09)", async () => {
    await abrir({
      ...base(),
      faturamento: {
        valor: "8420.00",
        media: null,
        variacao: null,
        taxaServico: "842.00",
        contasPagas: 40,
        pessoasPagas: 117,
      },
      porPessoa: { valor: "72.00", media: null, variacao: null },
    });
    expect(screen.getAllByText(/ainda juntando o histórico/)).toHaveLength(2);
    expect(screen.queryByText(/13% vs\./)).toBeNull();
  });

  it("divisão por zero no por pessoa vira '—', nunca R$ 0,00", async () => {
    await abrir({
      ...base(),
      porPessoa: { valor: null, media: null, variacao: null },
    });
    expect(screen.getByText("—")).toBeTruthy();
  });
});
