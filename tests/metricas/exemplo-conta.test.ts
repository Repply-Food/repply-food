import type { Client } from "pg";
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  entrada,
  envelope,
  limparFixture,
} from "../helpers/supabase-local";

describe("exemplo de conta de métricas no PostgreSQL", () => {
  let banco: Client = undefined as never;
  let fixture: Fixture = undefined as never;

  beforeEach(async () => {
    banco = undefined as never;
    fixture = undefined as never;
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
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

  it("mantém a virada às 5h e separa R$ 580,00 de faturamento de R$ 60,00 de taxa", async () => {
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
      }),
    ];
    await banco.query("select public.processar_envio($1, $2::jsonb)", [
      fixture.restauranteA,
      JSON.stringify(envelope(entradas)),
    ]);
    await banco.query(
      "update public.entradas set removida_em = now() where restaurante_id = $1 and cod_entrada = 6",
      [fixture.restauranteA]
    );

    const normalizadas = await banco.query<{
      cod_entrada: string;
      dia_operacao: string;
    }>(
      "select cod_entrada::text, dia_operacao::text from public.entradas where restaurante_id = $1 order by cod_entrada",
      [fixture.restauranteA]
    );
    expect(normalizadas.rows).toContainEqual({
      cod_entrada: "3",
      dia_operacao: "2026-10-09",
    });
    expect(normalizadas.rows).toContainEqual({
      cod_entrada: "5",
      dia_operacao: "2026-10-10",
    });

    const agregado = await banco.query<{
      faturamento: string;
      taxa: string;
      pagas: string;
      pessoas_pagas: string;
    }>(
      `select
        coalesce(sum(valor_consumido - taxa_servico) filter (where pago), 0)::text as faturamento,
        coalesce(sum(taxa_servico) filter (where pago), 0)::text as taxa,
        count(*) filter (where pago)::text as pagas,
        coalesce(sum(numero_ocupantes) filter (where pago), 0)::text as pessoas_pagas
       from public.entradas
       where restaurante_id = $1 and dia_operacao = '2026-10-09' and removida_em is null`,
      [fixture.restauranteA]
    );
    expect(agregado.rows[0]).toEqual({
      faturamento: "580.00",
      taxa: "60.00",
      pagas: "3",
      pessoas_pagas: "9",
    });
  });
});
