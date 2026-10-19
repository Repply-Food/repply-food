// @vitest-environment node
import type { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Fixture,
  comoAutenticado,
  conectarBanco,
  criarFixture,
  entrada,
  envelope,
  limparFixture,
} from "../helpers/supabase-local";

// A curva acumulada do "Hoje" (docs/metricas.md §4): a curva de hoje (até agora)
// contra a curva média das 4 ocorrências do MESMO dia da semana com movimento,
// amostrada de 30 em 30 min desde a virada. Cada ponto é o faturamento da casa
// acumulado das contas pagas com fechada_em <= início do dia + minuto_do_dia.
//
// Montamos um histórico controlado em restauranteA (America/Fortaleza, UTC-3,
// virada 05:00). Cada dia de operação tem DUAS contas pagas, para que a curva
// SUBA em degraus e dê para conferir um ponto INTERMEDIÁRIO, não só o final:
//
//   - conta "cedo": abre 10:00, fecha 11:00 (= 360 min após a virada) → metade
//   - conta "tarde": abre 10:00, fecha 20:00 (= 900 min após a virada) → a outra metade
//
//   sexta 02/10 → 500 + 500 = 1.000 no dia
//   sexta 09/10 → 1.000 + 1.000 = 2.000 no dia
//   sexta 16/10 → 1.500 + 1.500 = 3.000 no dia   média do dia = 2.000
//   sexta 23/10 → 1.200 + 1.200 = 2.400 no dia   = HOJE
//
// p_agora de hoje = sexta 23/10 21:40-03:00 = 16h40 após a virada = 1000 min
// decorridos. O último ponto de 30 em 30 <= 1000 é o de 990 min.
//
//   Faixa      hoje (23/10)                 típico = média(02,09,16)
//   0..330     0            (nada fechou)    0
//   360..870   1.200        (só a "cedo")    média(500,1000,1500) = 1.000
//   900..990   2.400        (as duas)        média(1000,2000,3000) = 2.000
//   1020..1410 null         (> decorrido)    2.000
type Curva = {
  minuto_do_dia: number;
  acumulado_hoje: string | null;
  acumulado_tipico: string | null;
};

type Faturamento = { faturamento: string };

const CONSULTA =
  "select * from public.metrica_curva_do_dia($1, $2::timestamptz) order by minuto_do_dia";

// "Sexta 21:40" de cada dia de operação (16h40 após a virada das 05:00).
const HOJE = "2026-10-23 21:40:00-03:00"; // 3 ocorrências no histórico
const SEXTA_09 = "2026-10-09 21:40:00-03:00"; // 1 ocorrência (< 2) no histórico
const DECORRIDO_MIN = 1000;
const ULTIMO_PONTO = 990; // último múltiplo de 30 <= 1000
const PONTO_INTERMEDIARIO = 600; // entre 360 (cedo) e 900 (tarde)

// Uma conta paga, aberta 10:00 e fechada em horaSaida no mesmo dia de operação.
function contaCurva(
  codEntrada: number,
  dia: string,
  valorConsumido: number,
  horaSaida: string
) {
  return entrada(codEntrada, {
    DataEntrada: dia,
    HoraEntrada: "10:00:00",
    DataSaida: dia,
    HoraSaida: horaSaida,
    ValorItens: valorConsumido,
    TaxaServico: 0,
    ValorConsumido: valorConsumido,
    NumeroOcupantes: 10,
    CodGarcon: 27,
    codOperadorDesab: 99,
  });
}

function ponto(linhas: Curva[], minuto: number): Curva {
  const achada = linhas.find((l) => l.minuto_do_dia === minuto);
  if (!achada) throw new Error(`faixa ${minuto} não encontrada`);
  return achada;
}

