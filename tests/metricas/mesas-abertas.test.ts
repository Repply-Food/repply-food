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

type MesasAbertas = {
  quantidade: number;
  valor_em_aberto: string;
  pessoas_na_casa: number;
};

// "Agora" do exemplo de conta (docs/metricas.md §2): 10/10/2026 às 02:00 em
// Fortaleza (UTC-3). Nesse instante só a E4 está aberta.
const AGORA_DO_EXEMPLO = "2026-10-10 02:00:00-03:00";

const CONSULTA =
  "select * from public.metrica_mesas_abertas($1, $2::timestamptz)";

describe("metrica_mesas_abertas no PostgreSQL", () => {
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

  it("devolve 1 mesa, R$ 165,00 em aberto e 2 pessoas às 02:00 do exemplo da §2 (só a E4)", async () => {
    const r = await banco.query<MesasAbertas>(CONSULTA, [
      fixture.restauranteA,
      AGORA_DO_EXEMPLO,
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toEqual({
      quantidade: 1,
      valor_em_aberto: "165.00",
      pessoas_na_casa: 2,
    });
  });

  it("conta a taxa de serviço no valor em aberto (é o que o cliente vai pagar)", async () => {
    // 23:45 de 09/10: E3 (330, com taxa de 30) e E4 (165, com taxa de 15) abertas.
    const r = await banco.query<MesasAbertas>(CONSULTA, [
      fixture.restauranteA,
      "2026-10-09 23:45:00-03:00",
    ]);
    expect(r.rows[0]).toEqual({
      quantidade: 2,
      valor_em_aberto: "495.00",
      pessoas_na_casa: 5,
    });
  });

  it("uma conta que já fechou antes do 'agora' não conta, a que ainda vai abrir também não", async () => {
    // 13:30 de 09/10: E1 já fechou (13:05), E2 está aberta (12:40–14:10),
    // E3 e E4 ainda vão abrir.
    const r = await banco.query<MesasAbertas>(CONSULTA, [
      fixture.restauranteA,
      "2026-10-09 13:30:00-03:00",
    ]);
    expect(r.rows[0]).toEqual({
      quantidade: 1,
      valor_em_aberto: "200.00",
      pessoas_na_casa: 4,
    });
  });

  it("no instante exato do fechamento a conta já está fechada", async () => {
    // 01:15 de 10/10 é a hora de saída da E3: só a E4 segue aberta.
    const r = await banco.query<MesasAbertas>(CONSULTA, [
      fixture.restauranteA,
      "2026-10-10 01:15:00-03:00",
    ]);
    expect(r.rows[0]).toEqual({
      quantidade: 1,
      valor_em_aberto: "165.00",
      pessoas_na_casa: 2,
    });
  });

  it("no instante exato da abertura a conta já está aberta", async () => {
    // 05:30 de 10/10 é a hora de entrada da E5: ela entra junto com a E4.
    const r = await banco.query<MesasAbertas>(CONSULTA, [
      fixture.restauranteA,
      "2026-10-10 05:30:00-03:00",
    ]);
    expect(r.rows[0]).toEqual({
      quantidade: 2,
      valor_em_aberto: "220.00",
      pessoas_na_casa: 3,
    });
  });

  it("a conta removida nunca conta como aberta (E6 estaria aberta às 19:30)", async () => {
    const r = await banco.query<MesasAbertas>(CONSULTA, [
      fixture.restauranteA,
      "2026-10-09 19:30:00-03:00",
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.quantidade).toBe(0);
    expect(r.rows[0]?.pessoas_na_casa).toBe(0);
    // Sem linhas o coalesce devolve "0" (sem casas decimais): o formatarBRL
    // trata, então o teste compara o valor e não o texto.
    expect(Number(r.rows[0]?.valor_em_aberto)).toBe(0);
  });

  it("devolve zeros (e não nulo nem erro) quando não há mesa aberta", async () => {
    // 10:00 de 09/10: nada foi aberto ainda.
    const r = await banco.query<MesasAbertas>(CONSULTA, [
      fixture.restauranteA,
      "2026-10-09 10:00:00-03:00",
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.quantidade).toBe(0);
    expect(r.rows[0]?.pessoas_na_casa).toBe(0);
    expect(Number(r.rows[0]?.valor_em_aberto)).toBe(0);
  });

  it("devolve dinheiro como texto, nunca como número", async () => {
    const r = await banco.query<MesasAbertas>(CONSULTA, [
      fixture.restauranteA,
      AGORA_DO_EXEMPLO,
    ]);
    expect(typeof r.rows[0]?.valor_em_aberto).toBe("string");
  });

  it("o dono da casa A lê as mesas da casa A", async () => {
    const r = await comoAutenticado(banco, fixture.usuarioA, () =>
      banco.query<MesasAbertas>(CONSULTA, [
        fixture.restauranteA,
        AGORA_DO_EXEMPLO,
      ])
    );
    expect(r.rows[0]).toEqual({
      quantidade: 1,
      valor_em_aberto: "165.00",
      pessoas_na_casa: 2,
    });
  });

  it("isolamento: o dono da casa B não lê as mesas da casa A (a RLS devolve tudo zero)", async () => {
    const r = await comoAutenticado(banco, fixture.usuarioB, () =>
      banco.query<MesasAbertas>(CONSULTA, [
        fixture.restauranteA,
        AGORA_DO_EXEMPLO,
      ])
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.quantidade).toBe(0);
    expect(r.rows[0]?.pessoas_na_casa).toBe(0);
    expect(Number(r.rows[0]?.valor_em_aberto)).toBe(0);
  });

  it("isolamento: quem tem login mas nenhum acesso também não lê a casa A", async () => {
    const r = await comoAutenticado(banco, fixture.usuarioSemAcesso, () =>
      banco.query<MesasAbertas>(CONSULTA, [
        fixture.restauranteA,
        AGORA_DO_EXEMPLO,
      ])
    );
    expect(r.rows[0]?.quantidade).toBe(0);
    expect(Number(r.rows[0]?.valor_em_aberto)).toBe(0);
  });

  it("o admin da Repply lê a casa A (ver o painel do cliente, D-38)", async () => {
    const r = await comoAutenticado(banco, fixture.admin, () =>
      banco.query<MesasAbertas>(CONSULTA, [
        fixture.restauranteA,
        AGORA_DO_EXEMPLO,
      ])
    );
    expect(r.rows[0]).toEqual({
      quantidade: 1,
      valor_em_aberto: "165.00",
      pessoas_na_casa: 2,
    });
  });

  it("a casa B, sem nenhum dado, devolve zeros mesmo para o próprio dono", async () => {
    const r = await comoAutenticado(banco, fixture.usuarioB, () =>
      banco.query<MesasAbertas>(CONSULTA, [
        fixture.restauranteB,
        AGORA_DO_EXEMPLO,
      ])
    );
    expect(r.rows[0]?.quantidade).toBe(0);
    expect(Number(r.rows[0]?.valor_em_aberto)).toBe(0);
  });
});
