// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fragmentarV2 } from "../../scripts/scc/fragmentar-v2";
import { envioSccV2Schema } from "../../supabase/functions/_shared/scc/schemas";
import { fixtures } from "./fixtures-v2";

describe("fragmentação do smoke v2", () => {
  it("preserva 501 registros em duas páginas v2 sem ação de publicação", () => {
    const modelo = fixtures[2];
    const dados = Array.from({ length: 501 }, (_, i) => ({
      ...modelo.dados[0],
      ordinal: i + 1,
    }));
    const paginas = fragmentarV2({ ...modelo, dados });
    expect(paginas.map((pagina) => pagina.dados.length)).toEqual([500, 1]);
    expect(paginas.flatMap((pagina): unknown[] => pagina.dados)).toEqual(dados);
    expect(
      paginas.every((pagina) => envioSccV2Schema.safeParse(pagina).success)
    ).toBe(true);
    expect(paginas.every((pagina) => !("acao" in pagina))).toBe(true);
    expect(paginas.map((pagina) => pagina.pagina)).toEqual([
      { numero: 1, total: 2 },
      { numero: 2, total: 2 },
    ]);
  });
  it("recusa um registro acima do limite de bytes", () => {
    const modelo = fixtures[0];
    expect(() =>
      fragmentarV2({
        ...modelo,
        dados: [{ ...modelo.dados[0], Reabilitado: "x".repeat(1_048_576) }],
      })
    ).toThrow(/limite/i);
  });
  it("gera uma página vazia para fotografia vazia", () => {
    const paginas = fragmentarV2({ ...fixtures[2], dados: [] });
    expect(paginas).toHaveLength(1);
    expect(paginas[0]).toMatchObject({
      dados: [],
      total_registros: 0,
      pagina: { numero: 1, total: 1 },
    });
  });
});