describe("metrica_curva_do_dia no PostgreSQL", () => {
  let banco: Client = undefined as never;
  let fixture: Fixture = undefined as never;

  beforeEach(async () => {
    banco = undefined as never;
    fixture = undefined as never;
    banco = await conectarBanco();
    fixture = await criarFixture(banco);

    // Todas as 8 contas num envelope só: como todos os cod_entrada estão
    // presentes, a reconciliação (passo 6 de processar_envio) não remove nada.
    const entradas = [
      contaCurva(10021, "2026-10-02", 500, "11:00:00"),
      contaCurva(10022, "2026-10-02", 500, "20:00:00"),
      contaCurva(10091, "2026-10-09", 1000, "11:00:00"),
      contaCurva(10092, "2026-10-09", 1000, "20:00:00"),
      contaCurva(10161, "2026-10-16", 1500, "11:00:00"),
      contaCurva(10162, "2026-10-16", 1500, "20:00:00"),
      contaCurva(10231, "2026-10-23", 1200, "11:00:00"),
      contaCurva(10232, "2026-10-23", 1200, "20:00:00"),
    ];
    await banco.query("select public.processar_envio($1, $2::jsonb)", [
      fixture.restauranteA,
      JSON.stringify(envelope(entradas, "2026-10-01", "2026-10-24")),
    ]);
  });

  afterEach(async () => {
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      if (banco) await banco.end();
      banco = undefined as never;
      fixture = undefined as never;
    }
  });

  it("devolve 48 pontos, de 30 em 30 min, de 0 a 1410 (desde a virada)", async () => {
    const r = await banco.query<Curva>(CONSULTA, [fixture.restauranteA, HOJE]);
    expect(r.rows).toHaveLength(48);
    expect(r.rows[0]?.minuto_do_dia).toBe(0);
    expect(r.rows.at(-1)?.minuto_do_dia).toBe(1410);
    for (let i = 1; i < r.rows.length; i++) {
      expect(
        (r.rows[i]?.minuto_do_dia ?? 0) - (r.rows[i - 1]?.minuto_do_dia ?? 0)
      ).toBe(30);
    }
  });

  it("acumulado_hoje é null nas faixas depois do decorrido e tem valor antes", async () => {
    const r = await banco.query<Curva>(CONSULTA, [fixture.restauranteA, HOJE]);
    // tudo acima do decorrido (1000 min) é null
    for (const l of r.rows.filter((x) => x.minuto_do_dia > DECORRIDO_MIN)) {
      expect(l.acumulado_hoje).toBeNull();
    }
    // o último ponto <= decorrido tem valor
    expect(ponto(r.rows, ULTIMO_PONTO).acumulado_hoje).not.toBeNull();
    expect(ponto(r.rows, 1020).acumulado_hoje).toBeNull();
  });

  it("acumulado_hoje no último ponto <= decorrido bate com o faturamento de hoje (2.400)", async () => {
    const r = await banco.query<Curva>(CONSULTA, [fixture.restauranteA, HOJE]);
    const fat = await banco.query<Faturamento>(
      "select faturamento from public.metrica_faturamento_do_dia($1, $2::timestamptz)",
      [fixture.restauranteA, HOJE]
    );
    expect(fat.rows[0]?.faturamento).toBe("2400.00");
    expect(ponto(r.rows, ULTIMO_PONTO).acumulado_hoje).toBe(
      fat.rows[0]?.faturamento
    );
  });

  it("acumulado_hoje num ponto intermediário mostra só a conta já fechada (1.200)", async () => {
    const r = await banco.query<Curva>(CONSULTA, [fixture.restauranteA, HOJE]);
    // faixa 600: a conta "cedo" (fecha 360) entrou; a "tarde" (fecha 900) não
    expect(ponto(r.rows, PONTO_INTERMEDIARIO).acumulado_hoje).toBe("1200.00");
    // antes de qualquer fechamento (faixa 330 < 360) ainda é zero
    expect(Number(ponto(r.rows, 330).acumulado_hoje)).toBe(0);
  });

  it("com 3 ocorrências, acumulado_tipico no ponto do decorrido ≈ média (2.000)", async () => {
    const r = await banco.query<Curva>(CONSULTA, [fixture.restauranteA, HOJE]);
    expect(ponto(r.rows, ULTIMO_PONTO).acumulado_tipico).toBe("2000.00");
  });

  it("acumulado_tipico num ponto intermediário é a média das curvas parciais (1.000)", async () => {
    const r = await banco.query<Curva>(CONSULTA, [fixture.restauranteA, HOJE]);
    // faixa 600: média(500, 1.000, 1.500) das contas "cedo" = 1.000
    expect(ponto(r.rows, PONTO_INTERMEDIARIO).acumulado_tipico).toBe("1000.00");
  });

  it("com menos de 2 ocorrências, acumulado_tipico é null mesmo onde há dado", async () => {
    // p_agora = sexta 09/10: só a sexta 02/10 antes → 1 ocorrência.
    const r = await banco.query<Curva>(CONSULTA, [
      fixture.restauranteA,
      SEXTA_09,
    ]);
    // no último ponto a única sexta (02/10) tem acumulado 1.000, mas < 2 → null
    expect(ponto(r.rows, ULTIMO_PONTO).acumulado_tipico).toBeNull();
    // e a curva de hoje (09/10) continua existindo: 2.000 no fim
    expect(ponto(r.rows, ULTIMO_PONTO).acumulado_hoje).toBe("2000.00");
  });

  it("devolve dinheiro como texto, nunca como número", async () => {
    const r = await banco.query<Curva>(CONSULTA, [fixture.restauranteA, HOJE]);
    expect(typeof ponto(r.rows, ULTIMO_PONTO).acumulado_hoje).toBe("string");
    expect(typeof ponto(r.rows, ULTIMO_PONTO).acumulado_tipico).toBe("string");
  });

  it("o dono da casa A lê a curva da casa A", async () => {
    const r = await comoAutenticado(banco, fixture.usuarioA, () =>
      banco.query<Curva>(CONSULTA, [fixture.restauranteA, HOJE])
    );
    expect(r.rows).toHaveLength(48);
    expect(ponto(r.rows, ULTIMO_PONTO).acumulado_hoje).toBe("2400.00");
    expect(ponto(r.rows, ULTIMO_PONTO).acumulado_tipico).toBe("2000.00");
  });

  it("isolamento: o dono da casa B não enxerga a curva da casa A", async () => {
    // A RLS de restaurantes não deixa B ler a casa A: v_fuso nulo → return,
    // a função sai sem linha nenhuma.
    const r = await comoAutenticado(banco, fixture.usuarioB, () =>
      banco.query<Curva>(CONSULTA, [fixture.restauranteA, HOJE])
    );
    expect(r.rows).toHaveLength(0);
  });

  it("o admin da Repply lê a curva da casa A (ver o painel do cliente, D-38)", async () => {
    const r = await comoAutenticado(banco, fixture.admin, () =>
      banco.query<Curva>(CONSULTA, [fixture.restauranteA, HOJE])
    );
    expect(r.rows).toHaveLength(48);
    expect(ponto(r.rows, ULTIMO_PONTO).acumulado_tipico).toBe("2000.00");
  });
});
