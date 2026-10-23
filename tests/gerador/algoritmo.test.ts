import { execFileSync } from "node:child_process";
import Decimal from "decimal.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Envelope } from "../../lib/validators/recepcao";
import {
  type AmbienteGerador,
  type Config,
  Gerador,
  Mundo,
  calcularValoresMonetarios,
  carregarDe,
  criarControleRitmo,
  dataCivilNoFuso,
  enviarJanela,
  lerConfig,
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
  fusoHorario: "America/Fortaleza",
};
const fetchOriginal = globalThis.fetch;

function ambienteComIntervalo(
  respostas: Array<number | { status: number; corpo: object }>,
  inicio = Date.UTC(2026, 9, 10, 9)
): {
  ambiente: AmbienteGerador;
  tentativas: Array<{ janela: string; em: number; envelope: Envelope }>;
  avancar(ms: number): void;
} {
  let agora = inicio;
  const tentativas: Array<{ janela: string; em: number; envelope: Envelope }> =
    [];
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
          envelope: JSON.parse(JSON.stringify(envelope)) as Envelope,
        });
        const resposta = respostas.shift();
        if (resposta === undefined) throw new Error("tentativa não prevista");
        return typeof resposta === "number"
          ? { status: resposta, corpo: { janela_confirmada: envelope.janela } }
          : resposta;
      },
    },
    tentativas,
    avancar: (ms) => {
      agora += ms;
    },
  };
}

function sortearSequencia(valores: number[], restante = 0): void {
  let indice = 0;
  vi.spyOn(Math, "random").mockImplementation(
    () => valores[indice++] ?? restante
  );
}

const camposMonetarios = [
  "ValorItens",
  "ValorDescontos",
  "ValorAcrescimos",
  "TaxaServico",
  "Complemento",
  "ValorConsumido",
] as const;

function dinheiroDoPayload(entrada: Envelope["entradas"][number]): string[] {
  return camposMonetarios.map((campo) => {
    const decimal = new Decimal(entrada[campo]);
    expect(decimal.decimalPlaces()).toBeLessThanOrEqual(2);
    return decimal.toFixed(2);
  });
}

