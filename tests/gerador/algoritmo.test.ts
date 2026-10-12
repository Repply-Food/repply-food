import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AmbienteGerador,
  type Config,
  Gerador,
  Mundo,
  enviarJanela,
  montarEnvelope,
  validarGerado,
} from "../../scripts/gerador-dados-ficticios";

const config: Config = {
  url: "http://teste.local/receber-envio",
  token: "teste",
  historicoDias: 1,
  intervaloSegundos: 20,
  pararApos: 0,
  dryRun: false,
};

function ambienteComIntervalo(
  respostas: number[],
  inicio = new Date(2026, 9, 10, 9).getTime()
): {
  ambiente: AmbienteGerador;
  tentativas: Array<{ janela: string; em: number }>;
  avancar(ms: number): void;
} {
  let agora = inicio;
  const tentativas: Array<{ janela: string; em: number }> = [];
  return {
    ambiente: {
      agora: () => new Date(agora),
      aguardar: async (ms) => {
        agora += ms;
      },
      enviar: async (envelope) => {
        const anterior = tentativas.at(-1);
        if (anterior && agora - anterior.em < 20_000) {
          throw new Error("tentativa antes de 20 s");
        }
        tentativas.push({
          janela: `${envelope.janela.desde}..${envelope.janela.ate}`,
          em: agora,
        });
        return {
          status: respostas.shift() ?? 200,
          corpo: { janela_confirmada: envelope.janela },
        };
      },
    },
    tentativas,
    avancar: (ms) => {
      agora += ms;
    },
  };
}

describe("gerador", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("aguarda 20 segundos antes de cada tentativa, inclusive as metades após 413", async () => {
    const { ambiente, tentativas } = ambienteComIntervalo([413, 200, 200]);

    const resultado = await enviarJanela(
      config,
      new Mundo(),
      "2026-10-09",
      "2026-10-10",
      ambiente
    );

    expect(resultado.ok).toBe(true);
    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-09..2026-10-10",
      "2026-10-09..2026-10-09",
      "2026-10-10..2026-10-10",
    ]);
    expect(tentativas.map(({ em }) => em)).toEqual([
      new Date(2026, 9, 10, 9).getTime(),
      new Date(2026, 9, 10, 9).getTime() + 20_000,
      new Date(2026, 9, 10, 9).getTime() + 40_000,
    ]);
  });

  it("mantém aberta a conta cujo fechamento calculado ficaria no futuro", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const mundo = new Mundo();
    const referencia = new Date(2026, 9, 10, 12, 0, 0);

    mundo.gerarHistorico(new Date(2026, 9, 10, 9), referencia);
    const envelope = montarEnvelope(
      "2026-10-10",
      "2026-10-10",
      mundo.entradasJanela("2026-10-10", "2026-10-10")
    );

    expect(
      envelope.entradas.every(
        (entrada) =>
          entrada.DataEntrada === "2026-10-10" &&
          entrada.HoraEntrada <= "12:00:00"
      )
    ).toBe(true);
    expect(
      envelope.entradas.every(
        (entrada) =>
          entrada.DataSaida === null ||
          (entrada.HoraSaida !== null && entrada.HoraSaida <= "12:00:00")
      )
    ).toBe(true);
    expect(
      envelope.entradas.some(
        (entrada) => entrada.DataSaida === null && entrada.Pago === "Não"
      )
    ).toBe(true);
  });

  it("mantém a fórmula monetária exata em centavos no envelope canônico", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.2);
    const mundo = new Mundo();
    mundo.gerarHistorico(
      new Date(2026, 9, 9),
      new Date(2026, 9, 9, 23, 59, 59)
    );
    const envelope = montarEnvelope(
      "2026-10-09",
      "2026-10-09",
      mundo.entradasJanela("2026-10-09", "2026-10-09")
    );

    validarGerado(envelope);
    for (const entrada of envelope.entradas) {
      expect(entrada.ValorConsumido).toBeCloseTo(
        entrada.ValorItens -
          entrada.ValorDescontos +
          entrada.ValorAcrescimos +
          entrada.TaxaServico +
          entrada.Complemento,
        2
      );
    }
  });

  it("repete a janela diária pendente depois de falha, mesmo no dia seguinte", async () => {
    const { ambiente, tentativas, avancar } = ambienteComIntervalo(
      [500, 200],
      new Date(2026, 9, 10, 7).getTime()
    );
    const gerador = new Gerador(config, new Mundo(), ambiente);

    await gerador.executarCiclo();
    avancar(24 * 60 * 60 * 1000);
    await gerador.executarCiclo();

    expect(tentativas[0]?.janela).toBe(tentativas[1]?.janela);
  });
});
