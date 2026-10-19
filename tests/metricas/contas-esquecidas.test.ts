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

type ContaEsquecida = {
  cod_entrada: string;
  cod_cartao_mesa: number | null;
  aberta_em: Date;
  seg: number;
  valor_em_aberto: string;
};

// "Agora" do exemplo de conta (docs/metricas.md §2): 10/10/2026 às 02:00 em
// Fortaleza (UTC-3). Nesse instante só a E4 está aberta, desde 09/10 às 21:00.
const AGORA_DO_EXEMPLO = "2026-10-10 02:00:00-03:00";

const QUATRO_HORAS = "4 hours";

// `cod_entrada` é bigint: o `pg` devolve texto. O `seg` é a idade da conta em
// segundos inteiros, para o teste não depender do formato do interval.
const CONSULTA = `select cod_entrada, cod_cartao_mesa, aberta_em, valor_em_aberto,
                         extract(epoch from aberta_ha)::int as seg
                    from public.metrica_contas_esquecidas($1, $2::timestamptz, $3::interval)`;

describe("metrica_contas_esquecidas no PostgreSQL", () => {
  let banco: Client = undefined as never;
  let fixture: Fixture = undefined as never;

  const consultar = (agora: string, limite: string, restaurante?: string) =>
    banco.query<ContaEsquecida>(CONSULTA, [
      restaurante ?? fixture.restauranteA,
      agora,
      limite,
    ]);

  beforeEach(async () => {
    banco = undefined as never;
    fixture = undefined as never;
    banco = await conectarBanco();
    fixture = await criarFixture(banco);

    // As 6 entradas (E1–E6) do exemplo de conta da §2 do metricas.md. A E3 e a
    // E4 ganham o cartão/mesa (5 e 12) para o teste conferir essa coluna.
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
        codCartaoMesa: 5,
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
        codCartaoMesa: 12,
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

  it("às 02:00 do exemplo da §2, só a E4 passa de 4 h: R$ 165,00 em aberto há 5 h", async () => {
    const r = await consultar(AGORA_DO_EXEMPLO, QUATRO_HORAS);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.cod_entrada).toBe("4");
    expect(r.rows[0]?.cod_cartao_mesa).toBe(12);
    expect(r.rows[0]?.valor_em_aberto).toBe("165.00");
    expect(r.rows[0]?.seg).toBe(5 * 3600);
    expect(r.rows[0]?.aberta_em.toISOString()).toBe(
      new Date("2026-10-09T21:00:00-03:00").toISOString()
    );
  });

  it("devolve todas as esquecidas, da mais antiga para a mais nova (E4 antes da E3)", async () => {
    // 23:45 de 09/10 com limite de 10 min: E4 (aberta 21:00, há 2h45) e
    // E3 (aberta 23:30, há 15 min). A E3 tem o código menor, então a ordem
    // certa (E4, E3) só sai se o banco ordenar pela abertura e não pelo código.
    const r = await consultar("2026-10-09 23:45:00-03:00", "10 minutes");
    expect(r.rows.map((l) => l.cod_entrada)).toEqual(["4", "3"]);
    expect(r.rows.map((l) => l.seg)).toEqual([2 * 3600 + 45 * 60, 15 * 60]);
    expect(r.rows.map((l) => l.valor_em_aberto)).toEqual(["165.00", "330.00"]);
    expect(r.rows.map((l) => l.cod_cartao_mesa)).toEqual([12, 5]);
  });

  it("o valor em aberto leva a taxa de serviço (é o que o cliente vai pagar)", async () => {
    // E3 = 300 de itens + 30 de taxa.
    const r = await consultar("2026-10-09 23:45:00-03:00", "10 minutes");
    expect(r.rows[1]?.valor_em_aberto).toBe("330.00");
  });

  it("só passa do limite quem está aberto há MAIS que ele: no limite exato ainda não é esquecida", async () => {
    // 01:00 de 10/10: a E4 está aberta há exatamente 4 h.
    const noLimite = await consultar("2026-10-10 01:00:00-03:00", QUATRO_HORAS);
    expect(noLimite.rows).toHaveLength(0);

    const umSegundoDepois = await consultar(
      "2026-10-10 01:00:01-03:00",
      QUATRO_HORAS
    );
    expect(umSegundoDepois.rows.map((l) => l.cod_entrada)).toEqual(["4"]);
  });

  it("uma conta que já fechou antes do 'agora' não é esquecida, a que ainda vai abrir também não", async () => {
    // 13:30 de 09/10, limite de 10 min: E1 já fechou (13:05), E2 está aberta
    // há 50 min (12:40), E3 e E4 ainda vão abrir.
    const r = await consultar("2026-10-09 13:30:00-03:00", "10 minutes");
    expect(r.rows.map((l) => l.cod_entrada)).toEqual(["2"]);
    expect(r.rows[0]?.seg).toBe(50 * 60);
    expect(r.rows[0]?.valor_em_aberto).toBe("200.00");
  });

  it("no instante exato do fechamento a conta já não é esquecida", async () => {
    // 14:10 de 09/10 é a hora de saída da E2.
    const r = await consultar("2026-10-09 14:10:00-03:00", "10 minutes");
    expect(r.rows).toHaveLength(0);
  });

  it("a conta removida nunca é esquecida (E6 estaria aberta há 30 min às 19:30)", async () => {
    const r = await consultar("2026-10-09 19:30:00-03:00", "10 minutes");
    expect(r.rows).toHaveLength(0);
  });

  it("devolve lista vazia (e não erro) quando nenhuma conta passa do limite", async () => {
    // Às 02:00 a E4 está há 5 h: com limite de 6 h ninguém passa.
    const r = await consultar(AGORA_DO_EXEMPLO, "6 hours");
    expect(r.rows).toEqual([]);
  });

  it("devolve dinheiro como texto, nunca como número", async () => {
    const r = await consultar(AGORA_DO_EXEMPLO, QUATRO_HORAS);
    expect(typeof r.rows[0]?.valor_em_aberto).toBe("string");
  });

  it("o dono da casa A lê as contas esquecidas da casa A", async () => {
    const r = await comoAutenticado(banco, fixture.usuarioA, () =>
      consultar(AGORA_DO_EXEMPLO, QUATRO_HORAS)
    );
    expect(r.rows.map((l) => l.cod_entrada)).toEqual(["4"]);
    expect(r.rows[0]?.valor_em_aberto).toBe("165.00");
  });

  it("isolamento: o dono da casa B não lê as contas esquecidas da casa A (a RLS devolve vazio)", async () => {
    const r = await comoAutenticado(banco, fixture.usuarioB, () =>
      consultar(AGORA_DO_EXEMPLO, QUATRO_HORAS)
    );
    expect(r.rows).toEqual([]);
  });

  it("isolamento: quem tem login mas nenhum acesso também não lê a casa A", async () => {
    const r = await comoAutenticado(banco, fixture.usuarioSemAcesso, () =>
      consultar(AGORA_DO_EXEMPLO, QUATRO_HORAS)
    );
    expect(r.rows).toEqual([]);
  });

  it("o admin da Repply lê a casa A (ver o painel do cliente, D-38)", async () => {
    const r = await comoAutenticado(banco, fixture.admin, () =>
      consultar(AGORA_DO_EXEMPLO, QUATRO_HORAS)
    );
    expect(r.rows.map((l) => l.cod_entrada)).toEqual(["4"]);
    expect(r.rows[0]?.valor_em_aberto).toBe("165.00");
  });

  it("a casa B, sem nenhum dado, devolve vazio mesmo para o próprio dono", async () => {
    const r = await comoAutenticado(banco, fixture.usuarioB, () =>
      consultar(AGORA_DO_EXEMPLO, QUATRO_HORAS, fixture.restauranteB)
    );
    expect(r.rows).toEqual([]);
  });
});
