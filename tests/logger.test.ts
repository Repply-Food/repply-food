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

    const saida = JSON.stringify([...erro.mock.calls, ...info.mock.calls]);
    expect(saida).not.toContain("Ana Silva");
    expect(saida).not.toContain("000.000.000-00");
    expect(saida).not.toContain("85999999999");
    expect(saida.length).toBeLessThan(500);
    expect(saida).toContain("erro_interno");
    expect(saida).toContain("envio_processado");
  });
});
