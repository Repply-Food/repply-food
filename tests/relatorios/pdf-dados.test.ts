// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ obterRelatorio: vi.fn() }));

vi.mock("@/lib/relatorios/leitura", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/relatorios/leitura")>();
  return { ...original, obterRelatorio: mocks.obterRelatorio };
});
vi.mock("server-only", () => ({}));

import { ErroRelatorio } from "@/lib/relatorios/leitura";
import { carregarDadosPdf } from "@/lib/relatorios/pdf-dados";
import { resultadoSchemas } from "@/lib/relatorios/schemas-saida";
import type { ConsultaRelatorio } from "@/lib/relatorios/tipos";

const consulta: ConsultaRelatorio = {
  filtros: {
    inicio: "2026-02-14",
    fim: "2026-02-14",
    fonte: "historico",
    pdv: "D1",
  },
  pagina: 3,
  revisao: "7",
};

function paginaProdutos(
  pagina: number,
  totalLinhas: number,
  tamanho = 100,
  revisao = "7"
) {
  const inicio = (pagina - 1) * tamanho;
  const linhas = Array.from(
    { length: Math.max(0, Math.min(tamanho, totalLinhas - inicio)) },
    (_, indice) => ({
      codigoProduto: `P${inicio + indice + 1}`,
      produto: `Produto ${inicio + indice + 1}`,
      codigoPdv: "D1",
      pdv: "PDV fictício",
      codigoGrupo: "G1",
      grupo: "Grupo fictício",
      quantidade: "1.000",
      vendas: "10.00",
      custos: "4.00",
      diferenca: "6.00",
    })
  );
  return resultadoSchemas.produtos.parse({
    situacao: "completo",
    revisao,
    cobertura: {
      esperados: 1,
      recebidos: 1,
      ausentes: [],
      capturadoEm: "2026-02-15T08:00:00+00:00",
      simulacao: true,
      recursos: ["pdv", "grupo"],
    },
    linhas,
    resumo: {
      quantidade: "205.000",
      vendas: "2050.00",
      custos: "820.00",
      diferenca: "1230.00",
      grupos: [
        {
          codigoPdv: "D1",
          codigoGrupo: "G1",
          quantidade: "205.000",
          vendas: "2050.00",
          custos: "820.00",
          diferenca: "1230.00",
        },
      ],
    },
    paginacao: { pagina, tamanho, totalLinhas },
  });
}

describe("carregar todos os dados de um relatório para PDF", () => {
  beforeEach(() => mocks.obterRelatorio.mockReset());

  it("reúne 205 linhas em três páginas e fixa a revisão sem triplicar o resumo", async () => {
    mocks.obterRelatorio
      .mockResolvedValueOnce(paginaProdutos(1, 205))
      .mockResolvedValueOnce(paginaProdutos(2, 205))
      .mockResolvedValueOnce(paginaProdutos(3, 205));

    const completo = await carregarDadosPdf("casa-1", "produtos", consulta);

    expect(completo.linhas).toHaveLength(205);
    expect(completo.linhas.at(-1)?.codigoProduto).toBe("P205");
    expect(completo.resumo.vendas).toBe("2050.00");
    expect(completo.resumo.grupos[0]?.vendas).toBe("2050.00");
    expect(mocks.obterRelatorio).toHaveBeenCalledTimes(3);
    expect(mocks.obterRelatorio.mock.calls).toEqual([
      ["casa-1", "produtos", { ...consulta, pagina: 1 }, 100],
      ["casa-1", "produtos", { ...consulta, pagina: 2, revisao: "7" }, 100],
      ["casa-1", "produtos", { ...consulta, pagina: 3, revisao: "7" }, 100],
    ]);
  });

  it("recusa mais de 2.000 linhas antes de carregar páginas adicionais", async () => {
    mocks.obterRelatorio.mockResolvedValueOnce(paginaProdutos(1, 2001));

    await expect(
      carregarDadosPdf("casa-1", "produtos", consulta)
    ).rejects.toMatchObject({ codigo: "limite_pdf" });
    expect(mocks.obterRelatorio).toHaveBeenCalledTimes(1);
  });

  it("não combina páginas quando a revisão muda durante a paginação", async () => {
    mocks.obterRelatorio
      .mockResolvedValueOnce(paginaProdutos(1, 101))
      .mockRejectedValueOnce(new ErroRelatorio("dados_alterados"));

    await expect(
      carregarDadosPdf("casa-1", "produtos", consulta)
    ).rejects.toMatchObject({ codigo: "dados_alterados" });
  });
});
