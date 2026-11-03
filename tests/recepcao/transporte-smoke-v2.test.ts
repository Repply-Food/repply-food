// @vitest-environment node
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { criarAmostrasV2 } from "../../scripts/scc/amostra-v2";
import {
  criarTransporteLocal,
  enviarCargas,
  executarEnvio,
} from "../../scripts/scc/enviar-v2";
import { executarGerador } from "../../scripts/scc/gerar-smoke-v2";
import type { EnvioSccV2 } from "../../supabase/functions/_shared/scc/schemas";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("transporte v2", () => {
  it.each([
    "https://example.com",
    "http://localhost.example.com",
    "http://user:password@localhost",
    "http://localhost/?token=x",
    "http://localhost/#x",
    "file:///tmp/x",
  ])("recusa destino não permitido %s", (url) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(() => criarTransporteLocal(url, "segredo")).toThrow(
      /local|loopback/i
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("envia somente para loopback, sem redirects e com prazo de 30 segundos", async () => {
    const fetch = vi.fn(async () => new Response("{}"));
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", fetch);
    const pagina = criarAmostrasV2()[0];
    if (!pagina) throw new Error("fixture inválida");
    await criarTransporteLocal(
      "http://localhost:54321/functions/v1/receber-envio",
      "segredo"
    )(pagina);
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "127.0.0.1" }),
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer segredo",
        },
        signal: expect.any(AbortSignal),
      })
    );
    expect(timeout).toHaveBeenCalledWith(30_000);
  });
  it("não revela token em falha de rede", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("segredo");
      })
    );
    const pagina = criarAmostrasV2()[0];
    if (!pagina) throw new Error("fixture inválida");
    await expect(
      criarTransporteLocal("http://127.0.0.1:54321", "segredo")(pagina)
    ).rejects.not.toThrow("segredo");
  });
  it("interrompe em erro ou recibo sem publicação e conserva páginas em retry", async () => {
    const original = criarAmostrasV2()[2];
    if (
      !original ||
      original.tipo_envio !== "itens_vendidos" ||
      !original.dados[0]
    )
      throw new Error("fixture inválida");
    const linha = original.dados[0];
    const carga = {
      ...original,
      dados: Array.from({ length: 501 }, (_, i) => ({
        ...linha,
        ordinal: i + 1,
      })),
    };
    const enviados: unknown[] = [];
    const falha = async (pagina: EnvioSccV2) => {
      enviados.push(pagina);
      return new Response(JSON.stringify({ ok: true, estado: "recebendo" }));
    };
    await expect(enviarCargas([carga], falha)).rejects.toThrow(/publica/i);
    expect(enviados).toHaveLength(2);
    const repetidos: unknown[] = [];
    await enviarCargas([carga], async (pagina) => {
      repetidos.push(pagina);
      return Response.json({
        ok: true,
        estado:
          pagina.pagina.numero === pagina.pagina.total
            ? "publicada"
            : "recebendo",
      });
    });
    expect(repetidos).toEqual(enviados);
    const parciais: unknown[] = [];
    await expect(
      enviarCargas([carga, original], async (pagina) => {
        parciais.push(pagina);
        return new Response(null, { status: 409 });
      })
    ).rejects.toThrow(/409/);
    expect(parciais).toHaveLength(1);
  });
  it("valida todas as cargas antes da primeira requisição", async () => {
    const transporte = vi.fn();
    await expect(
      enviarCargas(
        [criarAmostrasV2()[0], { segredo: "não mostrar" }],
        transporte
      )
    ).rejects.toThrow();
    expect(transporte).not.toHaveBeenCalled();
  });
});

describe("CLI smoke v2", () => {
  it("gera arquivo e dry-run valida sem rede, URL ou token", async () => {
    const diretorio = await mkdtemp("/tmp/opencode/smoke-v2-");
    const arquivo = join(diretorio, "cargas.json");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await executarGerador(["--saida", arquivo])).toBe(0);
    expect(JSON.parse(await readFile(arquivo, "utf8"))).toHaveLength(8);
    expect(await executarEnvio(["--arquivo", arquivo, "--dry-run"], {})).toBe(
      0
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(log.mock.calls.at(-1)?.[0]).toContain('"cargas":8');
  });
  it("não revela corpo inválido ou token e não faz rede", async () => {
    const diretorio = await mkdtemp("/tmp/opencode/smoke-invalido-");
    const arquivo = join(diretorio, "cargas.json");
    await writeFile(
      arquivo,
      JSON.stringify([criarAmostrasV2()[0], { segredo: "nao-exibir" }])
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      await executarEnvio(["--arquivo", arquivo], {
        RF_SCC_URL: "http://127.0.0.1",
        RF_SCC_TOKEN: "nao-exibir",
      })
    ).toBe(1);
    expect(error.mock.calls.flat().join(" ")).not.toContain("nao-exibir");
    expect(fetch).not.toHaveBeenCalled();
  });
});
