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

// Meta do mês e projeção (docs/metricas.md §4):
//   andamento = faturamento do mês ÷ meta
//   projeção  = (faturamento do mês até ontem ÷ dias de operação até ontem) × dias do mês
//   a projeção só aparece a partir do 3º dia do mês
//   mês sem meta herda a mais recente anterior; sem nenhuma, meta = null.
//
// Histórico controlado em restauranteA (America/Fortaleza, virada 05:00), em
// setembro de 2026 (30 dias). Cada dia 01..10 tem UMA conta paga de
// R$ 11.000 de consumo e R$ 1.000 de taxa, aberta 12:00 e fechada 14:00 local:
// faturamento da casa de R$ 10.000 por dia (a taxa fica de fora, D-14).
// Fora do caminho feliz, o histórico também tem de propósito:
//   cod 90   31/08  paga, R$ 50.000 da casa  → mês anterior, nunca entra em setembro
//   cod 111  11/09  paga, R$ 5.000 da casa   → HOJE, fecha 14:00
//   cod 202  11/09  paga, R$ 3.000 da casa   → HOJE, mas fecha 23:30 (depois do "agora")
//   cod 200  03/09  paga, R$ 7.777           → removida: nunca entra
//   cod 201  05/09  NÃO paga, R$ 9.999       → conta aberta: não é faturamento
//
// "Agora" padrão: 11/09 21:00-03:00 (sexta). Faturamento do mês = 10 dias × 10.000
// + 5.000 de hoje = R$ 105.000. Até ontem: R$ 100.000 em 10 dias → projeção de
// (100.000 ÷ 10) × 30 = R$ 300.000. Com a meta de R$ 170.000: andamento 0,6176.
type Meta = {
  faturamento_mes: string;
  meta: string | null;
  andamento: string | null;
  projecao: string | null;
  projecao_disponivel: boolean;
};

const CONSULTA =
  "select * from public.metrica_meta_do_mes($1, $2::timestamptz)";

const AGORA = "2026-09-11 21:00:00-03:00";

function contaDoDia(
  codEntrada: number,
  dia: string,
  consumo: number,
  taxa: number,
  fecha = "14:00:00"
) {
  return entrada(codEntrada, {
    DataEntrada: dia,
    HoraEntrada: "12:00:00",
    DataSaida: dia,
    HoraSaida: fecha,
    ValorItens: consumo - taxa,
    TaxaServico: taxa,
    ValorConsumido: consumo,
    NumeroOcupantes: 2,
    CodGarcon: 27,
    codOperadorDesab: 99,
  });
}

