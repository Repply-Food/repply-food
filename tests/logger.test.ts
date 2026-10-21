import { describe, expect, it, vi } from "vitest";
import { logError, logInfo } from "../lib/logger";

describe("logger", () => {
  it("registra somente códigos e contextos seguros", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const pessoal = "Ana Silva RG 000.000.000-00 telefone 85999999999";

    logError("erro_interno", pessoal);
    logError("codigo inesperado e muito longo", new Error(pessoal) as never);
    logInfo("envio_processado", pessoal);
    logInfo(pessoal, "contexto inesperado");
    logInfo(new Error(pessoal), "receber-envio");
    logInfo("envio_processado", "x".repeat(10_000));

    const saida = JSON.stringify([...erro.mock.calls, ...info.mock.calls]);
    expect(saida).not.toContain("Ana Silva");
    expect(saida).not.toContain("000.000.000-00");
    expect(saida).not.toContain("85999999999");
    expect(saida.length).toBeLessThan(500);
    expect(saida).toContain("erro_interno");
    expect(saida).toContain("envio_processado");
  });

  it("aceita os códigos da etapa 3", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const codigos = [
      "falha_leitura_sessao",
      "falha_admin",
      "falha_registro_admin",
      "falha_recalculo_dia",
    ];
    for (const codigo of codigos) logError(codigo);
    expect(erro.mock.calls.map((chamada) => chamada[1])).toEqual(codigos);
    erro.mockRestore();
  });

  it("aceita o código da leitura das métricas do Hoje (etapa 5)", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("falha_metricas_hoje");
    expect(erro.mock.calls.map((chamada) => chamada[1])).toEqual([
      "falha_metricas_hoje",
    ]);
    erro.mockRestore();
  });

  it("aceita o código da leitura das métricas de Resultados", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("falha_metricas_resultados");
    expect(erro.mock.calls.map((chamada) => chamada[1])).toEqual([
      "falha_metricas_resultados",
    ]);
    erro.mockRestore();
  });

  it("aceita os códigos de salvar meta e turnos (etapa 6)", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("falha_salvar_meta");
    logError("falha_salvar_turnos");
    expect(erro.mock.calls.map((chamada) => chamada[1])).toEqual([
      "falha_salvar_meta",
      "falha_salvar_turnos",
    ]);
    erro.mockRestore();
  });

  it("aceita o código da leitura da tela de Ajustes (etapa 6)", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("falha_leitura_ajustes");
    expect(erro.mock.calls.map((chamada) => chamada[1])).toEqual([
      "falha_leitura_ajustes",
    ]);
    erro.mockRestore();
  });
});
