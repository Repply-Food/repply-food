// @vitest-environment node
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  entrada,
  envelope,
  limparFixture,
} from "../helpers/supabase-local";

// obterHoje de ponta a ponta contra o banco local: as seis funções `metrica_*`
// pelo PostgREST de verdade. O que este teste pega e o de montar-hoje.test.ts
// não: o formato em que cada coluna chega (numeric vira number, bigint vira
// number, interval vira texto, dinheiro vira texto).
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    criarCliente<Database>(URL_LOCAL, chaveLocal("service_role"), {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
}));

import { obterHoje } from "@/lib/metricas/hoje";

// Mesmo histórico de comparacao-do-dia.test.ts (restauranteA: Fortaleza, virada
// 05:00): 3 sextas anteriores (1.000, 2.000, 3.000) e a sexta de hoje (2.400,
// 10 pessoas), tudo pago entre 12:00 e 14:00. O "agora" é sexta 23/10 21:40.
// Mais uma conta aberta desde as 10:00 de hoje (R$ 110,00 com a taxa) e uma
// meta de R$ 100.000,00 para outubro.
const AGORA = new Date("2026-10-23T21:40:00-03:00");

function contaDaSexta(
  codEntrada: number,
  dia: string,
  valorConsumido: number,
  ocupantes: number
) {
  return entrada(codEntrada, {
    DataEntrada: dia,
    HoraEntrada: "12:00:00",
    DataSaida: dia,
    HoraSaida: "14:00:00",
    ValorItens: valorConsumido,
    TaxaServico: 0,
    ValorConsumido: valorConsumido,
    NumeroOcupantes: ocupantes,
    CodGarcon: 27,
    codOperadorDesab: 99,
  });
}

describe("obterHoje contra o banco local", () => {
  let banco: Client = undefined as never;
  let fixture: Fixture = undefined as never;

  beforeEach(async () => {
    banco = undefined as never;
    fixture = undefined as never;
    banco = await conectarBanco();
    fixture = await criarFixture(banco);

    const entradas = [
      contaDaSexta(1002, "2026-10-02", 1000, 10),
      contaDaSexta(1009, "2026-10-09", 2000, 10),
      contaDaSexta(1016, "2026-10-16", 3000, 10),
      contaDaSexta(1023, "2026-10-23", 2400, 10),
      entrada(9001, {
        DataEntrada: "2026-10-23",
        HoraEntrada: "10:00:00",
        DataSaida: null,
        HoraSaida: null,
        ValorItens: 100,
        TaxaServico: 10,
        ValorConsumido: 110,
        Pago: "Não",
        NumeroOcupantes: 2,
        CodGarcon: 14,
        codCartaoMesa: 7,
      }),
    ];
    await banco.query("select public.processar_envio($1, $2::jsonb)", [
      fixture.restauranteA,
      JSON.stringify(envelope(entradas, "2026-10-01", "2026-10-24")),
    ]);
    await banco.query(
      "insert into public.metas (restaurante_id, mes, valor) values ($1, '2026-10-01', 100000)",
      [fixture.restauranteA]
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AGORA);
  });

  afterEach(async () => {
    vi.useRealTimers();
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      if (banco) await banco.end();
      banco = undefined as never;
      fixture = undefined as never;
    }
  });

  it("junta as seis funções num DadosDoHoje com dinheiro em string e variação em number", async () => {
    const dados = await obterHoje(fixture.restauranteA, "04:00:00");

    expect(dados.faturamento).toMatchObject({
      valor: "2400.00",
      taxaServico: "0.00",
      contasPagas: 1,
      pessoasPagas: 10,
      media: "2000.00",
    });
    expect(typeof dados.faturamento.variacao).toBe("number");
    expect(dados.faturamento.variacao).toBeCloseTo(0.2, 4);

    expect(Number(dados.porPessoa.valor)).toBeCloseTo(240, 2);
    expect(dados.porPessoa.media).toBe("200.00");
    expect(dados.porPessoa.variacao).toBeCloseTo(0.2, 4);

    expect(dados.mesasAbertas).toEqual({
      quantidade: 1,
      valorEmAberto: "110.00",
      pessoasNaCasa: 2,
    });
  });

  it("a curva vem de 30 em 30 min, sem o futuro de hoje e com o dia típico", async () => {
    const { curva } = await obterHoje(fixture.restauranteA, "04:00:00");

    expect(curva).toHaveLength(48);
    expect(curva[0]).toEqual({ minuto: 0, hoje: "0", tipico: "0.00" });
    // 16h40 depois da virada = minuto 1000: a faixa 990 é a última de hoje.
    expect(curva.find((p) => p.minuto === 990)?.hoje).toBe("2400.00");
    expect(curva.find((p) => p.minuto === 1020)?.hoje).toBeNull();
    // O dia típico é a média ponto a ponto (1.000, 2.000 e 3.000) e não tem futuro.
    expect(curva.find((p) => p.minuto === 1410)?.tipico).toBe("2000.00");
  });

  it("devolve as contas esquecidas com o limite da casa que a página passa", async () => {
    const dados = await obterHoje(fixture.restauranteA, "04:00:00");

    expect(dados.contasEsquecidas).toEqual([
      {
        cod: 9001,
        mesa: 7,
        abertaEm: expect.any(String),
        abertaHa: "11:40:00",
        valor: "110.00",
      },
    ]);
    expect(new Date(dados.contasEsquecidas[0]?.abertaEm ?? "").getTime()).toBe(
      new Date("2026-10-23T10:00:00-03:00").getTime()
    );

    // Com um limite maior que a idade da conta, não há esquecida.
    const folgado = await obterHoje(fixture.restauranteA, "12:00:00");
    expect(folgado.contasEsquecidas).toEqual([]);
  });

  it("devolve a meta do mês e a projeção, cada uma como o banco calculou", async () => {
    const { meta } = await obterHoje(fixture.restauranteA, "04:00:00");

    expect(meta).toMatchObject({
      faturamentoMes: "8400.00",
      meta: "100000.00",
      projecao: "8454.55",
      projecaoDisponivel: true,
    });
    expect(typeof meta.andamento).toBe("number");
    expect(meta.andamento).toBeCloseTo(0.084, 4);
  });

  it("sem meta definida, a meta e o andamento são null e a projeção segue independente", async () => {
    await banco.query("delete from public.metas where restaurante_id = $1", [
      fixture.restauranteA,
    ]);
    const { meta } = await obterHoje(fixture.restauranteA, "04:00:00");

    expect(meta.meta).toBeNull();
    expect(meta.andamento).toBeNull();
    expect(meta.projecao).toBe("8454.55");
    expect(meta.projecaoDisponivel).toBe(true);
  });

  it("casa sem nenhum dado: tudo zerado e sem comparação, sem erro", async () => {
    const dados = await obterHoje(fixture.restauranteB, "04:00:00");

    expect(dados.faturamento).toMatchObject({
      valor: "0",
      contasPagas: 0,
      pessoasPagas: 0,
      media: null,
      variacao: null,
    });
    expect(dados.porPessoa).toEqual({
      valor: null,
      media: null,
      variacao: null,
    });
    expect(dados.mesasAbertas).toMatchObject({ quantidade: 0 });
    expect(dados.contasEsquecidas).toEqual([]);
    expect(dados.meta).toMatchObject({
      meta: null,
      andamento: null,
      projecao: null,
      projecaoDisponivel: false,
    });
    expect(dados.curva.every((p) => p.tipico === null)).toBe(true);
  });
});
