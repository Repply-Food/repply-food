import { cleanup, render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exigirCasa: vi.fn(),
  obterRelatorio: vi.fn(),
  obterOpcoes: vi.fn(),
  redirect: vi.fn((destino: string): never => {
    throw new Error(`redirect:${destino}`);
  }),
  notFound: vi.fn((): never => {
    throw new Error("notFound");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa: mocks.exigirCasa }));
vi.mock("@/lib/relatorios/leitura", () => ({
  ErroRelatorio: class extends Error {
    constructor(readonly codigo: string) {
      super(codigo);
    }
  },
  obterRelatorio: mocks.obterRelatorio,
}));
vi.mock("@/lib/relatorios/opcoes", () => ({
  obterOpcoes: mocks.obterOpcoes,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import PaginaRelatorio from "@/app/r/[slug]/relatorios/[relatorio]/page";
import { ErroRelatorio } from "@/lib/relatorios/leitura";
import {
  parametrosComoUrl,
  temFiltroAdicional,
} from "@/lib/relatorios/paginas";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("consulta da rota de relatório", () => {
  it("preserva parâmetros repetidos para que a validação estrita os rejeite", () => {
    const query = parametrosComoUrl({
      inicio: "2026-10-26",
      grupo: ["G1", "G2"],
    });
    expect(query.getAll("grupo")).toEqual(["G1", "G2"]);
  });

  it("ignora datas e fonte ao decidir se um zero é resultado de filtros adicionais", () => {
    expect(
      temFiltroAdicional({
        inicio: "2026-10-26",
        fim: "2026-10-26",
        fonte: "historico",
      })
    ).toBe(false);
    expect(
      temFiltroAdicional({
        inicio: "2026-10-26",
        fim: "2026-10-26",
        fonte: "historico",
        grupo: "G1",
      })
    ).toBe(true);
  });

  it("redireciona uma rota sem consulta para ontem no fuso da casa", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T02:30:00.000Z"));
    mocks.exigirCasa.mockResolvedValue({
      casa: { id: "casa-id", fuso: "America/Fortaleza" },
    });
    await expect(
      PaginaRelatorio({
        params: Promise.resolve({ slug: "casa-x", relatorio: "produtos" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow(
      "redirect:/r/casa-x/relatorios/produtos?inicio=2026-10-26&fim=2026-10-26&fonte=historico&pagina=1"
    );
    expect(mocks.obterRelatorio).not.toHaveBeenCalled();
  });

  it("converte link direto com recurso indisponível em aviso e oferece remover filtros", async () => {
    mocks.exigirCasa.mockResolvedValue({
      casa: { id: "casa-id", fuso: "America/Fortaleza" },
    });
    mocks.obterRelatorio.mockRejectedValue(
      new ErroRelatorio("filtro_indisponivel")
    );
    const pagina = await PaginaRelatorio({
      params: Promise.resolve({ slug: "casa-x", relatorio: "produtos" }),
      searchParams: Promise.resolve({
        inicio: "2026-10-26",
        fim: "2026-10-26",
        fonte: "historico",
        grupo: "G1",
      }),
    });
    render(pagina);
    expect(screen.getByRole("alert").textContent).toContain(
      "Esse filtro não está disponível"
    );
    expect(
      screen.getByRole("link", { name: "Remover filtros" }).getAttribute("href")
    ).toBe(
      "/r/casa-x/relatorios/produtos?inicio=2026-10-26&fim=2026-10-26&fonte=historico&pagina=1"
    );
  });

  it("atualiza revisão obsoleta limpando página e versão e mantendo filtros", async () => {
    mocks.exigirCasa.mockResolvedValue({
      casa: { id: "casa-id", fuso: "America/Fortaleza" },
    });
    mocks.obterRelatorio.mockRejectedValue(
      new ErroRelatorio("dados_alterados")
    );
    const pagina = await PaginaRelatorio({
      params: Promise.resolve({ slug: "casa-x", relatorio: "produtos" }),
      searchParams: Promise.resolve({
        inicio: "2026-10-26",
        fim: "2026-10-26",
        fonte: "historico",
        grupo: "G1",
        pagina: "3",
        revisao: "7",
      }),
    });
    render(pagina);
    const atualizar = screen.getByRole("link", { name: "Atualizar relatório" });
    expect(atualizar.getAttribute("href")).toContain("grupo=G1");
    expect(atualizar.getAttribute("href")).toContain("pagina=1");
    expect(atualizar.getAttribute("href")).not.toContain("revisao");
  });

  it("recarrega opções de categoria com o tipo escolhido na consulta", async () => {
    mocks.exigirCasa.mockResolvedValue({
      casa: { id: "casa-id", fuso: "America/Fortaleza" },
    });
    mocks.obterRelatorio.mockResolvedValue({
      situacao: "completo",
      revisao: "1",
      cobertura: {
        esperados: 1,
        recebidos: 1,
        ausentes: [],
        capturadoEm: null,
        simulacao: false,
        recursos: ["tipo", "categoria"],
      },
      linhas: [],
      resumo: {
        creditos: "0.00",
        debitos: "0.00",
        saldo: "0.00",
        grupos: [],
      },
      paginacao: { pagina: 1, tamanho: 50, totalLinhas: 0 },
    });
    await PaginaRelatorio({
      params: Promise.resolve({ slug: "casa-x", relatorio: "caixa" }),
      searchParams: Promise.resolve({
        inicio: "2026-10-26",
        fim: "2026-10-26",
        fonte: "historico",
        tipo: "debito",
      }),
    });
    expect(mocks.obterOpcoes).toHaveBeenCalledWith(
      "casa-id",
      "caixa",
      {
        inicio: "2026-10-26",
        fim: "2026-10-26",
        fonte: "historico",
        tipo: "debito",
      },
      "categoria",
      "",
      1
    );
  });

  it("não mostra fixture quando a SCC ainda não enviou linhas", async () => {
    mocks.exigirCasa.mockResolvedValue({
      casa: { id: "casa-id", fuso: "America/Fortaleza" },
    });
    mocks.obterRelatorio.mockResolvedValue({
      situacao: "sem_dados",
      revisao: "0",
      cobertura: {
        esperados: 1,
        recebidos: 0,
        ausentes: ["2026-10-26"],
        capturadoEm: null,
        simulacao: false,
        recursos: [],
      },
      linhas: [],
      resumo: {
        quantidade: "0",
        vendas: "0.00",
        custos: "0.00",
        diferenca: "0.00",
        grupos: [],
      },
      paginacao: { pagina: 1, tamanho: 50, totalLinhas: 0 },
    });
    const pagina = await PaginaRelatorio({
      params: Promise.resolve({ slug: "casa-x", relatorio: "produtos" }),
      searchParams: Promise.resolve({
        inicio: "2026-10-26",
        fim: "2026-10-26",
        fonte: "historico",
      }),
    });
    render(pagina);
    expect(
      screen.getByText("A SCC ainda não enviou este relatório para o período")
    ).toBeTruthy();
    expect(screen.queryByText("Produto fictício")).toBeNull();
  });

  it("mostra erro para consulta incompleta sem chamar a leitura", async () => {
    mocks.exigirCasa.mockResolvedValue({
      casa: { id: "casa-id", fuso: "America/Fortaleza" },
    });
    const pagina = await PaginaRelatorio({
      params: Promise.resolve({ slug: "casa-x", relatorio: "produtos" }),
      searchParams: Promise.resolve({
        inicio: "",
        fim: "2026-10-26",
        fonte: "historico",
      }),
    });
    render(pagina);
    expect(screen.getByRole("alert").textContent).toContain(
      "incompletos ou inválidos"
    );
    expect(screen.getByRole("link", { name: "Corrigir filtros" })).toBeTruthy();
    expect(mocks.obterRelatorio).not.toHaveBeenCalled();
  });

  it("rejeita slug de relatório fora do registro fechado antes de consultar a casa", async () => {
    await expect(
      PaginaRelatorio({
        params: Promise.resolve({ slug: "casa-x", relatorio: "sql-injetado" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("notFound");
    expect(mocks.exigirCasa).not.toHaveBeenCalled();
    expect(mocks.obterRelatorio).not.toHaveBeenCalled();
  });
});
