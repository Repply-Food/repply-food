// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { criarCliente, logError, rpc } = vi.hoisted(() => ({
  criarCliente: vi.fn(),
  logError: vi.fn(),
  rpc: vi.fn(),
}));

// `server-only` só existe dentro do Next; no Vitest entra um vazio.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logError }));
// Dublê do cliente do Supabase: nenhum teste aqui fala com o banco de verdade.
vi.mock("@/lib/supabase/server", () => ({ createClient: criarCliente }));

import { FERRAMENTAS, executarFerramentas } from "@/lib/mentor/ferramentas";

const CASA_DA_SESSAO = "11111111-1111-1111-1111-111111111111";
const AGORA = "2026-10-29T15:30:00.000Z";
const PERIODO = { inicio: "2026-10-01", fim: "2026-10-07" };

/** O que o mentor pode tentar passar para puxar o número de outra casa. */
const ARGUMENTOS_HOSTIS = {
  restaurante_id: "outra-casa",
  restauranteId: "outra-casa",
  p_restaurante_id: "outra-casa",
};

function chamadasDeRpc(): [string, Record<string, unknown>][] {
  return rpc.mock.calls as [string, Record<string, unknown>][];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(AGORA));
  criarCliente.mockReset();
  criarCliente.mockImplementation(async () => ({ rpc }));
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
  logError.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("catálogo de ferramentas", () => {
  it("tem nome único, descrição e parâmetros em JSON Schema", () => {
    const nomes = FERRAMENTAS.map((f) => f.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
    for (const ferramenta of FERRAMENTAS) {
      // O Gemini só aceita letras, números e sublinhado nos nomes de função.
      expect(ferramenta.nome).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(ferramenta.descricao.length).toBeGreaterThan(20);
      expect(ferramenta.parametros).toMatchObject({ type: "object" });
    }
  });

  it("cobre as seis métricas do Hoje e as oito de Resultados", () => {
    expect(FERRAMENTAS).toHaveLength(14);
  });

  it("nunca mostra o restaurante ao modelo", () => {
    const esquemas = JSON.stringify(FERRAMENTAS.map((f) => f.parametros));
    expect(esquemas).not.toMatch(/restaurante/i);
  });

  it("pede início e fim só nas ferramentas de período", () => {
    const comPeriodo = FERRAMENTAS.filter((f) =>
      JSON.stringify(f.parametros).includes('"inicio"')
    );
    expect(comPeriodo).toHaveLength(8);
    for (const ferramenta of comPeriodo) {
      expect(ferramenta.parametros).toMatchObject({
        required: ["inicio", "fim"],
      });
    }
  });
});

describe("executarFerramentas: o restaurante vem da sessão", () => {
  it("usa o restaurante da sessão mesmo que o pedido traga outro", async () => {
    const [resultado] = await executarFerramentas(
      [{ nome: "faturamento_de_hoje", argumentos: ARGUMENTOS_HOSTIS }],
      CASA_DA_SESSAO
    );

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("metrica_faturamento_do_dia", {
      p_restaurante_id: CASA_DA_SESSAO,
      p_ate: AGORA,
    });
    expect(resultado).toEqual({ nome: "faturamento_de_hoje", resultado: [] });
  });

  it.each(FERRAMENTAS.map((f) => f.nome))(
    "%s nunca leva o restaurante que o modelo mandou",
    async (nome) => {
      await executarFerramentas(
        [{ nome, argumentos: { ...PERIODO, ...ARGUMENTOS_HOSTIS } }],
        CASA_DA_SESSAO
      );

      expect(rpc).toHaveBeenCalledTimes(1);
      const [, parametros] = chamadasDeRpc()[0] ?? [];
      expect(parametros?.p_restaurante_id).toBe(CASA_DA_SESSAO);
      expect(JSON.stringify(chamadasDeRpc())).not.toContain("outra-casa");
    }
  );

  it("ignora argumentos que não são de negócio", async () => {
    await executarFerramentas(
      [
        {
          nome: "vendas_por_dia",
          argumentos: { ...PERIODO, p_limite: "00:00:01", p_agora: "x" },
        },
      ],
      CASA_DA_SESSAO
    );

    expect(rpc).toHaveBeenCalledWith("metrica_resultados_vendas_diarias", {
      p_restaurante_id: CASA_DA_SESSAO,
      p_inicio: "2026-10-01",
      p_fim: "2026-10-07",
    });
  });

  it("aceita argumentos que não são um objeto", async () => {
    const [resultado] = await executarFerramentas(
      [{ nome: "meta_do_mes", argumentos: null as never }],
      CASA_DA_SESSAO
    );

    expect(rpc).toHaveBeenCalledWith("metrica_meta_do_mes", {
      p_restaurante_id: CASA_DA_SESSAO,
      p_agora: AGORA,
    });
    expect(resultado).toEqual({ nome: "meta_do_mes", resultado: [] });
  });
});

describe("executarFerramentas: métricas do Hoje", () => {
  const casos: [string, string, Record<string, unknown>][] = [
    [
      "faturamento_de_hoje",
      "metrica_faturamento_do_dia",
      { p_restaurante_id: CASA_DA_SESSAO, p_ate: AGORA },
    ],
    [
      "comparacao_de_hoje",
      "metrica_comparacao_do_dia",
      { p_restaurante_id: CASA_DA_SESSAO, p_agora: AGORA },
    ],
    [
      "mesas_abertas_agora",
      "metrica_mesas_abertas",
      { p_restaurante_id: CASA_DA_SESSAO, p_agora: AGORA },
    ],
    [
      "curva_de_hoje",
      "metrica_curva_do_dia",
      { p_restaurante_id: CASA_DA_SESSAO, p_agora: AGORA },
    ],
    [
      "contas_esquecidas",
      "metrica_contas_esquecidas",
      {
        p_restaurante_id: CASA_DA_SESSAO,
        p_agora: AGORA,
        p_limite: "04:00:00",
      },
    ],
    [
      "meta_do_mes",
      "metrica_meta_do_mes",
      { p_restaurante_id: CASA_DA_SESSAO, p_agora: AGORA },
    ],
  ];

  it.each(casos)(
    "%s chama %s com os parâmetros exatos",
    async (nome, funcao, parametros) => {
      await executarFerramentas([{ nome, argumentos: {} }], CASA_DA_SESSAO);

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith(funcao, parametros);
    }
  );
});

describe("executarFerramentas: métricas de Resultados", () => {
  const casos: [string, string][] = [
    ["vendas_por_dia", "metrica_resultados_vendas_diarias"],
    ["mesa_e_balcao", "metrica_resultados_ocupacao"],
    ["faturamento_por_hora", "metrica_resultados_horas"],
    ["mapa_de_calor_do_movimento", "metrica_resultados_mapa_calor"],
    ["almoco_e_jantar", "metrica_resultados_turnos"],
    ["desempenho_da_equipe", "metrica_resultados_equipe"],
    ["descontos_por_operador", "metrica_resultados_descontos"],
  ];

  it.each(casos)("%s chama %s com o período", async (nome, funcao) => {
    await executarFerramentas([{ nome, argumentos: PERIODO }], CASA_DA_SESSAO);

    expect(rpc).toHaveBeenCalledWith(funcao, {
      p_restaurante_id: CASA_DA_SESSAO,
      p_inicio: "2026-10-01",
      p_fim: "2026-10-07",
    });
  });

  it("o resumo compara com o período anterior quando não se diz nada", async () => {
    await executarFerramentas(
      [{ nome: "resumo_do_periodo", argumentos: PERIODO }],
      CASA_DA_SESSAO
    );

    expect(rpc).toHaveBeenCalledWith("metrica_resultados_resumo", {
      p_restaurante_id: CASA_DA_SESSAO,
      p_inicio: "2026-10-01",
      p_fim: "2026-10-07",
      p_comparacao: "anterior",
    });
  });

  it("o resumo aceita comparar com as últimas semanas", async () => {
    await executarFerramentas(
      [
        {
          nome: "resumo_do_periodo",
          argumentos: { ...PERIODO, comparacao: "semana" },
        },
      ],
      CASA_DA_SESSAO
    );

    expect(rpc).toHaveBeenCalledWith("metrica_resultados_resumo", {
      p_restaurante_id: CASA_DA_SESSAO,
      p_inicio: "2026-10-01",
      p_fim: "2026-10-07",
      p_comparacao: "semana",
    });
  });

  it("o resumo recusa uma comparação que não existe", async () => {
    const [resultado] = await executarFerramentas(
      [
        {
          nome: "resumo_do_periodo",
          argumentos: { ...PERIODO, comparacao: "ano" },
        },
      ],
      CASA_DA_SESSAO
    );

    expect(rpc).not.toHaveBeenCalled();
    expect(resultado?.nome).toBe("resumo_do_periodo");
    expect(JSON.stringify(resultado?.resultado)).toMatch(/comparação/);
  });

  it.each([
    ["sem datas", {}],
    ["sem o fim", { inicio: "2026-10-01" }],
    ["data fora do formato", { inicio: "01/10/2026", fim: "07/10/2026" }],
    ["data que não existe", { inicio: "2026-02-30", fim: "2026-03-05" }],
    ["datas que não são texto", { inicio: 20261001, fim: 20261007 }],
    ["fim antes do início", { inicio: "2026-10-07", fim: "2026-10-01" }],
    ["mais de 90 dias", { inicio: "2026-01-01", fim: "2026-04-05" }],
  ])("recusa o período %s sem consultar o banco", async (_caso, argumentos) => {
    const [resultado] = await executarFerramentas(
      [{ nome: "vendas_por_dia", argumentos }],
      CASA_DA_SESSAO
    );

    expect(rpc).not.toHaveBeenCalled();
    expect(resultado?.nome).toBe("vendas_por_dia");
    expect(JSON.stringify(resultado?.resultado)).toMatch(/período/);
  });

  it("aceita exatamente 90 dias", async () => {
    await executarFerramentas(
      [
        {
          nome: "vendas_por_dia",
          argumentos: { inicio: "2026-01-01", fim: "2026-03-31" },
        },
      ],
      CASA_DA_SESSAO
    );

    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("executarFerramentas: o que dá errado vira resposta, não exceção", () => {
  it("ferramenta desconhecida devolve um aviso e não consulta o banco", async () => {
    const [resultado] = await executarFerramentas(
      [{ nome: "apagar_tudo", argumentos: {} }],
      CASA_DA_SESSAO
    );

    expect(rpc).not.toHaveBeenCalled();
    expect(resultado?.nome).toBe("apagar_tudo");
    expect(JSON.stringify(resultado?.resultado)).toMatch(
      /ferramenta desconhecida/i
    );
  });

  it("erro da consulta devolve 'não consegui esse número', sem o texto do banco", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "permission denied for table entradas", code: "42501" },
    });

    const [resultado] = await executarFerramentas(
      [{ nome: "faturamento_de_hoje", argumentos: {} }],
      CASA_DA_SESSAO
    );

    expect(resultado?.nome).toBe("faturamento_de_hoje");
    const texto = JSON.stringify(resultado?.resultado);
    expect(texto).toMatch(/não consegui esse número/i);
    expect(texto).not.toMatch(/permission denied|entradas|42501/);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("consulta que lança também vira 'não consegui esse número'", async () => {
    rpc.mockRejectedValue(new Error("fetch failed"));

    const [resultado] = await executarFerramentas(
      [{ nome: "meta_do_mes", argumentos: {} }],
      CASA_DA_SESSAO
    );

    expect(JSON.stringify(resultado?.resultado)).toMatch(
      /não consegui esse número/i
    );
    expect(JSON.stringify(resultado?.resultado)).not.toContain("fetch failed");
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("falha ao abrir o cliente do banco também vira resposta", async () => {
    criarCliente.mockRejectedValue(new Error("cookies fora de uma requisição"));

    const [resultado] = await executarFerramentas(
      [{ nome: "mesas_abertas_agora", argumentos: {} }],
      CASA_DA_SESSAO
    );

    expect(resultado?.nome).toBe("mesas_abertas_agora");
    expect(JSON.stringify(resultado?.resultado)).toMatch(
      /não consegui esse número/i
    );
  });

  it("uma ferramenta que falha não derruba as outras e a ordem se mantém", async () => {
    rpc.mockImplementation(async (funcao: string) =>
      funcao === "metrica_mesas_abertas"
        ? { data: null, error: { message: "boom" } }
        : { data: [{ ok: funcao }], error: null }
    );

    const resultados = await executarFerramentas(
      [
        { nome: "faturamento_de_hoje", argumentos: {} },
        { nome: "mesas_abertas_agora", argumentos: {} },
        { nome: "nao_existe", argumentos: {} },
        { nome: "meta_do_mes", argumentos: {} },
      ],
      CASA_DA_SESSAO
    );

    expect(resultados.map((r) => r.nome)).toEqual([
      "faturamento_de_hoje",
      "mesas_abertas_agora",
      "nao_existe",
      "meta_do_mes",
    ]);
    expect(resultados[0]?.resultado).toEqual([
      { ok: "metrica_faturamento_do_dia" },
    ]);
    expect(JSON.stringify(resultados[1]?.resultado)).toMatch(
      /não consegui esse número/i
    );
    expect(JSON.stringify(resultados[2]?.resultado)).toMatch(
      /ferramenta desconhecida/i
    );
    expect(resultados[3]?.resultado).toEqual([{ ok: "metrica_meta_do_mes" }]);
  });

  it("sem pedidos não devolve nada nem abre o banco", async () => {
    await expect(executarFerramentas([], CASA_DA_SESSAO)).resolves.toEqual([]);
    expect(criarCliente).not.toHaveBeenCalled();
  });

  it("devolve lista vazia quando a consulta não traz linhas", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const [resultado] = await executarFerramentas(
      [{ nome: "curva_de_hoje", argumentos: {} }],
      CASA_DA_SESSAO
    );

    expect(resultado).toEqual({ nome: "curva_de_hoje", resultado: [] });
  });
});
