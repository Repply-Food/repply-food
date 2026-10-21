import { NextRequest } from "next/server";
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { exigirCasa, criarCliente, logError, obterResultados } = vi.hoisted(
  () => ({
    exigirCasa: vi.fn(),
    criarCliente: vi.fn(),
    logError: vi.fn(),
    obterResultados: vi.fn(),
  })
);

vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/supabase/server", () => ({ createClient: criarCliente }));
vi.mock("@/lib/logger", () => ({ logError }));
vi.mock("@/lib/metricas/resultados", () => ({ obterResultados }));

import { GET } from "@/app/r/[slug]/resultados/pdf/route";

const params = Promise.resolve({ slug: "casa-a" });
const dados = {
  resumo: {
    faturamento: "0",
    taxaServico: "0",
    contas: 0,
    pessoas: 0,
    ticketConta: null,
    ticketPessoa: null,
    descontosTotal: "0",
    percentualDescontos: null,
    referencia: { faturamento: null, contas: null, ticketConta: null },
    variacao: { faturamento: null, contas: null, ticketConta: null },
  },
  vendasDiarias: [],
  ocupacao: [],
  horas: [],
  mapa: [],
  turnos: [],
  equipe: [],
  descontos: [],
  meta: null,
};

function requisicao(query = "periodo=7d&comparacao=anterior"): NextRequest {
  return new NextRequest(`http://localhost/r/casa-a/resultados/pdf?${query}`);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-20T15:00:00.000Z"));
  vi.clearAllMocks();
  exigirCasa.mockResolvedValue({ casa: { id: "casa-a-id", nome: "Casa A" } });
  criarCliente.mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { fuso: "America/Sao_Paulo", hora_virada: "05:00:00" },
            error: null,
          }),
        }),
      }),
    }),
  });
  obterResultados.mockResolvedValue(dados);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PDF de resultados", () => {
  it("recusa PDF sem acesso", async () => {
    exigirCasa.mockRejectedValue(new Error("sem_acesso"));

    expect((await GET(requisicao(), { params })).status).toBe(404);
  });

  it("baixa PDF com prefixo, cabeçalhos e filtros canônicos", async () => {
    const resposta = await GET(requisicao(), { params });

    expect(resposta.headers.get("content-type")).toBe("application/pdf");
    expect(resposta.headers.get("content-disposition")).toMatch(
      /resultados-2026-10-14-a-2026-10-20\.pdf/
    );
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    expect(
      Buffer.from(await resposta.arrayBuffer())
        .subarray(0, 4)
        .toString()
    ).toBe("%PDF");
    expect(obterResultados).toHaveBeenCalledWith(
      "casa-a-id",
      expect.objectContaining({ inicio: "2026-10-14", fim: "2026-10-20" })
    );
  });

  it("não registra detalhes da falha de renderização", async () => {
    obterResultados.mockRejectedValue(new Error("senha-super-secreta"));

    const resposta = await GET(requisicao(), { params });

    expect(resposta.status).toBe(500);
    await expect(resposta.text()).resolves.toBe("falha_pdf_resultados");
    expect(logError).toHaveBeenCalledWith("falha_pdf_resultados");
  });
});
