// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { criarCliente, logError, rpc } = vi.hoisted(() => ({
  criarCliente: vi.fn(),
  logError: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: criarCliente,
}));
vi.mock("@/lib/logger", () => ({ logError }));

import { obterResultados } from "@/lib/metricas/resultados";
import type { FiltrosResultados } from "@/lib/metricas/resultados/filtros";

const restauranteId = "00000000-0000-0000-0000-000000000000";
const filtros: FiltrosResultados = {
  aba: "vendas",
  comparacao: "anterior",
  atalho: "7d",
  inicio: "2026-10-01",
  fim: "2026-10-07",
  quantidadeDias: 7,
  rotuloPeriodo: "1 de outubro a 7 de outubro de 2026",
  query: new URLSearchParams(),
};

const linhasPorMetrica: Record<string, unknown[]> = {
  metrica_resultados_resumo: [
    {
      faturamento: "100.00",
      taxa_servico: "10.00",
      contas: 1,
      pessoas: 2,
      ticket_conta: "100.00",
      ticket_pessoa: "50.00",
      descontos_total: "0",
      percentual_descontos: 0,
      referencia_faturamento: null,
      variacao_faturamento: null,
      referencia_contas: null,
      variacao_contas: null,
      referencia_ticket_conta: null,
      variacao_ticket_conta: null,
    },
  ],
  metrica_resultados_vendas_diarias: [],
  metrica_resultados_ocupacao: [],
  metrica_resultados_horas: [],
  metrica_resultados_mapa_calor: [],
  metrica_resultados_turnos: [],
  metrica_resultados_equipe: [],
  metrica_resultados_descontos: [],
  metrica_meta_do_mes: [
    {
      faturamento_mes: "100.00",
      meta: null,
      andamento: null,
      projecao: null,
      projecao_disponivel: false,
    },
  ],
};

function preparaLeitura(): void {
  criarCliente.mockResolvedValue({ rpc });
  rpc.mockImplementation(async (nome: string) => ({
    data: linhasPorMetrica[nome],
    error: null,
  }));
}

describe("obterResultados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra somente o código seguro quando criar o cliente rejeita", async () => {
    criarCliente.mockRejectedValue(new Error("senha confidencial"));

    await expect(obterResultados(restauranteId, filtros)).rejects.toThrow(
      "falha_leitura_resultados"
    );
    expect(logError).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledWith("falha_metricas_resultados");
  });

  it("registra somente o código seguro quando uma RPC rejeita", async () => {
    criarCliente.mockResolvedValue({ rpc });
    rpc.mockRejectedValue(new Error("PostgREST com dado confidencial"));

    await expect(obterResultados(restauranteId, filtros)).rejects.toThrow(
      "falha_leitura_resultados"
    );
    expect(logError).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledWith("falha_metricas_resultados");
  });

  it("consulta as oito RPCs em paralelo sem a meta fora do mês", async () => {
    preparaLeitura();

    const dados = await obterResultados(restauranteId, filtros);

    expect(rpc).toHaveBeenCalledTimes(8);
    expect(rpc).not.toHaveBeenCalledWith(
      "metrica_meta_do_mes",
      expect.anything()
    );
    expect(dados.meta).toBeNull();
  });

  it("consulta a meta somente no atalho mensal e preserva os valores nulos", async () => {
    preparaLeitura();

    const dados = await obterResultados(restauranteId, {
      ...filtros,
      atalho: "mes",
    });

    expect(rpc).toHaveBeenCalledTimes(9);
    expect(rpc).toHaveBeenCalledWith("metrica_meta_do_mes", {
      p_restaurante_id: restauranteId,
      p_agora: expect.any(String),
    });
    expect(dados.meta).toEqual({
      faturamentoMes: "100.00",
      meta: null,
      andamento: null,
      projecao: null,
      projecaoDisponivel: false,
    });
  });
});