describe("gerador", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
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
      Date.UTC(2026, 9, 10, 9),
      Date.UTC(2026, 9, 10, 9) + 20_000,
      Date.UTC(2026, 9, 10, 9) + 40_000,
    ]);
  });

  it("mantém o intervalo entre janelas consecutivas da carga", async () => {
    const { ambiente, tentativas } = ambienteComIntervalo([200, 200]);

    await carregarDe(config, new Mundo(), "2026-10-01", "2026-10-08", ambiente);

    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-01..2026-10-07",
      "2026-10-08..2026-10-08",
    ]);
    const [primeira, segunda] = tentativas;
    if (!primeira || !segunda) throw new Error("faltaram tentativas da carga");
    expect(segunda.em - primeira.em).toBe(20_000);
  });

  it("não divide nem repete uma janela de um único dia recusada por 413", async () => {
    const { ambiente, tentativas } = ambienteComIntervalo([413]);
    const resultado = await enviarJanela(
      config,
      new Mundo(),
      "2026-10-10",
      "2026-10-10",
      ambiente
    );
    expect(resultado.ok).toBe(false);
    expect(resultado.confirmada).toBeNull();
    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-10..2026-10-10",
    ]);
  });

  it("interrompe a divisão quando a primeira metade falha", async () => {
    const { ambiente, tentativas } = ambienteComIntervalo([413, 500]);
    const resultado = await enviarJanela(
      config,
      new Mundo(),
      "2026-10-09",
      "2026-10-10",
      ambiente
    );
    expect(resultado.ok).toBe(false);
    expect(resultado.confirmada).toBeNull();
    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-09..2026-10-10",
      "2026-10-09..2026-10-09",
    ]);
  });

  it.each([
    {
      nome: "manhã, almoço antes da referência e fechamento depois",
      inicio: "2026-10-10T09:00:00Z",
      referencia: "2026-10-10T11:40:00Z",
      sorteios: [0, 0.9, 0],
      cod: 100000,
      abertura: "2026-10-10T11:30:00",
      esquecida: 100001,
      aberturaEsquecida: "2026-10-10T11:30:00",
      total: 2,
    },
    {
      nome: "noite, jantar fecha depois da referência",
      inicio: "2026-10-10T09:00:00Z",
      referencia: "2026-10-10T22:40:00Z",
      sorteios: [],
      cod: 100032,
      abertura: "2026-10-10T22:30:00",
      esquecida: 100079,
      aberturaEsquecida: "2026-10-10T11:30:00",
      fechamentoEsquecida: "2026-10-10T17:30:00",
      total: 80,
    },
    {
      nome: "histórico anterior à noite, jantar do dia atual ainda aberto",
      inicio: "2026-10-09T09:00:00Z",
      referencia: "2026-10-10T22:40:00Z",
      sorteios: [],
      cod: 100104,
      abertura: "2026-10-10T22:30:00",
      esquecida: 100071,
      aberturaEsquecida: "2026-10-09T11:30:00",
      fechamentoEsquecida: "2026-10-09T17:30:00",
      total: 152,
    },
    {
      nome: "madrugada/virada, jantar da véspera ainda sem fechamento",
      inicio: "2026-10-10T09:00:00Z",
      referencia: "2026-10-11T00:10:00Z",
      // Primeiro jantar: abre 23:00, duração 109 min (fecha 00:49).
      sorteios: [0, ...Array<number>(32 * 16).fill(0), 0, 2 / 3, 0.99],
      cod: 100032,
      abertura: "2026-10-10T23:00:00",
      esquecida: 100079,
      aberturaEsquecida: "2026-10-10T11:30:00",
      fechamentoEsquecida: "2026-10-10T17:30:00",
      total: 80,
    },
    {
      nome: "após a virada civil, fechamento da véspera pago na madrugada",
      inicio: "2026-10-10T09:00:00Z",
      referencia: "2026-10-11T01:10:00Z",
      sorteios: [0, ...Array<number>(32 * 16).fill(0), 0, 2 / 3, 0.99],
      cod: 100032,
      abertura: "2026-10-10T23:00:00",
      fechamento: "2026-10-11T00:49:00",
      esquecida: 100079,
      aberturaEsquecida: "2026-10-10T11:30:00",
      fechamentoEsquecida: "2026-10-10T17:30:00",
      total: 80,
    },
  ])("preserva contas específicas: $nome", (caso) => {
    sortearSequencia(caso.sorteios);
    const mundo = new Mundo();
    const referencia = new Date(caso.referencia);
    mundo.gerarHistorico(new Date(caso.inicio), referencia);
    const envelope = montarEnvelope(
      caso.inicio.slice(0, 10),
      caso.referencia.slice(0, 10),
      mundo.entradasJanela(
        caso.inicio.slice(0, 10),
        caso.referencia.slice(0, 10)
      ),
      referencia
    );
    expect(envelope.entradas).toHaveLength(caso.total);
    for (const [cod, abertura] of [
      [caso.cod, caso.abertura],
      [caso.esquecida, caso.aberturaEsquecida],
    ] as const) {
      const fechamento =
        cod === caso.cod
          ? "fechamento" in caso
            ? caso.fechamento
            : null
          : "fechamentoEsquecida" in caso
            ? caso.fechamentoEsquecida
            : null;
      expect(
        envelope.entradas.find((entrada) => entrada.codEntrada === cod)
      ).toMatchObject({
        DataEntrada: abertura.slice(0, 10),
        HoraEntrada: abertura.slice(11),
        DataSaida: fechamento?.slice(0, 10) ?? null,
        HoraSaida: fechamento?.slice(11) ?? null,
        Pago: fechamento ? "Sim" : "Não",
      });
    }
    for (const entrada of envelope.entradas) {
      const abertura = `${entrada.DataEntrada}T${entrada.HoraEntrada}`;
      expect(abertura <= caso.referencia.slice(0, 19)).toBe(true);
      if (entrada.DataSaida === null) {
        expect(entrada.HoraSaida).toBeNull();
        expect(entrada.Pago).toBe("Não");
      } else {
        expect(entrada.HoraSaida).not.toBeNull();
        const saida = `${entrada.DataSaida}T${entrada.HoraSaida}`;
        expect(saida >= abertura && saida <= caso.referencia.slice(0, 19)).toBe(
          true
        );
        expect(entrada.Pago).toBe("Sim");
      }
    }
    validarGerado(JSON.parse(JSON.stringify(envelope)) as Envelope);
  });

  it("não deixa conta aberta por dias: a esquecida fecha em horas e não se acumula no histórico", () => {
    // random=0 força uma conta esquecida todo dia (0 < 0.35), abrindo 11:30.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const mundo = new Mundo();
    const hoje = new Date("2026-10-22T14:00:00Z");
    mundo.gerarHistorico(new Date("2026-10-01T00:00:00Z"), hoje);
    const abertas = mundo
      .entradasJanela("2026-10-01", "2026-10-22")
      .filter((entrada) => entrada.DataSaida === null);
    // A do próprio dia ainda está aberta (11:30 + 6h = 17:30 > 14:00).
    expect(abertas.length).toBeGreaterThan(0);
    for (const entrada of abertas) {
      const aberturaMs = new Date(
        `${entrada.DataEntrada}T${entrada.HoraEntrada}Z`
      ).getTime();
      const horasAberta = (hoje.getTime() - aberturaMs) / 3_600_000;
      expect(horasAberta).toBeLessThan(24);
    }
  });

  it("semeia contas esquecidas abertas há horas (4 a 11), para a demo ter o que mostrar", () => {
    const mundo = new Mundo();
    const hoje = new Date("2026-10-22T20:00:00Z");
    mundo.semearContasEsquecidasAbertas(hoje, 4);
    const abertas = mundo
      .entradasJanela("2026-10-22", "2026-10-22")
      .filter((entrada) => entrada.DataSaida === null);
    expect(abertas).toHaveLength(4);
    for (const entrada of abertas) {
      const horasAberta =
        (hoje.getTime() -
          new Date(
            `${entrada.DataEntrada}T${entrada.HoraEntrada}Z`
          ).getTime()) /
        3_600_000;
      expect(horasAberta).toBeGreaterThanOrEqual(4);
      expect(horasAberta).toBeLessThanOrEqual(11);
      expect(entrada.Pago).toBe("Não");
    }
  });

  it("gera desconto, acréscimo, taxa e complemento não zero no JSON canônico", () => {
    // Um ocupante, ticket 28.47, desconto 1.47, acréscimo 0.28,
    // taxa 2.70, complemento 4.11 => consumido 34.09.
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const mundo = new Mundo();
    mundo.gerarHistorico(
      new Date("2026-10-09T00:00:00Z"),
      new Date("2026-10-09T23:59:59Z")
    );
    const envelope = montarEnvelope(
      "2026-10-09",
      "2026-10-09",
      mundo.entradasJanela("2026-10-09", "2026-10-09"),
      new Date("2026-10-09T23:59:59Z")
    );

    const json = JSON.parse(JSON.stringify(envelope)) as Envelope;
    validarGerado(json);
    expect(json.entradas).toHaveLength(72);
    for (const entrada of json.entradas) {
      expect(dinheiroDoPayload(entrada)).toEqual([
        "28.47",
        "1.47",
        "0.28",
        "2.70",
        "4.11",
        "34.09",
      ]);
    }
  });

  it("amplia a janela pendente ao virar o dia, inclui a conta fechada no novo dia e só confirma no sucesso", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const mundo = new Mundo();
    mundo.gerarHistorico(
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-10-01T23:59:59Z")
    );
    vi.mocked(Math.random).mockReturnValue(1 - Number.EPSILON);
    const { ambiente, tentativas, avancar } = ambienteComIntervalo(
      [500, 500, 200, 200],
      Date.UTC(2026, 9, 10, 7)
    );
    const gerador = new Gerador(config, mundo, ambiente, "2026-09-29");
    expect(await gerador.executarCiclo()).toMatchObject({
      ok: false,
      confirmada: null,
    });
    avancar(28 * 60 * 60 * 1000);
    vi.mocked(Math.random).mockReturnValue(0);
    expect(await gerador.executarCiclo()).toMatchObject({
      ok: false,
      confirmada: null,
    });
    avancar(31 * 60 * 1000);
    expect(await gerador.executarCiclo()).toMatchObject({
      ok: true,
      confirmada: "2026-10-11",
    });
    // A conta aberta e fechada já dentro do novo dia (Oct 11) entra na janela
    // ampliada. (A varredura a abre 11:00 e a fecha 11:31 no ciclo seguinte.)
    expect(
      tentativas[2]?.envelope.entradas.find(
        (entrada) => entrada.codEntrada === 100050
      )
    ).toMatchObject({
      DataEntrada: "2026-10-11",
      HoraEntrada: "11:00:00",
      DataSaida: "2026-10-11",
      HoraSaida: "11:31:00",
      Pago: "Sim",
    });
    expect(await gerador.executarCiclo()).toMatchObject({
      ok: true,
      confirmada: "2026-10-11",
    });
    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-03..2026-10-10",
      "2026-10-03..2026-10-11",
      "2026-10-03..2026-10-11",
      "2026-10-10..2026-10-11",
    ]);
  });

  it("mantém o ritmo entre a carga inicial e o primeiro ciclo", async () => {
    const configCurta = { ...config, intervaloSegundos: 1 };
    const { ambiente, tentativas, avancar } = ambienteComIntervalo([200, 200]);
    const ritmo = criarControleRitmo();
    const mundo = new Mundo();
    await carregarDe(
      configCurta,
      mundo,
      "2026-10-10",
      "2026-10-10",
      ambiente,
      ritmo,
      true
    );
    const gerador = new Gerador(
      configCurta,
      mundo,
      ambiente,
      "2026-10-10",
      ritmo
    );
    avancar(1_000);
    await gerador.executarCiclo();
    const [carga, ciclo] = tentativas;
    if (!carga || !ciclo) throw new Error("faltaram tentativas");
    expect(ciclo.em - carga.em).toBeGreaterThanOrEqual(20_000);
  });

  it("reenvia desde a data pedida e aguarda 20 segundos após falha", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ambiente, tentativas } = ambienteComIntervalo([
      {
        status: 200,
        corpo: {
          janela_confirmada: { ate: "2026-10-10" },
          reenviar_desde: "2026-10-09",
        },
      },
      500,
      200,
      200,
    ]);
    const gerador = new Gerador(config, new Mundo(), ambiente, "2026-10-09");
    expect(await gerador.executarCiclo()).toMatchObject({
      ok: true,
      confirmada: "2026-10-10",
    });
    await gerador.executarCiclo();
    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-03..2026-10-10",
      "2026-10-09..2026-10-10",
      "2026-10-09..2026-10-10",
      "2026-10-09..2026-10-10",
    ]);
    expect(tentativas.map(({ em }) => em - Date.UTC(2026, 9, 10, 9))).toEqual([
      0, 20_000, 40_000, 60_000,
    ]);
  });

  it("repete a janela interrompida da carga antes de avançar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ambiente, tentativas } = ambienteComIntervalo([200, 500, 200, 200]);
    expect(
      await carregarDe(
        config,
        new Mundo(),
        "2026-10-01",
        "2026-10-20",
        ambiente
      )
    ).toBe("2026-10-20");
    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-01..2026-10-07",
      "2026-10-08..2026-10-14",
      "2026-10-08..2026-10-14",
      "2026-10-15..2026-10-20",
    ]);
    expect(tentativas.map(({ em }) => em - Date.UTC(2026, 9, 10, 9))).toEqual([
      0, 20_000, 40_000, 60_000,
    ]);
  });

  it("obedece reenviar_desde também durante a carga", async () => {
    const { ambiente, tentativas } = ambienteComIntervalo([
      200,
      {
        status: 200,
        corpo: {
          janela_confirmada: { desde: "2026-10-08", ate: "2026-10-10" },
          reenviar_desde: "2026-10-01",
        },
      },
      200,
      200,
    ]);
    expect(
      await carregarDe(
        config,
        new Mundo(),
        "2026-10-01",
        "2026-10-10",
        ambiente
      )
    ).toBe("2026-10-10");
    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-01..2026-10-07",
      "2026-10-08..2026-10-10",
      "2026-10-01..2026-10-07",
      "2026-10-08..2026-10-10",
    ]);
    expect(tentativas.map(({ em }) => em - Date.UTC(2026, 9, 10, 9))).toEqual([
      0, 20_000, 40_000, 60_000,
    ]);
  });

  it("retry curto não confirma falha e respeita 20 s desde a tentativa anterior", async () => {
    const { ambiente, tentativas, avancar } = ambienteComIntervalo(
      [500, 200, 200],
      Date.UTC(2026, 9, 10, 5)
    );
    const gerador = new Gerador(
      { ...config, intervaloSegundos: 1 },
      new Mundo(),
      ambiente,
      "2026-10-01"
    );
    expect(await gerador.executarCiclo()).toMatchObject({
      ok: false,
      confirmada: null,
    });
    avancar(1_000);
    expect(await gerador.executarCiclo()).toMatchObject({
      ok: true,
      confirmada: "2026-10-10",
    });
    await gerador.executarCiclo();
    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-01..2026-10-10",
      "2026-10-01..2026-10-10",
      "2026-10-09..2026-10-10",
    ]);
    expect(tentativas.map(({ em }) => em - Date.UTC(2026, 9, 10, 5))).toEqual([
      0, 20_000, 40_000,
    ]);
  });

  it("une a pendência anterior às novas datas da varredura após 6h", async () => {
    const { ambiente, tentativas, avancar } = ambienteComIntervalo(
      [500, 200, 200],
      Date.UTC(2026, 9, 10, 5)
    );
    const gerador = new Gerador(config, new Mundo(), ambiente, "2026-10-09");
    expect(await gerador.executarCiclo()).toMatchObject({
      ok: false,
      confirmada: null,
    });
    avancar(25 * 60 * 60 * 1000);
    expect(await gerador.executarCiclo()).toMatchObject({
      ok: true,
      confirmada: "2026-10-11",
    });
    await gerador.executarCiclo();
    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-09..2026-10-10",
      "2026-10-04..2026-10-11",
      "2026-10-10..2026-10-11",
    ]);
  });

  it("amplia até o novo dia quando a falha de reenvio atravessa meia-noite", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ambiente, tentativas, avancar } = ambienteComIntervalo(
      [
        {
          status: 200,
          corpo: {
            janela_confirmada: { desde: "2026-10-03", ate: "2026-10-10" },
            reenviar_desde: "2026-10-09",
          },
        },
        500,
        200,
        200,
      ],
      Date.UTC(2026, 9, 10, 23, 59)
    );
    const enviar = ambiente.enviar;
    ambiente.enviar = async (envelope, configEnvio) => {
      const resposta = await enviar(envelope, configEnvio);
      if (resposta.status === 500) avancar(60_000);
      return resposta;
    };
    const gerador = new Gerador(config, new Mundo(), ambiente, "2026-10-09");
    await gerador.executarCiclo();
    expect(await gerador.executarCiclo()).toMatchObject({
      ok: true,
      confirmada: "2026-10-11",
    });
    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-03..2026-10-10",
      "2026-10-09..2026-10-10",
      "2026-10-09..2026-10-11",
      "2026-10-10..2026-10-11",
    ]);
    expect(
      tentativas.map(({ em }) => em - Date.UTC(2026, 9, 10, 23, 59))
    ).toEqual([0, 20_000, 100_000, 120_000]);
  });

  it.each(["UTC", "America/Los_Angeles", "Asia/Tokyo"])(
    "gera o mesmo payload civil com host em %s",
    (TZ) => {
      const resultado = execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
      import { dataCivilNoFuso, Mundo, montarEnvelope, validarGerado } from './scripts/gerador-dados-ficticios.ts';
      Math.random = () => 0;
      const referencia = dataCivilNoFuso(new Date('2026-10-11T03:10:00Z'), 'America/Fortaleza');
      const mundo = new Mundo();
      mundo.gerarHistorico(new Date('2026-10-10T00:00:00Z'), referencia);
      const envelope = montarEnvelope('2026-10-10', '2026-10-11', mundo.entradasJanela('2026-10-10', '2026-10-11'), referencia);
      validarGerado(envelope);
      console.log(JSON.stringify({ enviado: envelope.enviado_em, total: envelope.entradas.length, primeira: envelope.entradas[0] }));
    `,
        ],
        { env: { ...process.env, TZ }, encoding: "utf8", timeout: 10_000 }
      );
      expect(JSON.parse(resultado)).toMatchObject({
        enviado: "2026-10-11T00:10:00",
        total: 80,
        primeira: {
          codEntrada: 100000,
          DataEntrada: "2026-10-10",
          HoraEntrada: "12:00:00",
          DataSaida: "2026-10-10",
          HoraSaida: "12:35:00",
        },
      });
    }
  );

  it("inclui o novo dia no reenvio quando o 200 inicial demora 20 s desde 23:59:50", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const inicio = Date.UTC(2026, 9, 10, 23, 59, 50);
    const { ambiente, tentativas, avancar } = ambienteComIntervalo(
      [
        {
          status: 200,
          corpo: {
            janela_confirmada: { desde: "2026-10-03", ate: "2026-10-10" },
            reenviar_desde: "2026-10-09",
          },
        },
        500,
        200,
      ],
      inicio
    );
    const enviar = ambiente.enviar;
    ambiente.enviar = async (envelope, configEnvio) => {
      const resposta = await enviar(envelope, configEnvio);
      if (tentativas.length === 1) avancar(20_000);
      return resposta;
    };
    const gerador = new Gerador(config, new Mundo(), ambiente, "2026-10-09");
    const resultado = await gerador.executarCiclo();
    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-03..2026-10-10",
      "2026-10-09..2026-10-11",
      "2026-10-09..2026-10-11",
    ]);
    expect(tentativas.map(({ em }) => em - inicio)).toEqual([
      0, 20_000, 40_000,
    ]);
    expect(resultado).toMatchObject({ ok: true, confirmada: "2026-10-11" });
  });

  it("inclui o novo dia no primeiro reenvio após espera do ritmo atravessar meia-noite", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const inicio = Date.UTC(2026, 9, 10, 23, 59, 50);
    const { ambiente, tentativas } = ambienteComIntervalo(
      [
        {
          status: 200,
          corpo: {
            janela_confirmada: { desde: "2026-10-03", ate: "2026-10-10" },
            reenviar_desde: "2026-10-09",
          },
        },
        500,
        200,
      ],
      inicio
    );
    const gerador = new Gerador(config, new Mundo(), ambiente, "2026-10-09");
    const resultado = await gerador.executarCiclo();
    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-03..2026-10-10",
      "2026-10-09..2026-10-11",
      "2026-10-09..2026-10-11",
    ]);
    expect(tentativas.map(({ em }) => em - inicio)).toEqual([
      0, 20_000, 40_000,
    ]);
    expect(resultado).toMatchObject({ ok: true, confirmada: "2026-10-11" });
  });

  it("monta o ciclo pendente após o ritmo, incluindo a virada mesmo sem pedido de reenvio", async () => {
    const inicio = Date.UTC(2026, 9, 10, 23, 59, 50);
    const { ambiente, tentativas } = ambienteComIntervalo([500, 200], inicio);
    const ritmo = criarControleRitmo();
    ritmo.ultimaTentativaEm = inicio;
    const gerador = new Gerador(
      config,
      new Mundo(),
      ambiente,
      "2026-10-09",
      ritmo
    );
    expect(await gerador.executarCiclo()).toMatchObject({
      ok: false,
      confirmada: null,
    });
    expect(await gerador.executarCiclo()).toMatchObject({
      ok: true,
      confirmada: "2026-10-11",
    });
    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-03..2026-10-11",
      "2026-10-03..2026-10-11",
    ]);
    expect(tentativas.map(({ em }) => em - inicio)).toEqual([20_000, 40_000]);
    expect(tentativas[0]?.envelope.enviado_em).toBe("2026-10-11T00:00:10");
  });

  it("carga explicitamente até hoje acompanha o ritmo sem estender a janela de sete dias", async () => {
    const inicio = Date.UTC(2026, 9, 10, 23, 59, 50);
    const { ambiente, tentativas } = ambienteComIntervalo([200, 200], inicio);
    const ritmo = criarControleRitmo();
    ritmo.ultimaTentativaEm = inicio;
    expect(
      await carregarDe(
        config,
        new Mundo(),
        "2026-10-04",
        "2026-10-10",
        ambiente,
        ritmo,
        true
      )
    ).toBe("2026-10-11");
    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-04..2026-10-10",
      "2026-10-11..2026-10-11",
    ]);
    expect(tentativas.map(({ em }) => em - inicio)).toEqual([20_000, 40_000]);
  });

  it("período explicitamente fixo permanece fixo mesmo quando ate era hoje antes da falha", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const inicio = Date.UTC(2026, 9, 10, 23, 59, 50);
    const { ambiente, tentativas, avancar } = ambienteComIntervalo(
      [500, 200],
      inicio
    );
    const enviar = ambiente.enviar;
    ambiente.enviar = async (envelope, configEnvio) => {
      const resposta = await enviar(envelope, configEnvio);
      if (resposta.status === 500) avancar(20_000);
      return resposta;
    };
    expect(
      await carregarDe(
        config,
        new Mundo(),
        "2026-10-09",
        "2026-10-10",
        ambiente,
        criarControleRitmo(),
        false
      )
    ).toBe("2026-10-10");
    expect(tentativas.map(({ janela }) => janela)).toEqual([
      "2026-10-09..2026-10-10",
      "2026-10-09..2026-10-10",
    ]);
    expect(tentativas.map(({ em }) => em - inicio)).toEqual([0, 40_000]);
  });

  it("exige fuso IANA explícito no modo real e declara Fortaleza no dry-run", () => {
    vi.stubEnv("SCC_FUSO", undefined);
    expect(() => lerConfig([])).toThrow("Defina --fuso");
    expect(lerConfig(["--dry-run"]).fusoHorario).toBe("America/Fortaleza");
    expect(lerConfig(["--fuso", "America/Sao_Paulo"]).fusoHorario).toBe(
      "America/Sao_Paulo"
    );
    vi.stubEnv("SCC_FUSO", "Asia/Tokyo");
    expect(lerConfig([]).fusoHorario).toBe("Asia/Tokyo");
    expect(() => lerConfig(["--fuso", "Fuso/Inexistente"])).toThrow(
      "Fuso IANA inválido"
    );
  });

  it("o CLI dry-run declara o fuso fictício utilizado, sem token ou envio", () => {
    const saida = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/gerador-dados-ficticios.ts",
        "--dry-run",
        "--historico-dias",
        "7",
      ],
      {
        env: { ...process.env, SCC_FUSO: undefined, SCC_TOKEN: undefined },
        encoding: "utf8",
        timeout: 10_000,
      }
    );
    expect(saida).toContain("dry-run OK");
    expect(saida).toContain("fuso America/Fortaleza");
  });

  it.each([
    {
      ticket: "0.10",
      esperado: ["0.10", "0.01", "0.00", "0.01", "4.11", "4.21"],
    },
    {
      ticket: "0.20",
      esperado: ["0.20", "0.01", "0.00", "0.02", "4.11", "4.32"],
    },
    {
      ticket: "0.30",
      esperado: ["0.30", "0.02", "0.00", "0.03", "4.11", "4.42"],
    },
    {
      ticket: "1.005",
      esperado: ["1.01", "0.05", "0.01", "0.10", "4.11", "5.18"],
    },
    {
      ticket: "2.675",
      esperado: ["2.68", "0.14", "0.03", "0.25", "4.11", "6.93"],
    },
  ])(
    "leva ticket $ticket em Decimal por Mundo→JSON canônico",
    ({ ticket, esperado }) => {
      vi.spyOn(Math, "random").mockReturnValue(0.01);
      // Double somente do ticket antes de arredondar; parcelas e total são reais.
      const mundo = new Mundo(() => new Decimal(ticket));
      const referencia = new Date("2026-10-09T23:59:59Z");
      mundo.gerarHistorico(new Date("2026-10-09T00:00:00Z"), referencia);
      const internas = mundo.entradasJanela("2026-10-09", "2026-10-09");
      expect(internas).toHaveLength(72);
      for (const entrada of internas) {
        for (const campo of camposMonetarios)
          expect(entrada[campo]).toBeInstanceOf(Decimal);
      }
      const json = JSON.parse(
        JSON.stringify(
          montarEnvelope("2026-10-09", "2026-10-09", internas, referencia)
        )
      ) as Envelope;
      validarGerado(json);
      expect(json.entradas).toHaveLength(72);
      for (const entrada of json.entradas)
        expect(dinheiroDoPayload(entrada)).toEqual(esperado);
    }
  );

  it("usa o fuso configurado, não a hora local do host", () => {
    const instante = new Date("2026-10-10T03:30:00.000Z");
    const civil = dataCivilNoFuso(instante, "America/Fortaleza");
    expect(civil.toISOString()).toBe("2026-10-10T00:30:00.000Z");
  });

  it("o ambiente padrão usa o fuso da configuração também no ciclo importável", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T20:00:00Z"));
    const envelopes: Envelope[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const envelope = JSON.parse(String(init.body)) as Envelope;
      envelopes.push(envelope);
      return new Response(
        JSON.stringify({ janela_confirmada: envelope.janela }),
        { status: 200 }
      );
    });
    const gerador = new Gerador(
      { ...config, fusoHorario: "Asia/Tokyo" },
      new Mundo()
    );
    expect(await gerador.executarCiclo()).toMatchObject({
      ok: true,
      confirmada: "2026-10-11",
    });
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]).toMatchObject({
      enviado_em: "2026-10-11T05:00:00",
      janela: { desde: "2026-10-10", ate: "2026-10-11" },
    });
  });

  it("o salto de horário civil no fuso não antecipa a próxima tentativa HTTP", async () => {
    vi.useFakeTimers();
    const inicio = new Date("2026-03-08T06:59:50Z");
    vi.setSystemTime(inicio);
    const tentativas: number[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const envelope = JSON.parse(String(init.body)) as Envelope;
      tentativas.push(Date.now() - inicio.getTime());
      if (tentativas.length > 1 && (tentativas[1] ?? 0) < 20_000)
        throw new Error("tentativa antes de 20 s");
      return new Response(
        JSON.stringify({ janela_confirmada: envelope.janela }),
        { status: 200 }
      );
    });
    const gerador = new Gerador(
      { ...config, intervaloSegundos: 1, fusoHorario: "America/New_York" },
      new Mundo()
    );
    expect((await gerador.executarCiclo()).ok).toBe(true);
    // Às 07:00Z o relógio civil salta de 01:59:59 para 03:00:00.
    vi.setSystemTime(new Date("2026-03-08T07:00:00Z"));
    const segundo = gerador.executarCiclo();
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await segundo).ok).toBe(true);
    expect(tentativas).toEqual([0, 20_000]);
  });

  it("calcula as seis colunas monetárias com centavos exatos", () => {
    // O caso anterior stubou fetch; afterEach deve ter restaurado o original.
    expect(globalThis.fetch).toBe(fetchOriginal);
    const valores = calcularValoresMonetarios(
      new Decimal("0.10"),
      new Decimal("0.20"),
      new Decimal("0.30"),
      new Decimal("1.005"),
      new Decimal("2.675")
    );
    expect({
      itens: valores.itens.toFixed(2),
      descontos: valores.descontos.toFixed(2),
      acrescimos: valores.acrescimos.toFixed(2),
      taxaServico: valores.taxaServico.toFixed(2),
      complemento: valores.complemento.toFixed(2),
      consumido: valores.consumido.toFixed(2),
    }).toEqual({
      itens: "0.10",
      descontos: "0.20",
      acrescimos: "0.30",
      taxaServico: "1.01",
      complemento: "2.68",
      consumido: "3.89",
    });
  });
});