describe("metrica_meta_do_mes no PostgreSQL", () => {
  let banco: Client = undefined as never;
  let fixture: Fixture = undefined as never;

  async function definirMeta(mes: string, valor: number, casa?: string) {
    await banco.query(
      "insert into public.metas (restaurante_id, mes, valor) values ($1, $2, $3)",
      [casa ?? fixture.restauranteA, mes, valor]
    );
  }

  async function consultar(agora = AGORA, casa?: string) {
    const r = await banco.query<Meta>(CONSULTA, [
      casa ?? fixture.restauranteA,
      agora,
    ]);
    return r.rows;
  }

  beforeEach(async () => {
    banco = undefined as never;
    fixture = undefined as never;
    banco = await conectarBanco();
    fixture = await criarFixture(banco);

    const entradas = [
      contaDoDia(90, "2026-08-31", 55000, 5000),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((dia) =>
        contaDoDia(
          100 + dia,
          `2026-09-${String(dia).padStart(2, "0")}`,
          11000,
          1000
        )
      ),
      contaDoDia(111, "2026-09-11", 5500, 500),
      contaDoDia(202, "2026-09-11", 3300, 300, "23:30:00"),
      contaDoDia(200, "2026-09-03", 7777, 0),
      entrada(201, {
        DataEntrada: "2026-09-05",
        HoraEntrada: "21:00:00",
        DataSaida: null,
        HoraSaida: null,
        ValorItens: 9999,
        TaxaServico: 0,
        ValorConsumido: 9999,
        Pago: "Não",
        NumeroOcupantes: 2,
        CodGarcon: 27,
      }),
    ];
    await banco.query("select public.processar_envio($1, $2::jsonb)", [
      fixture.restauranteA,
      JSON.stringify(envelope(entradas, "2026-08-31", "2026-09-12")),
    ]);
    // cod 200 é a conta removida: nunca entra em métrica nenhuma.
    await banco.query(
      "update public.entradas set removida_em = now() where restaurante_id = $1 and cod_entrada = 200",
      [fixture.restauranteA]
    );
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

  it("com meta: R$ 105.000 de R$ 170.000 (61,76%) e a projeção fecha em R$ 300.000", async () => {
    await definirMeta("2026-09-01", 170000);
    const rows = await consultar();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      faturamento_mes: "105000.00",
      meta: "170000.00",
      projecao: "300000.00",
      projecao_disponivel: true,
    });
    expect(Number(rows[0]?.andamento)).toBeCloseTo(0.6176, 4);
  });

  it("o faturamento do mês é o da casa: sem taxa, conta aberta, removida, mês anterior nem venda depois do 'agora'", async () => {
    // 10 × 10.000 + 5.000 de hoje. Ficam de fora: a taxa (D-14), a conta
    // aberta (9.999), a removida (7.777), 31/08 (50.000) e a venda de hoje que
    // só fecha às 23:30 (3.000).
    const rows = await consultar();
    expect(rows[0]?.faturamento_mes).toBe("105000.00");
  });

  it("a projeção não usa hoje: uma venda de hoje sobe o mês, mas a projeção não muda", async () => {
    // 23:59: a venda das 23:30 (3.000) já fechou e entra no mês (108.000),
    // mas a projeção segue sendo (até ontem) 300.000.
    await definirMeta("2026-09-01", 170000);
    const rows = await consultar("2026-09-11 23:59:00-03:00");
    expect(rows[0]?.faturamento_mes).toBe("108000.00");
    expect(rows[0]?.projecao).toBe("300000.00");
    expect(Number(rows[0]?.andamento)).toBeCloseTo(108000 / 170000, 4);
  });

  it("sem nenhuma meta: meta e andamento ficam nulos, e o faturamento do mês segue calculado", async () => {
    const rows = await consultar();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.faturamento_mes).toBe("105000.00");
    expect(rows[0]?.meta).toBeNull();
    expect(rows[0]?.andamento).toBeNull();
    // A tela mostra "sem meta definida" e ignora a projeção neste caso.
    expect(rows[0]?.projecao_disponivel).toBe(true);
  });

  it("mês atual sem meta herda a do mês anterior", async () => {
    await definirMeta("2026-08-01", 150000);
    const rows = await consultar();
    expect(rows[0]?.meta).toBe("150000.00");
    expect(Number(rows[0]?.andamento)).toBeCloseTo(105000 / 150000, 4); // 0,7
  });

  it("herda a mais recente entre várias metas passadas", async () => {
    await definirMeta("2026-06-01", 100000);
    await definirMeta("2026-08-01", 150000);
    const rows = await consultar();
    expect(rows[0]?.meta).toBe("150000.00");
  });

  it("a meta do próprio mês vale mais que a herdada", async () => {
    await definirMeta("2026-08-01", 150000);
    await definirMeta("2026-09-01", 170000);
    const rows = await consultar();
    expect(rows[0]?.meta).toBe("170000.00");
  });

  it("meta de mês futuro não vale para o mês atual", async () => {
    await definirMeta("2026-10-01", 200000);
    const rows = await consultar();
    expect(rows[0]?.meta).toBeNull();
    expect(rows[0]?.andamento).toBeNull();
  });

  it("no 1º dia do mês ainda não há projeção (nenhum dia fechado)", async () => {
    await definirMeta("2026-09-01", 170000);
    const rows = await consultar("2026-09-01 15:00:00-03:00");
    expect(rows[0]).toMatchObject({
      faturamento_mes: "10000.00", // o dia 31/08 não entra em setembro
      meta: "170000.00",
      projecao: null,
      projecao_disponivel: false,
    });
  });

  it("no 2º dia do mês (1 dia fechado) a projeção ainda não aparece", async () => {
    await definirMeta("2026-09-01", 170000);
    const rows = await consultar("2026-09-02 15:00:00-03:00");
    expect(rows[0]).toMatchObject({
      faturamento_mes: "20000.00",
      projecao: null,
      projecao_disponivel: false,
    });
    expect(Number(rows[0]?.andamento)).toBeCloseTo(20000 / 170000, 4);
  });

  it("no 3º dia do mês (2 dias fechados) a projeção aparece: (20.000 ÷ 2) × 30", async () => {
    await definirMeta("2026-09-01", 170000);
    const rows = await consultar("2026-09-03 15:00:00-03:00");
    expect(rows[0]).toMatchObject({
      faturamento_mes: "30000.00", // dias 1, 2 e 3 (a conta do dia 3 fechou às 14:00)
      projecao: "300000.00",
      projecao_disponivel: true,
    });
  });

  it("antes da virada das 05:00 do dia 1º ainda é o dia de operação de 31/08: o mês é agosto", async () => {
    await definirMeta("2026-08-01", 150000);
    await definirMeta("2026-09-01", 170000);
    const rows = await consultar("2026-09-01 03:00:00-03:00");
    expect(rows[0]).toMatchObject({
      faturamento_mes: "50000.00", // só a conta de 31/08
      meta: "150000.00", // a meta de agosto, não a de setembro
      projecao: null,
      projecao_disponivel: false,
    });
  });

  it("devolve dinheiro como texto, nunca como número", async () => {
    await definirMeta("2026-09-01", 170000);
    const rows = await consultar();
    expect(typeof rows[0]?.faturamento_mes).toBe("string");
    expect(typeof rows[0]?.meta).toBe("string");
    expect(typeof rows[0]?.projecao).toBe("string");
    expect(typeof rows[0]?.projecao_disponivel).toBe("boolean");
  });

  it("o dono da casa A lê a meta e o faturamento da casa A", async () => {
    await definirMeta("2026-09-01", 170000);
    const r = await comoAutenticado(banco, fixture.usuarioA, () =>
      banco.query<Meta>(CONSULTA, [fixture.restauranteA, AGORA])
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      faturamento_mes: "105000.00",
      meta: "170000.00",
      projecao: "300000.00",
      projecao_disponivel: true,
    });
  });

  it("o admin da Repply lê a meta da casa A (ver o painel do cliente, D-38)", async () => {
    await definirMeta("2026-09-01", 170000);
    const r = await comoAutenticado(banco, fixture.admin, () =>
      banco.query<Meta>(CONSULTA, [fixture.restauranteA, AGORA])
    );
    expect(r.rows[0]).toMatchObject({
      faturamento_mes: "105000.00",
      meta: "170000.00",
    });
  });

  it("isolamento: o dono da casa B não lê o faturamento nem a meta da casa A", async () => {
    // A RLS de restaurantes não deixa B ler a casa A: a função devolve 0 linhas
    // (v_fuso nulo → return), nunca o faturamento ou a meta de A.
    await definirMeta("2026-09-01", 170000);
    const r = await comoAutenticado(banco, fixture.usuarioB, () =>
      banco.query<Meta>(CONSULTA, [fixture.restauranteA, AGORA])
    );
    expect(r.rows).toHaveLength(0);
  });

  it("isolamento: quem tem login mas nenhum acesso também não lê a casa A", async () => {
    await definirMeta("2026-09-01", 170000);
    const r = await comoAutenticado(banco, fixture.usuarioSemAcesso, () =>
      banco.query<Meta>(CONSULTA, [fixture.restauranteA, AGORA])
    );
    expect(r.rows).toHaveLength(0);
  });

  it("isolamento: a casa B não herda a meta da casa A", async () => {
    await definirMeta("2026-09-01", 170000); // meta da casa A
    const r = await comoAutenticado(banco, fixture.usuarioB, () =>
      banco.query<Meta>(CONSULTA, [fixture.restauranteB, AGORA])
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.meta).toBeNull();
    expect(r.rows[0]?.andamento).toBeNull();
  });

  it("casa recém-cadastrada, sem nenhuma conta: faturamento zero, sem projeção, andamento zero com meta", async () => {
    await definirMeta("2026-09-01", 100000, fixture.restauranteB);
    const r = await comoAutenticado(banco, fixture.usuarioB, () =>
      banco.query<Meta>(CONSULTA, [fixture.restauranteB, AGORA])
    );
    expect(r.rows).toHaveLength(1);
    expect(Number(r.rows[0]?.faturamento_mes)).toBe(0);
    expect(r.rows[0]?.meta).toBe("100000.00");
    expect(Number(r.rows[0]?.andamento)).toBe(0);
    expect(r.rows[0]?.projecao).toBeNull();
    expect(r.rows[0]?.projecao_disponivel).toBe(false);
  });
});
