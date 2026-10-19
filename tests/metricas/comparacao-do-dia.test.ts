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

// A comparação do "Hoje" (docs/metricas.md §4): hoje contra a MÉDIA das últimas
// 4 ocorrências do MESMO dia da semana COM MOVIMENTO, até o MESMO tempo
// decorrido. Montamos um histórico controlado em restauranteA (America/Fortaleza,
// virada 05:00) com 3 sextas anteriores + a sexta de hoje, todas confirmadas
// como dia-da-semana 5 (extract(dow from dia_operacao) = 5):
//
//   sexta 02/10 → faturamento 1.000 (10 pessoas → 100/pessoa)
//   sexta 09/10 → faturamento 2.000 (10 pessoas → 200/pessoa)
//   sexta 16/10 → faturamento 3.000 (10 pessoas → 300/pessoa)   média = 2.000
//   sexta 23/10 → faturamento 2.400 (10 pessoas → 240/pessoa)   = hoje
//
// Cada conta abre 12:00 e fecha 14:00 LOCAL, bem antes da "sexta 21:40" de cada
// dia — por isso entra no acumulado "até o mesmo tempo decorrido". p_agora de
// hoje é sexta 23/10 21:40-03:00 (16h40 depois da virada): variação esperada
// (2.400 − 2.000) ÷ 2.000 = +20%.
type Comparacao = {
  faturamento_hoje: string;
  por_pessoa_hoje: string | null;
  media_faturamento: string | null;
  media_por_pessoa: string | null;
  variacao_faturamento: string | null;
  variacao_por_pessoa: string | null;
  ocorrencias: number;
};

const CONSULTA =
  "select * from public.metrica_comparacao_do_dia($1, $2::timestamptz)";

// "Sexta 21:40" de cada dia de operação (16h40 após a virada das 05:00).
const HOJE = "2026-10-23 21:40:00-03:00"; // 3 sextas no histórico
const SEXTA_16 = "2026-10-16 21:40:00-03:00"; // 2 sextas no histórico (limite)
const SEXTA_09 = "2026-10-09 21:40:00-03:00"; // 1 sexta no histórico (< 2)

// Uma conta paga, aberta 12:00 e fechada 14:00 local do dia informado.
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

describe("metrica_comparacao_do_dia no PostgreSQL", () => {
  let banco: Client = undefined as never;
  let fixture: Fixture = undefined as never;

  beforeEach(async () => {
    banco = undefined as never;
    fixture = undefined as never;
    banco = await conectarBanco();
    fixture = await criarFixture(banco);

    // Todas as 4 sextas num envelope só: como todos os cod_entrada estão
    // presentes, a reconciliação (passo 6 de processar_envio) não remove nada.
    const entradas = [
      contaDaSexta(1002, "2026-10-02", 1000, 10),
      contaDaSexta(1009, "2026-10-09", 2000, 10),
      contaDaSexta(1016, "2026-10-16", 3000, 10),
      contaDaSexta(1023, "2026-10-23", 2400, 10),
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

  it("compara hoje (2.400) com a média das 3 sextas (2.000): +20%", async () => {
    const r = await banco.query<Comparacao>(CONSULTA, [
      fixture.restauranteA,
      HOJE,
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.ocorrencias).toBe(3);
    expect(r.rows[0]?.faturamento_hoje).toBe("2400.00");
    expect(r.rows[0]?.media_faturamento).toBe("2000.00");
    expect(Number(r.rows[0]?.variacao_faturamento)).toBeCloseTo(0.2, 4);
  });

  it("compara o por-pessoa de hoje (240) com a média (200): +20%", async () => {
    const r = await banco.query<Comparacao>(CONSULTA, [
      fixture.restauranteA,
      HOJE,
    ]);
    expect(r.rows[0]?.media_por_pessoa).toBe("200.00");
    expect(Number(r.rows[0]?.variacao_por_pessoa)).toBeCloseTo(0.2, 4);
  });

  it("com 2 ocorrências (sexta 16/10) a variação já aparece", async () => {
    // Histórico antes de 16/10: 02/10 (1.000) e 09/10 (2.000) → média 1.500.
    // Hoje (16/10) faturou 3.000 → (3.000 − 1.500) ÷ 1.500 = +100%.
    const r = await banco.query<Comparacao>(CONSULTA, [
      fixture.restauranteA,
      SEXTA_16,
    ]);
    expect(r.rows[0]?.ocorrencias).toBe(2);
    expect(r.rows[0]?.media_faturamento).toBe("1500.00");
    expect(Number(r.rows[0]?.variacao_faturamento)).toBeCloseTo(1, 4);
  });

  it("com menos de 2 ocorrências (só 1 sexta) não mostra média nem variação", async () => {
    // Antes de 09/10 só existe a sexta 02/10 → 1 ocorrência: a tela mostra "—".
    const r = await banco.query<Comparacao>(CONSULTA, [
      fixture.restauranteA,
      SEXTA_09,
    ]);
    expect(r.rows[0]?.ocorrencias).toBe(1);
    expect(r.rows[0]?.faturamento_hoje).toBe("2000.00");
    expect(r.rows[0]?.media_faturamento).toBeNull();
    expect(r.rows[0]?.media_por_pessoa).toBeNull();
    expect(r.rows[0]?.variacao_faturamento).toBeNull();
    expect(r.rows[0]?.variacao_por_pessoa).toBeNull();
  });

  it("devolve dinheiro como texto e variação como número", async () => {
    const r = await banco.query<Comparacao>(CONSULTA, [
      fixture.restauranteA,
      HOJE,
    ]);
    expect(typeof r.rows[0]?.faturamento_hoje).toBe("string");
    expect(typeof r.rows[0]?.media_faturamento).toBe("string");
    // numeric volta como string no pg; o que importa é não ser objeto/number cru.
    expect(typeof r.rows[0]?.variacao_faturamento).toBe("string");
  });

  it("o dono da casa A lê a comparação da casa A", async () => {
    const r = await comoAutenticado(banco, fixture.usuarioA, () =>
      banco.query<Comparacao>(CONSULTA, [fixture.restauranteA, HOJE])
    );
    expect(r.rows[0]?.ocorrencias).toBe(3);
    expect(r.rows[0]?.media_faturamento).toBe("2000.00");
    expect(Number(r.rows[0]?.variacao_faturamento)).toBeCloseTo(0.2, 4);
  });

  it("isolamento: o dono da casa B não enxerga o histórico da casa A", async () => {
    // A RLS de restaurantes não deixa B ler a casa A: a função devolve 0 linhas
    // (v_fuso nulo → return), nunca a comparação de A.
    const r = await comoAutenticado(banco, fixture.usuarioB, () =>
      banco.query<Comparacao>(CONSULTA, [fixture.restauranteA, HOJE])
    );
    expect(r.rows).toHaveLength(0);
  });

  it("o admin da Repply lê a comparação da casa A (ver o painel do cliente, D-38)", async () => {
    const r = await comoAutenticado(banco, fixture.admin, () =>
      banco.query<Comparacao>(CONSULTA, [fixture.restauranteA, HOJE])
    );
    expect(r.rows[0]?.ocorrencias).toBe(3);
    expect(r.rows[0]?.media_faturamento).toBe("2000.00");
  });
});
