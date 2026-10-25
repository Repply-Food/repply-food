import { describe, expect, it, vi } from "vitest";
import {
  configurarAutoExplain,
  configurarAutoExplainAdministrativo,
} from "../../scripts/desempenho/explain-interno.ts";
import { validarEnvelopeIntegro } from "../../scripts/desempenho/medir-ingestao.ts";
import { validarTokenDaReserva } from "../../scripts/desempenho/medir-ingestao.ts";
import {
  confirmarPapel,
  criarPerfisDeMassa,
  medirAmostrasParciais,
} from "../../scripts/desempenho/medir-metricas.ts";
import { executarEscalas } from "../../scripts/desempenho/medir-rpc-http.ts";
import {
  criarOperacoesDaTela,
  executarRodadasSequenciais,
} from "../../scripts/desempenho/medir-rpc-http.ts";

describe("instrumentos de desempenho", () => {
  it("confirma o rótulo pelo papel efetivo e recusa divergência", async () => {
    const consultar = vi.fn().mockResolvedValue({ rows: [{ admin: true }] });

    await expect(confirmarPapel(consultar, "admin")).resolves.toBe("admin");
    await expect(confirmarPapel(consultar, "dono")).rejects.toThrow(/papel/i);
  });

  it("preserva durações obtidas e registra falha parcial sem inventar zero", async () => {
    let chamadas = 0;
    const resultado = await medirAmostrasParciais(
      async () => {
        chamadas++;
        if (chamadas === 2) throw new Error("indisponível");
      },
      0,
      3,
      () => chamadas * 10
    );

    expect(resultado.duracoes).toEqual([10]);
    expect(resultado.falhas).toBe(1);
    expect(resultado.completa).toBe(false);
  });

  it("define perfis opcionais com IDs próprios sem reutilizar a massa 90x100", () => {
    const perfis = criarPerfisDeMassa();

    expect(perfis.map((perfil) => perfil.nome)).toEqual([
      "vazio",
      "esparso",
      "365d_x500",
    ]);
    expect(new Set(perfis.map((perfil) => perfil.restauranteA)).size).toBe(3);
    expect(perfis.every((perfil) => perfil.restauranteA.endsWith("100"))).toBe(
      false
    );
  });

  it("interrompe escalas posteriores quando uma escala excede timeout", async () => {
    const executar = vi
      .fn()
      .mockResolvedValueOnce({ timeout: false, operacoes: [] })
      .mockResolvedValueOnce({ timeout: true, operacoes: [] });

    const resultado = await executarEscalas(executar);

    expect(resultado.map((escala) => escala.concorrencia)).toEqual([1, 5]);
    expect(executar).toHaveBeenCalledTimes(2);
  });

  it("repete rodadas em sequência e mantém a concorrência declarada", async () => {
    let emVoo = 0;
    let maximo = 0;
    const resultado = await executarRodadasSequenciais(3, 2, async () => {
      emVoo++;
      maximo = Math.max(maximo, emVoo);
      await Promise.resolve();
      emVoo--;
      return { falhou: false, operacoes: [] };
    });

    expect(resultado).toHaveLength(3);
    expect(maximo).toBe(2);
  });

  it("espelha todas as RPCs de Hoje e Resultados com p_ate no faturamento", () => {
    const operacoes = criarOperacoesDaTela(
      "restaurante",
      "2026-10-24T12:00:00.000Z",
      {
        inicio: "2026-10-01",
        fim: "2026-10-24",
        comparacao: "semana",
        atalho: "mes",
        limiteEsquecida: "04:00:00",
      }
    );

    expect(operacoes.hoje).toHaveLength(6);
    expect(operacoes.resultados).toHaveLength(9);
    expect(operacoes.hoje[0]).toMatchObject({
      funcao: "metrica_faturamento_do_dia",
      args: { p_ate: "2026-10-24T12:00:00.000Z" },
    });
  });

  it("configura somente timeout local antes de chamar RPCs autenticadas", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await configurarAutoExplain({ query });

    expect(query.mock.calls).toEqual([
      ["set local statement_timeout = '20000ms'"],
    ]);
  });

  it("carrega auto_explain como administrador antes da sessão autenticada", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await configurarAutoExplainAdministrativo({ query });

    expect(query).toHaveBeenCalledWith("load 'auto_explain'");
    expect(query).toHaveBeenCalledWith("set auto_explain.log_min_duration = 0");
  });

  it("recusa uma janela inteira acima do limite em vez de fragmentá-la", () => {
    expect(() =>
      validarEnvelopeIntegro({ texto: "x".repeat(221) }, 220)
    ).toThrow(/2 MB/i);
    expect(
      validarEnvelopeIntegro({ texto: "x".repeat(20) }, 220)
    ).toBeGreaterThan(0);
  });

  it("exige que o hash do token pertença à reserva antes de enviar", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ valido: true }] });
    await expect(
      validarTokenDaReserva(query, "token-local", "restaurante", "slug")
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
