import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Config,
  Mundo,
  enviarJanela,
  sortearAbertura,
} from "../../scripts/gerador-dados-ficticios";

const config: Config = {
  url: "http://teste.local/receber-envio",
  token: "teste",
  historicoDias: 1,
  intervaloSegundos: 0,
  pararApos: 0,
  dryRun: false,
};

describe("gerador", () => {
  afterEach(() => vi.restoreAllMocks());

  it("divide 413 de dois dias em duas janelas menores sequenciais", async () => {
    const janelas: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const corpo = JSON.parse(String(init.body)) as {
        janela: { desde: string; ate: string };
      };
      janelas.push(`${corpo.janela.desde}..${corpo.janela.ate}`);
      const status = janelas.length === 1 ? 413 : 200;
      return new Response(JSON.stringify({ janela_confirmada: corpo.janela }), {
        status,
      });
    });
    const resultado = await enviarJanela(
      config,
      new Mundo(),
      "2026-10-09",
      "2026-10-10"
    );
    expect(resultado.ok).toBe(true);
    expect(janelas).toEqual([
      "2026-10-09..2026-10-10",
      "2026-10-09..2026-10-09",
      "2026-10-10..2026-10-10",
    ]);
  });

  it("sorteia almoço e jantar a partir do início do dia", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const diaComHora = new Date(2026, 9, 10, 18, 0, 0);
    expect(sortearAbertura(diaComHora, "almoço").getHours()).toBe(12);
    expect(sortearAbertura(diaComHora, "jantar").getHours()).toBe(22);
  });
});
