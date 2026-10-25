import { describe, expect, it, vi } from "vitest";
import { gerarCenarios } from "../../scripts/desempenho/cenarios.ts";
import {
  medirAmostras,
  resumirDuracoes,
} from "../../scripts/desempenho/medir-metricas.ts";

describe("coleta de amostras do benchmark", () => {
  it("descarta aquecimentos e mede cada amostra com tempo monotônico", async () => {
    const executar = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const relogio = vi
      .fn<() => number>()
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(14)
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(25)
      .mockReturnValueOnce(30)
      .mockReturnValueOnce(38);

    const resultado = await medirAmostras(executar, 1, 2, relogio);

    expect(executar).toHaveBeenCalledTimes(3);
    expect(resultado).toEqual([4, 5]);
  });

  it("calcula percentis determinísticos sem alterar a lista recebida", () => {
    const valores = [50, 10, 40, 20, 30];

    expect(resumirDuracoes(valores)).toEqual({ p50: 30, p95: 50 });
    expect(valores).toEqual([50, 10, 40, 20, 30]);
  });

  it("mantém os cenários estáveis para a mesma semente e expõe os tamanhos projetados", () => {
    expect(gerarCenarios({ semente: 42 })).toEqual(
      gerarCenarios({ semente: 42 })
    );
    expect(gerarCenarios({ semente: 42 })[1]).toMatchObject({
      nome: "90d_x100",
      dias: 90,
      entradasPorDia: 100,
      semente: 42,
    });
    expect(gerarCenarios({ semente: 42 })).not.toEqual(
      gerarCenarios({ semente: 43 })
    );
  });
});
