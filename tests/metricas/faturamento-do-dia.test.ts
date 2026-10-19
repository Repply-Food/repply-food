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

type Faturamento = {
  faturamento: string;
  taxa_servico: string;
  contas_pagas: number;
  pessoas_pagas: number;
};

// "Agora" do exemplo de conta (docs/metricas.md §2): 10/10/2026 às 02:00 em
// Fortaleza (UTC-3), ainda dentro do dia de operação de sexta, 09/10.
const AGORA_DO_EXEMPLO = "2026-10-10 02:00:00-03:00";

const CONSULTA =
  "select * from public.metrica_faturamento_do_dia($1, $2::timestamptz)";

describe("metrica_faturamento_do_dia no PostgreSQL", () => {
  let banco: Client = undefined as never;
  let fixture: Fixture = undefined as never;

  beforeEach(async () => {
    banco = undefined as never;
    fixture = undefined as never;
    banco = await conectarBanco();
    fixture = await criarFixture(banco);

    // As 6 entradas (E1–E6) do exemplo de conta da §2 do metricas.md.
    const entradas = [
      entrada(1, { CodGarcon: 27, codOperadorDesab: 99 }),
      entrada(2, {
        DataEntrada: "2026-10-09",
        HoraEntrada: "12:40:00",
        DataSaida: "2026-10-09",
        HoraSaida: "14:10:00",
        ValorItens: 200,
        ValorDescontos: 20,
        TaxaServico: 20,
        ValorConsumido: 200,
        NumeroOcupantes: 4,
        CodGarcon: 14,
        codOperadorDesab: 99,
      }),
      entrada(3, {
        DataEntrada: "2026-10-09",
        HoraEntrada: "23:30:00",
        DataSaida: "2026-10-10",
        HoraSaida: "01:15:00",
        ValorItens: 300,
        TaxaServico: 30,
        ValorConsumido: 330,
        NumeroOcupantes: 3,
        CodGarcon: 27,
        codOperadorDesab: 98,
      }),
      entrada(4, {
        DataEntrada: "2026-10-09",
        HoraEntrada: "21:00:00",
        DataSaida: null,
        HoraSaida: null,
        ValorItens: 150,
        TaxaServico: 15,
        ValorConsumido: 165,
        Pago: "Não",
        NumeroOcupantes: 2,
        CodGarcon: 14,
      }),
      entrada(5, {
        DataEntrada: "2026-10-10",
        HoraEntrada: "05:30:00",
        DataSaida: "2026-10-10",
        HoraSaida: "06:10:00",
        ValorItens: 50,
        TaxaServico: 5,
        ValorConsumido: 55,
        NumeroOcupantes: 1,
        CodGarcon: 27,
        codOperadorDesab: 99,
      }),
      entrada(6, {
        DataEntrada: "2026-10-09",
        HoraEntrada: "19:00:00",
        DataSaida: "2026-10-09",
        HoraSaida: "20:00:00",
        ValorItens: 80,
        TaxaServico: 8,
        ValorConsumido: 88,
        NumeroOcupantes: 2,
        CodGarcon: 14,
        codOperadorDesab: 99,
      }),
    ];
    await banco.query("select public.processar_envio($1, $2::jsonb)", [
      fixture.restauranteA,
      JSON.stringify(envelope(entradas)),
    ]);
    // E6 é a conta removida: nunca entra em métrica nenhuma.
    await banco.query(
      "update public.entradas set removida_em = now() where restaurante_id = $1 and cod_entrada = 6",
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

  it("devolve R$ 580,00 de faturamento, R$ 60,00 de taxa, 3 contas e 9 pessoas no exemplo da §2", async () => {
    const r = await banco.query<Faturamento>(CONSULTA, [
      fixture.restauranteA,
      AGORA_DO_EXEMPLO,
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toEqual({
      faturamento: "580.00",
      taxa_servico: "60.00",
      contas_pagas: 3,
      pessoas_pagas: 9,
    });
  });

  it("só conta o que já tinha fechado até o 'agora' pedido", async () => {
    // 23:59 de 09/10: E3 (fecha 01:15 de 10/10) ainda está aberta.
    const r = await banco.query<Faturamento>(CONSULTA, [
      fixture.restauranteA,
      "2026-10-09 23:59:00-03:00",
    ]);
    expect(r.rows[0]).toEqual({
      faturamento: "280.00", // (110−10) + (200−20)
      taxa_servico: "30.00", // 10 + 20
      contas_pagas: 2,
      pessoas_pagas: 6,
    });
  });

  it("usa o dia de operação do 'agora': 06:30 de 10/10 já é o dia 10/10", async () => {
    const r = await banco.query<Faturamento>(CONSULTA, [
      fixture.restauranteA,
      "2026-10-10 06:30:00-03:00",
    ]);
    expect(r.rows[0]).toEqual({
      faturamento: "50.00", // só E5 (55−5)
      taxa_servico: "5.00",
      contas_pagas: 1,
      pessoas_pagas: 1,
    });
  });

  it("devolve zeros (e não nulo nem erro) para um dia sem nenhuma conta paga", async () => {
    const r = await banco.query<Faturamento>(CONSULTA, [
      fixture.restauranteA,
      "2026-10-20 12:00:00-03:00",
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.contas_pagas).toBe(0);
    expect(r.rows[0]?.pessoas_pagas).toBe(0);
    expect(Number(r.rows[0]?.faturamento)).toBe(0);
    expect(Number(r.rows[0]?.taxa_servico)).toBe(0);
  });

  it("devolve dinheiro como texto, nunca como número", async () => {
    const r = await banco.query<Faturamento>(CONSULTA, [
      fixture.restauranteA,
      AGORA_DO_EXEMPLO,
    ]);
    expect(typeof r.rows[0]?.faturamento).toBe("string");
    expect(typeof r.rows[0]?.taxa_servico).toBe("string");
  });

  it("o dono da casa A lê os números da casa A", async () => {
    const r = await comoAutenticado(banco, fixture.usuarioA, () =>
      banco.query<Faturamento>(CONSULTA, [
        fixture.restauranteA,
        AGORA_DO_EXEMPLO,
      ])
    );
    expect(r.rows[0]).toEqual({
      faturamento: "580.00",
      taxa_servico: "60.00",
      contas_pagas: 3,
      pessoas_pagas: 9,
    });
  });

  it("isolamento: o dono da casa B não lê as contas da casa A (a RLS devolve tudo zero)", async () => {
    const r = await comoAutenticado(banco, fixture.usuarioB, () =>
      banco.query<Faturamento>(CONSULTA, [
        fixture.restauranteA,
        AGORA_DO_EXEMPLO,
      ])
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.contas_pagas).toBe(0);
    expect(r.rows[0]?.pessoas_pagas).toBe(0);
    expect(Number(r.rows[0]?.faturamento)).toBe(0);
    expect(Number(r.rows[0]?.taxa_servico)).toBe(0);
  });

  it("isolamento: quem tem login mas nenhum acesso também não lê a casa A", async () => {
    const r = await comoAutenticado(banco, fixture.usuarioSemAcesso, () =>
      banco.query<Faturamento>(CONSULTA, [
        fixture.restauranteA,
        AGORA_DO_EXEMPLO,
      ])
    );
    expect(r.rows[0]?.contas_pagas).toBe(0);
    expect(Number(r.rows[0]?.faturamento)).toBe(0);
  });

  it("o admin da Repply lê a casa A (ver o painel do cliente, D-38)", async () => {
    const r = await comoAutenticado(banco, fixture.admin, () =>
      banco.query<Faturamento>(CONSULTA, [
        fixture.restauranteA,
        AGORA_DO_EXEMPLO,
      ])
    );
    expect(r.rows[0]).toEqual({
      faturamento: "580.00",
      taxa_servico: "60.00",
      contas_pagas: 3,
      pessoas_pagas: 9,
    });
  });

  it("a casa B, sem nenhum dado, devolve zeros mesmo para o próprio dono", async () => {
    const r = await comoAutenticado(banco, fixture.usuarioB, () =>
      banco.query<Faturamento>(CONSULTA, [
        fixture.restauranteB,
        AGORA_DO_EXEMPLO,
      ])
    );
    expect(r.rows[0]?.contas_pagas).toBe(0);
    expect(Number(r.rows[0]?.faturamento)).toBe(0);
  });
});
