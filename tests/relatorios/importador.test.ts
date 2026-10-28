// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executarGerador } from "../../scripts/gerar-relatorios-ficticios";
import { executarImportador } from "../../scripts/importar-relatorios";
import {
  criarAmostras,
  criarDiaVazio,
  criarPeriodoParcial,
} from "../../scripts/relatorios/amostra";
import {
  criarTransporteLocal,
  enviarFotografia,
} from "../../scripts/relatorios/enviar";
import { fragmentarFotografia } from "../../scripts/relatorios/fragmentar";
import {
  type Fotografia,
  type LinhaRelatorio,
  type PedidoRelatorios,
  fotografiaSchema,
} from "../../supabase/functions/_shared/relatorios/schemas";
import { paginaProdutos } from "./fixtures";

const limites = vi.hoisted(() => ({
  MAX_BYTES_PAGINA: 1_048_576,
  MAX_BYTES_CARGA: 33_554_432,
  MAX_PAGINAS: 200,
  MAX_LINHAS_PAGINA: 500,
  MAX_LINHAS_CARGA: 100_000,
}));
vi.mock(
  "../../supabase/functions/_shared/relatorios/limites.ts",
  () => limites
);
afterEach(() => {
  limites.MAX_BYTES_PAGINA = 1_048_576;
  limites.MAX_BYTES_CARGA = 33_554_432;
  vi.unstubAllGlobals();
});
// Serialização independente para conferir o orçamento do banco com espaços.
function jsonb(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonb).join(", ")}]`;
  if (valor && typeof valor === "object")
    return `{${Object.entries(valor)
      .map(([k, v]) => `${JSON.stringify(k)}: ${jsonb(v)}`)
      .join(", ")}}`;
  return JSON.stringify(valor);
}
function fotografia(quantidade = 1): Fotografia {
  const p = paginaProdutos();
  const { total_linhas: _, total_paginas: __, ...manifesto } = p.manifesto;
  return {
    manifesto: { ...manifesto, recursos: [...manifesto.recursos] },
    linhas: Array.from({ length: quantidade }, (_, i) => ({
      ...p.linhas[0],
      codigo_produto: `P${i}`,
    })),
  };
}
async function cli(
  script: string,
  args: string[],
  env: Record<string, string | undefined> = {}
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((s) => {
    stdout.push(String(s));
  });
  const error = vi.spyOn(console, "error").mockImplementation((s) => {
    stderr.push(String(s));
  });
  try {
    const status =
      script === "importar-relatorios"
        ? await executarImportador(args, env)
        : await executarGerador(args);
    return { status, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}
describe("fragmentação prévia", () => {
  it("preserva 501 linhas, separa 500+1 e publica por último", () => {
    const f = fotografia(501);
    const pedidos = fragmentarFotografia(f);
    expect(
      pedidos.map((p) => (p.acao === "pagina" ? p.linhas.length : p.acao))
    ).toEqual([500, 1, "publicar"]);
    expect(
      pedidos.flatMap<LinhaRelatorio>((p) =>
        p.acao === "pagina" ? p.linhas : []
      )
    ).toEqual(f.linhas);
    expect(
      pedidos
        .slice(0, -1)
        .every(
          (p) =>
            p.acao === "pagina" &&
            p.manifesto.total_paginas === 2 &&
            p.manifesto.total_linhas === 501
        )
    ).toBe(true);
  });
  it("mede UTF-8, preserva JSON e respeita também espaços do jsonb", () => {
    limites.MAX_BYTES_PAGINA = 1400;
    const f = fotografia(8);
    f.linhas = f.linhas.map((l) => ({
      ...l,
      produto: 'ação 😀 " vírgula, dois:',
    }));
    const pedidos = fragmentarFotografia(f);
    const paginas = pedidos.filter((p) => p.acao === "pagina");
    expect(paginas.length).toBeGreaterThan(1);
    expect(paginas.every((p) => Buffer.byteLength(jsonb(p)) <= 1400)).toBe(
      true
    );
    expect(paginas.flatMap<LinhaRelatorio>((p) => p.linhas)).toEqual(f.linhas);
  });
  it("recompõe quando o manifesto passa de um a dois dígitos", () => {
    limites.MAX_BYTES_PAGINA = 942;
    const pedidos = fragmentarFotografia(fotografia(100));
    const paginas = pedidos.filter((p) => p.acao === "pagina");
    expect(paginas).toHaveLength(100);
    expect(paginas.every((p) => Buffer.byteLength(jsonb(p)) <= 942)).toBe(true);
    expect(paginas.flatMap<LinhaRelatorio>((p) => p.linhas)).toHaveLength(100);
  });
  it("recusa linha que sozinha excede o orçamento", () => {
    limites.MAX_BYTES_PAGINA = 500;
    expect(() => fragmentarFotografia(fotografia())).toThrow(/limite/i);
  });
  it("valida o total de bytes antes de chamar o transporte", async () => {
    limites.MAX_BYTES_CARGA = 600;
    let enviados = 0;
    await expect(
      enviarFotografia(fotografia(501), async () => {
        enviados++;
        return new Response(null, { status: 200 });
      })
    ).rejects.toThrow(/limite/i);
    expect(enviados).toBe(0);
  });
  it("publica uma página vazia para fotografia vazia", () => {
    const pedidos = fragmentarFotografia(fotografia(0));
    expect(pedidos).toHaveLength(2);
    expect(pedidos[0]).toMatchObject({
      acao: "pagina",
      numero: 1,
      linhas: [],
      manifesto: { total_paginas: 1, total_linhas: 0 },
    });
  });
});
describe("transporte unitário (sem importação HTTP real)", () => {
  it("interrompe em 409 sem avançar e repetição conserva UUID, ordem e conteúdo", async () => {
    const f = fotografia(501);
    const primeira: PedidoRelatorios[] = [];
    await expect(
      enviarFotografia(f, async (p) => {
        primeira.push(structuredClone(p));
        return new Response(null, {
          status: primeira.length === 2 ? 409 : 200,
        });
      })
    ).rejects.toThrow(/409/);
    expect(primeira.map((p) => p.acao)).toEqual(["pagina", "pagina"]);
    const repeticao: PedidoRelatorios[] = [];
    await enviarFotografia(f, async (p) => {
      repeticao.push(structuredClone(p));
      return new Response(null, { status: 200 });
    });
    expect(repeticao.slice(0, 2)).toEqual(primeira);
    expect(repeticao[2]).toEqual({
      acao: "publicar",
      carga_id: f.manifesto.carga_id,
    });
  });
  it.each([
    "https://example.com",
    "http://127.0.0.1.example.com",
    "http://user:pass@localhost",
    "file:///tmp/envio",
  ])("recusa destino %s antes de chamar fetch", (url) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(() => criarTransporteLocal(url, "segredo-ficticio")).toThrow(
      /local|loopback/i
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("descarta detalhes de falha de rede que contenham token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("segredo-do-transporte");
      })
    );
    const transportar = criarTransporteLocal(
      "http://[::1]:54321/functions/v1/receber-relatorios",
      "segredo-do-transporte"
    );
    try {
      await transportar({
        acao: "publicar",
        carga_id: fotografia().manifesto.carga_id,
      });
      throw new Error("não falhou");
    } catch (erro) {
      expect(String(erro)).toMatch(/transporte local/);
      expect(String(erro)).not.toContain("segredo-do-transporte");
    }
  });
  it("envia Bearer só para loopback e impede redirecionamento", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetch);
    const transportar = criarTransporteLocal(
      "http://127.0.0.1:54321/functions/v1/receber-relatorios",
      "segredo-ficticio"
    );
    await transportar({
      acao: "publicar",
      carga_id: fotografia().manifesto.carga_id,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        redirect: "error",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer segredo-ficticio",
        },
      })
    );
  });
});
describe("massa e CLI", () => {
  it("gera dois dias completos com seis relatórios válidos e cenários separados", () => {
    const amostras = criarAmostras();
    expect(amostras).toHaveLength(12);
    expect(new Set(amostras.map((f) => f.manifesto.dia_movimento))).toEqual(
      new Set(["2026-02-14", "2026-02-15"])
    );
    expect(new Set(amostras.map((f) => f.manifesto.carga_id)).size).toBe(12);
    expect(amostras.every((f) => fotografiaSchema.safeParse(f).success)).toBe(
      true
    );
    expect(criarDiaVazio()).toHaveLength(6);
    expect(
      criarDiaVazio().every(
        (f) => f.linhas.length === 0 && fotografiaSchema.safeParse(f).success
      )
    ).toBe(true);
    expect(criarPeriodoParcial().length).toBeGreaterThan(0);
    expect(criarPeriodoParcial().length).toBeLessThan(12);
    const primeiroDia = amostras.filter(
      (f) => f.manifesto.dia_movimento === "2026-02-14"
    );
    expect(
      primeiroDia.find((f) => f.manifesto.relatorio === "produtos")?.linhas
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ vendas: "16.25", custos: "4.00" }),
        expect.objectContaining({ vendas: "5.00", custos: null }),
      ])
    );
    expect(
      primeiroDia.find((f) => f.manifesto.relatorio === "comissao")?.linhas
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vendas_elegiveis: "80.00",
          comissao_oficial: "6.40",
        }),
        expect.objectContaining({
          vendas_elegiveis: "20.00",
          comissao_oficial: null,
        }),
      ])
    );
    expect(
      primeiroDia.find((f) => f.manifesto.relatorio === "auditoria")?.linhas
    ).toHaveLength(6);
  });
  it("gera arquivo e valida sem rede/token imprimindo só contagens", async () => {
    const arquivo = join(
      mkdtempSync(join(tmpdir(), "relatorios-")),
      "amostra.json"
    );
    const gerado = await cli("gerar-relatorios-ficticios", [
      "--saida",
      arquivo,
    ]);
    expect(gerado.status, gerado.stderr).toBe(0);
    expect(JSON.parse(readFileSync(arquivo, "utf8"))).toHaveLength(12);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const resultado = await cli(
      "importar-relatorios",
      ["--arquivo", arquivo, "--dry-run"],
      { RF_RELATORIOS_URL: "https://example.com" }
    );
    expect(resultado.status, resultado.stderr).toBe(0);
    expect(JSON.parse(resultado.stdout)).toEqual({
      relatorios: 12,
      linhas: 30,
      paginas: 12,
    });
    expect(resultado.stderr).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("recusa cenário herdado do protótipo sem criar arquivo", async () => {
    const arquivo = join(
      mkdtempSync(join(tmpdir(), "relatorios-")),
      "proibido.json"
    );
    const resultado = await cli("gerar-relatorios-ficticios", [
      "--saida",
      arquivo,
      "--cenario",
      "toString",
    ]);
    expect(resultado.status).toBe(1);
  });
  it("valida todas as cargas antes da rede e não imprime conteúdo inválido", async () => {
    const arquivo = join(
      mkdtempSync(join(tmpdir(), "relatorios-")),
      "invalido.json"
    );
    writeFileSync(
      arquivo,
      JSON.stringify([
        fotografia(),
        { ...fotografia(), linhas: [{ segredo: "ficticio-nao-exibir" }] },
      ])
    );
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const resultado = await cli("importar-relatorios", ["--arquivo", arquivo], {
      RF_RELATORIOS_URL: "http://127.0.0.1:54321",
      RF_RELATORIOS_TOKEN: "ficticio-nao-exibir",
    });
    expect(resultado.status).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(resultado.stdout + resultado.stderr).not.toContain(
      "ficticio-nao-exibir"
    );
  });
  it("recusa token ausente e URL externa sem revelar segredo em stdout/erro", async () => {
    const arquivo = join(
      mkdtempSync(join(tmpdir(), "relatorios-")),
      "dados.json"
    );
    writeFileSync(arquivo, JSON.stringify([fotografia()]));
    const ausente = await cli("importar-relatorios", ["--arquivo", arquivo], {
      RF_RELATORIOS_URL: "http://127.0.0.1:54321",
    });
    expect(ausente.status).toBe(1);
    expect(ausente.stderr).toMatch(/token/i);
    const externo = await cli("importar-relatorios", ["--arquivo", arquivo], {
      RF_RELATORIOS_URL: "https://example.com/segredo-super-ficticio",
      RF_RELATORIOS_TOKEN: "segredo-super-ficticio",
    });
    expect(externo.status).toBe(1);
    expect(externo.stderr).toMatch(/loopback|local/i);
    expect(externo.stdout + externo.stderr).not.toContain(
      "segredo-super-ficticio"
    );
    writeFileSync(arquivo, "segredo-super-ficticio");
    const invalido = await cli(
      "importar-relatorios",
      ["--arquivo", arquivo, "--dry-run"],
      { RF_RELATORIOS_TOKEN: "segredo-super-ficticio" }
    );
    expect(invalido.status).toBe(1);
    expect(invalido.stdout + invalido.stderr).not.toContain(
      "segredo-super-ficticio"
    );
  });
});
