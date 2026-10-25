// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coletarExplainInterno } from "../../scripts/desempenho/explain-interno.ts";
import { medirMetricas } from "../../scripts/desempenho/medir-metricas.ts";
import { MARCADOR_BANCO_DESCARTAVEL } from "../../scripts/desempenho/trava-nuvem.ts";

const mock = vi.hoisted(() => ({
  eventos: [] as string[],
  consultas: [] as Array<{ sql: string; papel: string }>,
  papel: "postgres",
  marcador: true,
  cron: 0,
  emitirAvisos: true,
  aviso: undefined as ((aviso: { message: string }) => void) | undefined,
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mock.mkdir,
  writeFile: mock.writeFile,
}));

vi.mock("pg", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: async () => {
      mock.eventos.push("conectar");
    },
    end: async () => {
      mock.eventos.push("fechar");
    },
    on: (_evento: string, aviso: typeof mock.aviso) => {
      mock.aviso = aviso;
    },
    query: async (sql: string) => {
      mock.consultas.push({ sql, papel: mock.papel });
      if (sql.includes("benchmark_isolation_guard")) {
        mock.eventos.push("marcador");
        return {
          rows: mock.marcador ? [{ marcador: MARCADOR_BANCO_DESCARTAVEL }] : [],
        };
      }
      if (sql.includes("cron.job")) {
        mock.eventos.push("cron");
        return { rows: [{ ativos: String(mock.cron) }] };
      }
      if (sql === "set local role authenticated") mock.papel = "authenticated";
      if (sql === "commit" || sql === "rollback") mock.papel = "postgres";
      if (
        mock.papel === "authenticated" &&
        (/^load\b/i.test(sql) || sql.includes("auto_explain."))
      ) {
        throw new Error("permission denied: configuração de superusuário");
      }
      if (sql.startsWith("select * from public.metrica_")) {
        mock.eventos.push("rpc");
        if (mock.emitirAvisos)
          mock.aviso?.({ message: "duration: plano nested" });
        return { rows: [{ valor: "10.00" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  })),
}));

const opcoes = {
  httpUrl: "http://127.0.0.1:55421",
  dbUrl: "postgresql://postgres:postgres@127.0.0.1:55422/postgres",
  usuarioId: "00000000-0000-4000-8000-000000000001",
  restauranteId: "00000000-0000-4000-8000-000000000002",
  dataReferencia: "2026-10-24T12:00:00.000Z",
  aquecimentos: 0,
  amostras: 1,
  operacoes: ["hoje_faturamento"],
  saida: ".superpowers/teste/explain.json",
};

