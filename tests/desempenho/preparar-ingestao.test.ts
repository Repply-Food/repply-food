// @vitest-environment node
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ClienteIngestao,
  RESERVAS_INGESTAO,
  prepararIngestao,
} from "../../scripts/desempenho/preparar-ingestao.ts";

type Chamada = { texto: string; valores?: readonly string[] };

function criarCliente(
  responder: (chamada: Chamada) => {
    rows?: Record<string, unknown>[];
    rowCount?: number | null;
  }
): ClienteIngestao & { chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  return {
    chamadas,
    connect: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    query: async <T extends Record<string, unknown>>(
      texto: string,
      valores?: readonly string[]
    ) => {
      const chamada = { texto, valores };
      chamadas.push(chamada);
      const resposta = responder(chamada);
      return {
        rows: (resposta.rows ?? []) as T[],
        rowCount: resposta.rowCount ?? null,
      };
    },
  };
}

const diretorios: string[] = [];

afterEach(async () => {
  await Promise.all(
    diretorios
      .splice(0)
      .map((diretorio) => rm(diretorio, { recursive: true, force: true }))
  );
});

async function caminhoDeConfig(): Promise<string> {
  const diretorio = resolve(
    ".superpowers",
    `test-preparar-ingestao-${randomUUID()}`
  );
  diretorios.push(diretorio);
  return join(diretorio, "ingestao-acessos.local.json");
}

