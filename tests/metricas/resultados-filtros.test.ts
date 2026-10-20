// @vitest-environment node
import { parseFiltrosResultados } from "@/lib/metricas/resultados/filtros";
import { describe, expect, it } from "vitest";

const agora = new Date("2026-10-24T07:00:00.000Z");
const fuso = "America/Fortaleza";
const virada = "05:00:00";

describe("parseFiltrosResultados", () => {
  it("inclui hoje nos sete dias e respeita a virada", () => {
    expect(
      parseFiltrosResultados({ periodo: "7d" }, agora, fuso, virada)
    ).toMatchObject({
      inicio: "2026-10-17",
      fim: "2026-10-23",
      quantidadeDias: 7,
    });
  });

  it("recusa intervalo invertido, malformado ou acima de 90 dias", () => {
    for (const entrada of [
      { periodo: "escolher", inicio: "2026-10-10", fim: "2026-10-09" },
      { periodo: "escolher", inicio: "10/10/2026", fim: "2026-10-12" },
      { periodo: "escolher", inicio: "2026-02-30", fim: "2026-03-01" },
      { periodo: "escolher", inicio: "2026-01-01", fim: "2026-04-01" },
    ]) {
      expect(parseFiltrosResultados(entrada, agora, fuso, virada).atalho).toBe(
        "7d"
      );
    }
  });

  it("aceita 90 dias inclusivos e monta somente a query canônica", () => {
    const filtros = parseFiltrosResultados(
      {
        aba: "equipe",
        periodo: "escolher",
        inicio: "2026-07-26",
        fim: "2026-10-23",
        comparacao: "semana",
        ignorado: "nao-passa",
      },
      agora,
      fuso,
      virada
    );

    expect(filtros).toMatchObject({
      aba: "equipe",
      comparacao: "semana",
      atalho: "escolher",
      inicio: "2026-07-26",
      fim: "2026-10-23",
      quantidadeDias: 90,
    });
    expect(filtros.query.toString()).toBe(
      "aba=equipe&periodo=escolher&inicio=2026-07-26&fim=2026-10-23&comparacao=semana"
    );
  });

  it("normaliza valores inválidos e repetidos para os filtros padrão", () => {
    const filtros = parseFiltrosResultados(
      {
        aba: ["vendas", "descontos"],
        periodo: ["hoje", "mes"],
        comparacao: "invalida",
      },
      agora,
      fuso,
      virada
    );

    expect(filtros).toMatchObject({
      aba: "vendas",
      comparacao: "anterior",
      atalho: "7d",
      inicio: "2026-10-17",
      fim: "2026-10-23",
    });
    expect(filtros.query.toString()).toBe(
      "aba=vendas&periodo=7d&comparacao=anterior"
    );
  });
});
