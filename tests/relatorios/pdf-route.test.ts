// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exigirCasa: vi.fn(),
  carregarDadosPdf: vi.fn(),
  renderToBuffer: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/auth/sessao", () => ({ exigirCasa: mocks.exigirCasa }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/relatorios/pdf-dados", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/relatorios/pdf-dados")>();
  return { ...original, carregarDadosPdf: mocks.carregarDadosPdf };
});
vi.mock("@/lib/logger", () => ({ logError: mocks.logError }));
vi.mock("@react-pdf/renderer", async (importOriginal) => {
  const original = await importOriginal<typeof import("@react-pdf/renderer")>();
  return { ...original, renderToBuffer: mocks.renderToBuffer };
});

import { GET } from "@/app/r/[slug]/relatorios/[relatorio]/pdf/route";
import { ErroRelatorio } from "@/lib/relatorios/leitura";
import { ErroPdfRelatorio } from "@/lib/relatorios/pdf-dados";
import { resultadoSchemas } from "@/lib/relatorios/schemas-saida";
import { NextRequest } from "next/server";

function requisicao(url: string) {
  return new NextRequest(`http://localhost${url}`);
}

const parametrosValidos = "inicio=2026-02-14&fim=2026-02-14&fonte=historico";
const params = Promise.resolve({
  slug: "casa-ficticia",
  relatorio: "produtos",
});
const resultadoProdutos = resultadoSchemas.produtos.parse({
  situacao: "completo",
  revisao: "1",
  cobertura: {
    esperados: 1,
    recebidos: 1,
    ausentes: [],
    capturadoEm: null,
    simulacao: true,
    recursos: [],
  },
  linhas: [
    {
      codigoProduto: "P1",
      produto: "Produto fictício",
      codigoPdv: null,
      pdv: null,
      codigoGrupo: null,
      grupo: null,
      quantidade: "1.000",
      vendas: "10.00",
      custos: null,
      diferenca: null,
    },
  ],
  resumo: {
    quantidade: "1.000",
    vendas: "10.00",
    custos: null,
    diferenca: null,
    grupos: [],
  },
  paginacao: { pagina: 1, tamanho: 1, totalLinhas: 1 },
});

describe("rota PDF dos relatórios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exigirCasa.mockResolvedValue({
      casa: {
        id: "casa-id",
        slug: "casa-ficticia",
        nome: "Casa Sentinela",
        fuso: "America/Recife",
      },
      modoAdmin: false,
    });
    mocks.carregarDadosPdf.mockResolvedValue(resultadoProdutos);
    mocks.renderToBuffer.mockResolvedValue(Buffer.from("%PDF-ficticio"));
  });

  it("devolve PDF privado com nome derivado somente do relatório e datas", async () => {
    const resposta = await GET(
      requisicao(
        `/r/casa-ficticia/relatorios/produtos/pdf?${parametrosValidos}&pagina=9`
      ),
      { params }
    );

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toBe("application/pdf");
    expect(resposta.headers.get("cache-control")).toBe("private, no-store");
    expect(resposta.headers.get("content-disposition")).toContain(
      "produtos-2026-02-14-a-2026-02-14.pdf"
    );
    expect(resposta.headers.get("content-disposition")).not.toContain(
      "Casa Sentinela"
    );
    expect(mocks.carregarDadosPdf).toHaveBeenCalledWith(
      "casa-id",
      "produtos",
      expect.objectContaining({
        pagina: 1,
        filtros: expect.objectContaining({ inicio: "2026-02-14" }),
      })
    );
  });

  it("responde 422 sem renderizar quando os filtros não passam no parser estrito", async () => {
    const resposta = await GET(
      requisicao(
        `/r/casa-ficticia/relatorios/produtos/pdf?${parametrosValidos}&extra=indevido`
      ),
      { params }
    );
    expect(resposta.status).toBe(422);
    expect(mocks.carregarDadosPdf).not.toHaveBeenCalled();
    expect(mocks.renderToBuffer).not.toHaveBeenCalled();
  });

  it("responde 409 sem arquivo parcial quando a revisão mudou", async () => {
    mocks.carregarDadosPdf.mockRejectedValueOnce(
      new ErroRelatorio("dados_alterados")
    );
    const resposta = await GET(
      requisicao(
        `/r/casa-ficticia/relatorios/produtos/pdf?${parametrosValidos}`
      ),
      { params }
    );
    expect(resposta.status).toBe(409);
    expect(mocks.renderToBuffer).not.toHaveBeenCalled();
  });

  it("responde 422 quando o relatório excede o limite de exportação", async () => {
    mocks.carregarDadosPdf.mockRejectedValueOnce(
      new ErroPdfRelatorio("limite_pdf")
    );
    const resposta = await GET(
      requisicao(
        `/r/casa-ficticia/relatorios/produtos/pdf?${parametrosValidos}`
      ),
      { params }
    );
    expect(resposta.status).toBe(422);
    expect(mocks.renderToBuffer).not.toHaveBeenCalled();
  });

  it("responde 404 sem executar o renderizador se o guarda não autoriza a casa", async () => {
    mocks.exigirCasa.mockRejectedValueOnce(new Error("sem acesso"));
    const resposta = await GET(
      requisicao(
        `/r/casa-ficticia/relatorios/produtos/pdf?${parametrosValidos}`
      ),
      { params }
    );
    expect(resposta.status).toBe(404);
    expect(mocks.carregarDadosPdf).not.toHaveBeenCalled();
    expect(mocks.renderToBuffer).not.toHaveBeenCalled();
  });
});
