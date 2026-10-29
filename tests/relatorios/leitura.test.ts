// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));
vi.mock("@/lib/logger", () => ({ logError: mocks.logError }));

import { ErroRelatorio, obterRelatorio } from "@/lib/relatorios/leitura";
import { obterOpcoes } from "@/lib/relatorios/opcoes";

const consulta = {
  filtros: {
    inicio: "2026-02-14",
    fim: "2026-02-14",
    fonte: "historico" as const,
    pdv: "D1",
    garcom: "O1",
  },
  pagina: 2,
  revisao: "12",
};
const resultadoProdutos = {
  situacao: "completo",
  revisao: "12",
  cobertura: {
    esperados: 1,
    recebidos: 1,
    ausentes: [],
    capturadoEm: "2026-02-15T08:00:00+00:00",
    simulacao: false,
    recursos: ["pdv", "garcom"],
  },
  linhas: [
    {
      codigoProduto: "P1",
      produto: "Produto fictício",
      codigoPdv: "D1",
      pdv: "PDV fictício",
      codigoGrupo: "G1",
      grupo: "Grupo fictício",
      quantidade: "1.250",
      vendas: "16.25",
      custos: "4.00",
      diferenca: "12.25",
    },
  ],
  resumo: {
    // O leitor valida os totais do SQL, não os recalcula pelas linhas da página.
    quantidade: "48.500",
    vendas: "999.00",
    custos: "200.00",
    diferenca: "799.00",
    grupos: [
      {
        codigoPdv: "D1",
        codigoGrupo: "G1",
        quantidade: "48.500",
        vendas: "999.00",
        custos: "200.00",
        diferenca: "799.00",
      },
    ],
  },
  paginacao: { pagina: 2, tamanho: 25, totalLinhas: 40 },
};

describe("leitor único dos relatórios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("passa a casa autorizada e filtros validados e preserva totais SQL", async () => {
    mocks.rpc.mockResolvedValue({ data: resultadoProdutos, error: null });
    const resultado = await obterRelatorio(
      "casa-do-guarda",
      "produtos",
      consulta,
      25
    );
    expect(resultado).toEqual(resultadoProdutos);
    expect(mocks.rpc).toHaveBeenCalledWith("consultar_relatorio", {
      p_restaurante_id: "casa-do-guarda",
      p_relatorio: "produtos",
      p_filtros: consulta.filtros,
      p_pagina: 2,
      p_tamanho: 25,
      p_revisao: "12",
    });
    expect(resultado.resumo.vendas).toBe("999.00");
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
    expect(mocks.createClient).toHaveBeenCalledOnce();
  });

  it("transforma erro de revisão e recurso em erros reconhecíveis", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "dados_alterados" },
    });
    await expect(
      obterRelatorio("casa", "produtos", consulta)
    ).rejects.toMatchObject({
      name: "ErroRelatorio",
      codigo: "dados_alterados",
    });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "filtro_indisponivel" },
    });
    await expect(
      obterOpcoes("casa", "produtos", consulta.filtros, "grupo", "", 1)
    ).rejects.toMatchObject({ codigo: "filtro_indisponivel" });
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("falha com erro genérico e loga só código quando RPC/schema falham", async () => {
    mocks.rpc.mockResolvedValue({ data: { linhas: [] }, error: null });
    await expect(obterRelatorio("casa", "produtos", consulta)).rejects.toThrow(
      "falha_leitura_relatorios"
    );
    expect(mocks.logError).toHaveBeenCalledWith("falha_leitura_relatorios");
    expect(mocks.logError.mock.calls[0]).toHaveLength(1);
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "erro PostgreSQL com dado privado" },
    });
    await expect(obterRelatorio("casa", "produtos", consulta)).rejects.toThrow(
      "falha_leitura_relatorios"
    );
  });

  it("valida e entrega opções ao RPC de sessão", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        opcoes: [{ codigo: "G1", rotulo: "Grupo fictício" }],
        mais: false,
      },
      error: null,
    });
    await expect(
      obterOpcoes("casa", "produtos", consulta.filtros, "grupo", "Gru", 3)
    ).resolves.toEqual({
      opcoes: [{ codigo: "G1", rotulo: "Grupo fictício" }],
      mais: false,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("opcoes_relatorio", {
      p_restaurante_id: "casa",
      p_relatorio: "produtos",
      p_filtros: consulta.filtros,
      p_dimensao: "grupo",
      p_busca: "Gru",
      p_pagina: 3,
    });
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it("distingue instâncias do erro de domínio", async () => {
    const erro = new ErroRelatorio("dados_alterados");
    expect(erro).toBeInstanceOf(Error);
    expect(erro.codigo).toBe("dados_alterados");
  });
});