describe("prepararIngestao", () => {
  it.each([
    ["fora de .superpowers", "../segredos.json"],
    ["na própria raiz .superpowers", ".superpowers"],
    [
      "em arquivo rastreado sob .superpowers",
      ".superpowers/sdd/2026-10-24-otimizacao-sem-regressao/task-0-report.md",
    ],
  ])(
    "recusa caminho %s antes de criar cliente",
    async (_caso, caminhoConfig) => {
      const criarCliente = vi.fn(() => {
        throw new Error("cliente não deveria ser criado");
      });

      await expect(
        prepararIngestao({
          httpUrl: "http://127.0.0.1:55421",
          dbUrl: "postgresql://postgres@127.0.0.1:55422/postgres",
          caminhoConfig,
          criarCliente,
        })
      ).rejects.toThrow(/caminho.*configuração/i);

      expect(criarCliente).not.toHaveBeenCalled();
    }
  );

  it("recusa ambiente inválido antes de criar cliente, consultar ou escrever arquivo", async () => {
    const criarCliente = vi.fn(() => {
      throw new Error("cliente não deveria ser criado");
    });
    const caminhoConfig = resolve(
      ".superpowers",
      `teste-ambiente-invalido-${randomUUID()}.json`
    );

    await expect(
      prepararIngestao({
        httpUrl: "https://fora-do-loopback.exemplo",
        dbUrl: "postgresql://postgres@127.0.0.1:55422/postgres",
        caminhoConfig,
        criarCliente,
      })
    ).rejects.toThrow(/nuvem|loopback/i);

    expect(criarCliente).not.toHaveBeenCalled();
    await expect(stat(caminhoConfig)).rejects.toThrow();
  });

  it("recusa ancestral simbólico antes de criar cliente", async () => {
    const diretorio = resolve(
      ".superpowers",
      `test-preparar-ingestao-${randomUUID()}`
    );
    diretorios.push(diretorio);
    await mkdir(diretorio, { recursive: true });
    await symlink("/tmp", join(diretorio, "escape"));
    const criarCliente = vi.fn(() => {
      throw new Error("cliente não deveria ser criado");
    });

    await expect(
      prepararIngestao({
        httpUrl: "http://127.0.0.1:55421",
        dbUrl: "postgresql://postgres@127.0.0.1:55422/postgres",
        caminhoConfig: join(diretorio, "escape", "segredos.json"),
        criarCliente,
      })
    ).rejects.toThrow(/caminho.*configuração/i);

    expect(criarCliente).not.toHaveBeenCalled();
  });

  it("recusa a colisão antes de abrir transação ou criar o arquivo local", async () => {
    const guardas: string[] = [];
    const cliente = criarCliente((chamada) => {
      if (chamada.texto.includes("from public.restaurantes")) {
        expect(guardas).toEqual(["banco", "cron"]);
        return { rows: [{ id: RESERVAS_INGESTAO.at(0)?.restauranteId ?? "" }] };
      }
      return {};
    });
    const config = await caminhoDeConfig();

    await expect(
      prepararIngestao({
        httpUrl: "http://127.0.0.1:55421",
        dbUrl: "postgresql://postgres@127.0.0.1:55422/postgres",
        caminhoConfig: config,
        criarCliente: () => cliente,
        validarBanco: async () => {
          guardas.push("banco");
        },
        validarCron: async () => {
          guardas.push("cron");
        },
        gerarToken: () => "rf_12345678901234567890123456789012",
      })
    ).rejects.toThrow(/colisão/i);

    expect(cliente.chamadas.map((chamada) => chamada.texto)).not.toContain(
      "begin"
    );
    await expect(stat(config)).rejects.toThrow();
  });

  it("faz rollback e remove somente a configuração exclusiva que acabou de criar", async () => {
    const cliente = criarCliente((chamada) => {
      if (chamada.texto.includes("from public.restaurantes")) return {};
      if (chamada.texto.includes("insert into public.restaurantes"))
        return { rowCount: 3 };
      if (chamada.texto.includes("insert into public.tokens_envio"))
        throw new Error("falha controlada");
      return {};
    });
    const config = await caminhoDeConfig();

    await expect(
      prepararIngestao({
        httpUrl: "http://127.0.0.1:55421",
        dbUrl: "postgresql://postgres@127.0.0.1:55422/postgres",
        caminhoConfig: config,
        criarCliente: () => cliente,
        validarBanco: async () => undefined,
        validarCron: async () => undefined,
        gerarToken: () => "rf_12345678901234567890123456789012",
      })
    ).rejects.toThrow("falha controlada");

    expect(cliente.chamadas.map((chamada) => chamada.texto)).toContain(
      "rollback"
    );
    await expect(stat(config)).rejects.toThrow();
  });

  it("preserva uma configuração local já existente sem iniciar transação", async () => {
    const cliente = criarCliente((chamada) => {
      if (chamada.texto.includes("from public.restaurantes")) return {};
      return {};
    });
    const config = await caminhoDeConfig();
    await mkdir(dirname(config), { recursive: true });
    await writeFile(config, "configuração anterior", { mode: 0o600 });

    await expect(
      prepararIngestao({
        httpUrl: "http://127.0.0.1:55421",
        dbUrl: "postgresql://postgres@127.0.0.1:55422/postgres",
        caminhoConfig: config,
        criarCliente: () => cliente,
        validarBanco: async () => undefined,
        validarCron: async () => undefined,
      })
    ).rejects.toMatchObject({ code: "EEXIST" });

    expect(await readFile(config, "utf8")).toBe("configuração anterior");
    expect(cliente.chamadas.map((chamada) => chamada.texto)).not.toContain(
      "begin"
    );
  });

  it("cria três reservas vinculadas e protege o arquivo de segredos", async () => {
    let verificacao = false;
    const cliente = criarCliente((chamada) => {
      if (chamada.texto.includes("from public.restaurantes r")) {
        verificacao = true;
        return {
          rows: RESERVAS_INGESTAO.map((reserva) => ({
            restaurante_id: reserva.restauranteId,
            slug: reserva.slug,
            token_restaurante_id: reserva.restauranteId,
          })),
        };
      }
      if (chamada.texto.includes("from public.restaurantes")) return {};
      if (chamada.texto.includes("insert into public.restaurantes"))
        return { rowCount: 3 };
      if (chamada.texto.includes("insert into public.tokens_envio"))
        return { rowCount: 3 };
      return {};
    });
    const config = await caminhoDeConfig();
    const tokens = [
      "rf_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "rf_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "rf_cccccccccccccccccccccccccccccccc",
    ];

    const resultado = await prepararIngestao({
      httpUrl: "http://127.0.0.1:55421",
      dbUrl: "postgresql://postgres@127.0.0.1:55422/postgres",
      caminhoConfig: config,
      criarCliente: () => cliente,
      validarBanco: async () => undefined,
      validarCron: async () => undefined,
      gerarToken: () => tokens.shift() ?? "",
    });

    expect(resultado).toEqual({ quantidadeDeReservas: 3 });
    expect(verificacao).toBe(true);
    expect((await stat(config)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(config, "utf8"))).toMatchObject({
      reservas: RESERVAS_INGESTAO.map((reserva) => ({
        ...reserva,
        token: expect.stringMatching(/^rf_[a-z0-9]{32}$/),
      })),
    });
    expect(cliente.chamadas.map((chamada) => chamada.texto)).toContain(
      "commit"
    );
  });
});