beforeEach(() => {
  mock.eventos.length = 0;
  mock.consultas.length = 0;
  mock.papel = "postgres";
  mock.marcador = true;
  mock.cron = 0;
  mock.emitirAvisos = true;
  mock.aviso = undefined;
  mock.mkdir.mockReset().mockResolvedValue(undefined);
  mock.writeFile.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      mock.eventos.push("health");
      return new Response(null, { status: 200 });
    })
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("ordem segura das leituras sem serviços externos", () => {
  it.each([
    { httpUrl: "https://remoto.invalid" },
    { dbUrl: "postgresql://postgres@remoto.invalid:55422/postgres" },
  ])("recusa URL inválida antes de conectar ou fazer HTTP: %o", async (url) => {
    await expect(medirMetricas({ ...opcoes, ...url })).rejects.toThrow(
      /recusad/i
    );
    expect(mock.eventos).toEqual([]);
  });

  it.each(["marcador", "cron"] as const)(
    "não faz HTTP quando a trava %s nega",
    async (trava) => {
      if (trava === "marcador") mock.marcador = false;
      else mock.cron = 1;

      await expect(medirMetricas(opcoes)).rejects.toThrow(/bloqueado/i);

      expect(mock.eventos).toEqual(
        trava === "marcador"
          ? ["conectar", "marcador", "fechar"]
          : ["conectar", "marcador", "cron", "fechar"]
      );
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it.each(["rede", "status"])(
    "fecha o cliente quando o health falha por %s",
    async (falha) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          mock.eventos.push("health");
          if (falha === "rede") throw new Error("rede indisponível");
          return new Response(null, { status: 503 });
        })
      );

      await expect(medirMetricas(opcoes)).rejects.toThrow(
        /Probe HTTP local falhou/
      );
      expect(mock.eventos).toEqual([
        "conectar",
        "marcador",
        "cron",
        "health",
        "fechar",
      ]);
      expect(mock.consultas).toHaveLength(2);
    }
  );

  it("só faz health após marcador/cron e mantém a medição SQL posterior", async () => {
    const resultado = await medirMetricas(opcoes);

    expect(mock.eventos).toEqual([
      "conectar",
      "marcador",
      "cron",
      "health",
      "rpc",
      "fechar",
    ]);
    expect(fetch).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:55421/auth/v1/health"),
      expect.objectContaining({ redirect: "manual" })
    );
    expect(resultado.probeHttp.status).toBe(200);
    expect(resultado.cenarios[0]).toMatchObject({
      nome: "hoje_faturamento",
      amostras: 1,
      chamadas: 1,
      linhas: 1,
      completa: true,
    });
  });

  it("configura LOAD/GUCs só como administrador e executa RPCs como authenticated", async () => {
    await expect(coletarExplainInterno(opcoes)).resolves.toBeUndefined();

    const administrativas = mock.consultas.filter(
      ({ sql }) => /^load\b/i.test(sql) || sql.includes("auto_explain.")
    );
    expect(administrativas).toEqual([
      { sql: "load 'auto_explain'", papel: "postgres" },
      { sql: "set auto_explain.log_min_duration = 0", papel: "postgres" },
      { sql: "set auto_explain.log_analyze = on", papel: "postgres" },
      { sql: "set auto_explain.log_buffers = on", papel: "postgres" },
      { sql: "set auto_explain.log_timing = on", papel: "postgres" },
      { sql: "set auto_explain.log_nested_statements = on", papel: "postgres" },
      { sql: "set auto_explain.log_format = 'json'", papel: "postgres" },
    ]);
    const inicioTransacao = mock.consultas.findIndex(
      ({ sql }) => sql === "begin"
    );
    const ultimaAdministrativa = administrativas.at(-1);
    if (!ultimaAdministrativa)
      throw new Error("Nenhuma configuração administrativa foi executada.");
    expect(mock.consultas.indexOf(ultimaAdministrativa)).toBeLessThan(
      inicioTransacao
    );
    expect(mock.consultas).toContainEqual({
      sql: "set client_min_messages = log",
      papel: "postgres",
    });
    expect(
      mock.consultas.filter(
        ({ sql }) =>
          sql.startsWith("set local ") &&
          !sql.includes("role") &&
          !sql.includes("request.jwt")
      )
    ).toEqual([
      {
        sql: "set local statement_timeout = '20000ms'",
        papel: "authenticated",
      },
    ]);
    const rpcs = mock.consultas.filter(({ sql }) =>
      sql.startsWith("select * from public.metrica_")
    );
    expect(rpcs.map(({ sql }) => sql.match(/public\.(\w+)/)?.[1])).toEqual([
      "metrica_faturamento_do_dia",
      "metrica_comparacao_do_dia",
      "metrica_curva_do_dia",
      "metrica_resultados_resumo",
    ]);
    expect(rpcs.every(({ papel }) => papel === "authenticated")).toBe(true);
    expect(mock.writeFile).toHaveBeenCalledWith(
      opcoes.saida,
      expect.stringContaining("duration: plano nested")
    );
    expect(mock.eventos.at(-1)).toBe("fechar");
  });

  it("continua bloqueando a saída se não receber avisos nested das RPCs reais", async () => {
    mock.emitirAvisos = false;

    await expect(coletarExplainInterno(opcoes)).rejects.toThrow(
      /não entregou planos nested/
    );
    expect(mock.eventos.filter((evento) => evento === "rpc")).toHaveLength(4);
    expect(mock.writeFile).not.toHaveBeenCalled();
    expect(mock.eventos.at(-1)).toBe("fechar");
  });
});
