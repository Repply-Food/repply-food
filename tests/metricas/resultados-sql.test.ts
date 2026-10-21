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

describe("Métricas de Resultados no PostgreSQL", () => {
  let banco: Client = undefined as never;
  let fixture: Fixture = undefined as never;

  beforeEach(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);

    // Setup de dados conforme o brief:
    // Uma conta de 1200 + 120 taxa paga restaurante A
    // Uma conta de 1200 + 120 taxa paga restaurante A (consecutiva)
    // Uma conta removida
    // Uma conta aberta (não paga)
    const entradasA = [
      entrada(101, {
        DataEntrada: "2026-10-18",
        HoraEntrada: "12:00:00",
        DataSaida: "2026-10-18",
        HoraSaida: "13:00:00",
        ValorItens: 1200,
        TaxaServico: 120,
        ValorConsumido: 1320,
        Pago: "Sim",
        NumeroOcupantes: 2,
        TipoOcupacao: "Mesa",
        CodGarcon: 10,
        codOperadorDesab: 1,
        ValorDescontos: 120,
      }),
      entrada(102, {
        DataEntrada: "2026-10-18",
        HoraEntrada: "13:30:00",
        DataSaida: "2026-10-18",
        HoraSaida: "14:30:00",
        ValorItens: 1200,
        TaxaServico: 120,
        ValorConsumido: 1320,
        Pago: "Sim",
        NumeroOcupantes: 2,
        TipoOcupacao: "Mesa",
        CodGarcon: 11,
      }),
      entrada(103, {
        DataEntrada: "2026-10-18",
        HoraEntrada: "15:00:00",
        DataSaida: "2026-10-18",
        HoraSaida: "16:00:00",
        ValorItens: 500,
        TaxaServico: 50,
        ValorConsumido: 550,
        Pago: "Sim",
        NumeroOcupantes: 1,
        TipoOcupacao: "Balcão",
      }),
      entrada(104, {
        // Aberta
        DataEntrada: "2026-10-18",
        HoraEntrada: "17:00:00",
        DataSaida: null,
        HoraSaida: null,
        ValorItens: 100,
        TaxaServico: 10,
        ValorConsumido: 110,
        Pago: "Não",
      }),
      // Dados para comparação 'semana' (últimas 4 ocorrências com movimento)
      // Precisamos de pelo menos 4 domingos anteriores com faturamento.
      // 2026-10-18 é domingo. Domingos anteriores: 10-11, 10-04, 09-27, 09-20.
      // O brief pede média por dia -> soma. Se cada um teve 3000, soma da média é 3000.
      entrada(201, {
        DataEntrada: "2026-10-11",
        DataSaida: "2026-10-11",
        ValorItens: 3000,
        ValorConsumido: 3000,
        TaxaServico: 0,
        Pago: "Sim",
        NumeroOcupantes: 10,
      }),
      entrada(202, {
        DataEntrada: "2026-10-04",
        DataSaida: "2026-10-04",
        ValorItens: 3000,
        ValorConsumido: 3000,
        TaxaServico: 0,
        Pago: "Sim",
        NumeroOcupantes: 10,
      }),
      entrada(203, {
        DataEntrada: "2026-09-27",
        DataSaida: "2026-09-27",
        ValorItens: 3000,
        ValorConsumido: 3000,
        TaxaServico: 0,
        Pago: "Sim",
        NumeroOcupantes: 10,
      }),
      entrada(204, {
        DataEntrada: "2026-09-20",
        DataSaida: "2026-09-20",
        ValorItens: 3000,
        ValorConsumido: 3000,
        TaxaServico: 0,
        Pago: "Sim",
        NumeroOcupantes: 10,
      }),
    ];

    await banco.query("select public.processar_envio($1, $2::jsonb)", [
      fixture.restauranteA,
      JSON.stringify(envelope(entradasA)),
    ]);

    // Removida
    await banco.query(
      "update public.entradas set removida_em = now() where restaurante_id = $1 and cod_entrada = 103",
      [fixture.restauranteA]
    );

    // Restaurante B
    const entradasB = [
      entrada(901, {
        DataEntrada: "2026-10-18",
        DataSaida: "2026-10-18",
        ValorItens: 5000,
        Pago: "Sim",
      }),
    ];
    await banco.query("select public.processar_envio($1, $2::jsonb)", [
      fixture.restauranteB,
      JSON.stringify(envelope(entradasB)),
    ]);
  });

  afterEach(async () => {
    if (fixture) await limparFixture(banco, fixture);
    if (banco) await banco.end();
  });

  it("separa taxa do faturamento e exclui removida ou não paga", async () => {
    const { rows } = await banco.query(
      "select * from public.metrica_resultados_resumo($1, $2, $3, 'anterior')",
      [fixture.restauranteA, "2026-10-17", "2026-10-23"]
    );
    // Esperado: 1200 + 1200 = 2400 faturamento. Taxa: 120 + 120 = 240.
    // E103 removida, E104 não paga.
    expect(rows[0]).toMatchObject({
      faturamento: "2400.00",
      taxa_servico: "240.00",
    });
  });

  it("soma a média das quatro ocorrências por dia selecionado", async () => {
    // 2026-10-18 é um dia selecionado. Tem 4 ocorrências anteriores com 3000 cada.
    // Média = 3000. Soma das médias dos dias selecionados = 3000.
    const { rows } = await banco.query(
      "select * from public.metrica_resultados_resumo($1, '2026-10-17', '2026-10-18', 'semana')",
      [fixture.restauranteA]
    );
    expect(rows[0].referencia_faturamento).toBe("3000.00");
    expect(rows[0]).toMatchObject({
      referencia_pessoas: "10.00",
      referencia_ticket_pessoa: "300.00",
    });
  });

  it("rejeita intervalos invertidos ou maiores que 90 dias em todas as RPCs", async () => {
    const rpcs = [
      "metrica_resultados_resumo",
      "metrica_resultados_vendas_diarias",
      "metrica_resultados_ocupacao",
      "metrica_resultados_horas",
      "metrica_resultados_mapa_calor",
      "metrica_resultados_turnos",
      "metrica_resultados_equipe",
      "metrica_resultados_descontos",
    ];

    for (const [inicio, fim] of [
      ["2026-01-01", "2026-04-01"],
      ["2026-10-20", "2026-10-19"],
    ]) {
      for (const rpc of rpcs) {
        const chamada =
          rpc === "metrica_resultados_resumo"
            ? `select * from public.${rpc}($1, $2, $3, 'anterior')`
            : `select * from public.${rpc}($1, $2, $3)`;
        await expect(
          comoAutenticado(banco, fixture.usuarioA, () =>
            banco.query(chamada, [fixture.restauranteA, inicio, fim])
          )
        ).rejects.toMatchObject({ code: "22023" });
      }
    }
  });

  it("aceita os 90 dias inclusivos nas RPCs", async () => {
    const { rows } = await banco.query(
      "select * from public.metrica_resultados_resumo($1, '2026-07-21', '2026-10-18', 'anterior')",
      [fixture.restauranteA]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].faturamento).toBe("14400.00");
  });

  it("retorna as quebras atuais ordenadas, incluindo descontos sem operador", async () => {
    const periodo = [fixture.restauranteA, "2026-10-17", "2026-10-23"];
    const resumo = await banco.query(
      "select * from public.metrica_resultados_resumo($1, $2, $3, 'anterior')",
      periodo
    );
    expect(resumo.rows[0]).toMatchObject({
      descontos_total: "120.00",
      percentual_descontos: "0.0500",
    });

    const vendas = await banco.query(
      "select * from public.metrica_resultados_vendas_diarias($1, $2, $3)",
      periodo
    );
    expect(
      vendas.rows.map((venda) => ({
        ...venda,
        dia_operacao: venda.dia_operacao.toISOString(),
      }))
    ).toContainEqual({
      dia_operacao: "2026-10-19T03:00:00.000Z",
      faturamento: "0",
      taxa_servico: "0",
    });
    expect(
      vendas.rows.map((venda) => ({
        ...venda,
        dia_operacao: venda.dia_operacao.toISOString(),
      }))
    ).toContainEqual({
      dia_operacao: "2026-10-18T03:00:00.000Z",
      faturamento: "2400.00",
      taxa_servico: "240.00",
    });

    const ocupacao = await banco.query(
      "select * from public.metrica_resultados_ocupacao($1, $2, $3)",
      periodo
    );
    expect(ocupacao.rows).toEqual([
      { tipo: "Mesa", faturamento: "2400.00", participacao: "1.0000" },
    ]);
    const horas = await banco.query(
      "select * from public.metrica_resultados_horas($1, $2, $3)",
      periodo
    );
    expect(horas.rows).toEqual([
      { hora: 12, faturamento: "1200.00" },
      { hora: 13, faturamento: "1200.00" },
    ]);
    const turnos = await banco.query(
      "select * from public.metrica_resultados_turnos($1, $2, $3)",
      periodo
    );
    expect(turnos.rows).toEqual([
      {
        turno: "Almoço",
        faturamento: "2400.00",
        contas: 2,
        permanencia_media: { hours: 1 },
      },
    ]);
    const equipe = await banco.query(
      "select * from public.metrica_resultados_equipe($1, $2, $3)",
      periodo
    );
    expect(equipe.rows[0]).toMatchObject({
      cod_garcom: 10,
      faturamento: "1200.00",
      contas: 1,
      pessoas: 2,
      taxa_servico: "120.00",
    });
    const descontos = await banco.query(
      "select * from public.metrica_resultados_descontos($1, $2, $3)",
      periodo
    );
    expect(descontos.rows).toEqual([
      { cod_operador_fechamento: 1, descontos: "120.00" },
      { cod_operador_fechamento: null, descontos: "0.00" },
    ]);
    const mapa = await banco.query(
      "select * from public.metrica_resultados_mapa_calor($1, $2, $3)",
      periodo
    );
    expect(mapa.rows).toContainEqual({
      dia_semana: 0,
      hora: 12,
      media_contas: "1.00",
    });
  });

  it("mantém o mínimo de duas ocorrências e soma as médias dos dias com movimento", async () => {
    const gravar = async (entradas: ReturnType<typeof entrada>[]) => {
      await banco.query("select public.processar_envio($1, $2::jsonb)", [
        fixture.restauranteA,
        JSON.stringify(envelope(entradas)),
      ]);
    };
    await gravar([
      entrada(301, {
        DataEntrada: "2026-10-20",
        DataSaida: "2026-10-20",
        ValorConsumido: 500,
        TaxaServico: 0,
      }),
      entrada(302, {
        DataEntrada: "2026-10-13",
        DataSaida: "2026-10-13",
        ValorConsumido: 500,
        TaxaServico: 0,
      }),
      entrada(303, {
        DataEntrada: "2026-10-19",
        DataSaida: "2026-10-19",
        ValorConsumido: 1000,
        TaxaServico: 0,
      }),
      entrada(304, {
        DataEntrada: "2026-10-12",
        DataSaida: "2026-10-12",
        ValorConsumido: 1000,
        TaxaServico: 0,
      }),
      entrada(305, {
        DataEntrada: "2026-10-05",
        DataSaida: "2026-10-05",
        ValorConsumido: 1000,
        TaxaServico: 0,
      }),
    ]);
    const insuficiente = await banco.query(
      "select * from public.metrica_resultados_resumo($1, '2026-10-20', '2026-10-20', 'semana')",
      [fixture.restauranteA]
    );
    expect(insuficiente.rows[0].referencia_faturamento).toBeNull();
    const doisDias = await banco.query(
      "select * from public.metrica_resultados_resumo($1, '2026-10-18', '2026-10-19', 'semana')",
      [fixture.restauranteA]
    );
    expect(doisDias.rows[0].referencia_faturamento).toBe("4000.00");
    await gravar([
      entrada(306, {
        DataEntrada: "2026-09-28",
        DataSaida: "2026-09-28",
        ValorConsumido: 900,
        TaxaServico: 0,
      }),
    ]);
    const tresOcorrencias = await banco.query(
      "select * from public.metrica_resultados_resumo($1, '2026-10-19', '2026-10-19', 'semana')",
      [fixture.restauranteA]
    );
    expect(tresOcorrencias.rows[0].referencia_faturamento).toBe("966.67");
  });

  it("usa somente as quatro ocorrências semanais mais recentes", async () => {
    await banco.query("select public.processar_envio($1, $2::jsonb)", [
      fixture.restauranteA,
      JSON.stringify(
        envelope([
          entrada(351, {
            DataEntrada: "2026-11-03",
            DataSaida: "2026-11-03",
            ValorConsumido: 500,
            TaxaServico: 0,
          }),
          entrada(352, {
            DataEntrada: "2026-10-27",
            DataSaida: "2026-10-27",
            ValorConsumido: 400,
            TaxaServico: 0,
          }),
          entrada(353, {
            DataEntrada: "2026-10-20",
            DataSaida: "2026-10-20",
            ValorConsumido: 300,
            TaxaServico: 0,
          }),
          entrada(354, {
            DataEntrada: "2026-10-13",
            DataSaida: "2026-10-13",
            ValorConsumido: 200,
            TaxaServico: 0,
          }),
          entrada(355, {
            DataEntrada: "2026-10-06",
            DataSaida: "2026-10-06",
            ValorConsumido: 100,
            TaxaServico: 0,
          }),
          entrada(356, {
            DataEntrada: "2026-09-29",
            DataSaida: "2026-09-29",
            ValorConsumido: 9999,
            TaxaServico: 0,
          }),
        ])
      ),
    ]);

    const { rows } = await banco.query(
      "select * from public.metrica_resultados_resumo($1, '2026-11-03', '2026-11-03', 'semana')",
      [fixture.restauranteA]
    );

    expect(rows[0].referencia_faturamento).toBe("250.00");
  });

  it("aplica período anterior, virada, turnos e permanência válidos", async () => {
    await banco.query(
      'update public.restaurantes set turnos = \'{"almoco_ate": "13:00"}\'::jsonb where id = $1',
      [fixture.restauranteA]
    );
    await banco.query("select public.processar_envio($1, $2::jsonb)", [
      fixture.restauranteA,
      JSON.stringify(
        envelope([
          entrada(401, {
            DataEntrada: "2026-10-17",
            DataSaida: "2026-10-17",
            ValorConsumido: 400,
            TaxaServico: 0,
          }),
          entrada(402, {
            DataEntrada: "2026-10-18",
            HoraEntrada: "04:59:00",
            DataSaida: "2026-10-18",
            HoraSaida: "05:30:00",
            ValorConsumido: 100,
            TaxaServico: 0,
          }),
          entrada(403, {
            DataEntrada: "2026-10-18",
            HoraEntrada: "13:30:00",
            DataSaida: "2026-10-18",
            HoraSaida: "12:30:00",
            ValorConsumido: 200,
            TaxaServico: 0,
            TipoOcupacao: "Entrega",
          }),
        ])
      ),
    ]);
    const anterior = await banco.query(
      "select * from public.metrica_resultados_resumo($1, '2026-10-18', '2026-10-19', 'anterior')",
      [fixture.restauranteA]
    );
    expect(anterior.rows[0].referencia_faturamento).toBe("500.00");
    const vendas = await banco.query(
      "select * from public.metrica_resultados_vendas_diarias($1, '2026-10-17', '2026-10-18')",
      [fixture.restauranteA]
    );
    expect(
      vendas.rows.find((linha) =>
        linha.dia_operacao.toISOString().startsWith("2026-10-17")
      )?.faturamento
    ).toBe("500.00");
    const ocupacao = await banco.query(
      "select * from public.metrica_resultados_ocupacao($1, '2026-10-18', '2026-10-18')",
      [fixture.restauranteA]
    );
    expect(ocupacao.rows).toContainEqual({
      tipo: "Outros",
      faturamento: "200.00",
      participacao: "0.0769",
    });
    const turnos = await banco.query(
      "select * from public.metrica_resultados_turnos($1, '2026-10-18', '2026-10-18')",
      [fixture.restauranteA]
    );
    expect(turnos.rows.find((linha) => linha.turno === "Jantar")).toMatchObject(
      { contas: 2, permanencia_media: { hours: 1 } }
    );
  });

  it("deixa participação nula quando o faturamento líquido total é zero", async () => {
    await banco.query("select public.processar_envio($1, $2::jsonb)", [
      fixture.restauranteA,
      JSON.stringify(
        envelope([
          entrada(501, {
            DataEntrada: "2026-10-24",
            DataSaida: "2026-10-24",
            ValorConsumido: 100,
            TaxaServico: 100,
            TipoOcupacao: "Mesa",
          }),
          entrada(502, {
            DataEntrada: "2026-10-24",
            DataSaida: "2026-10-24",
            ValorConsumido: 50,
            TaxaServico: 50,
            TipoOcupacao: "Entrega",
          }),
        ])
      ),
    ]);
    const { rows } = await banco.query(
      "select * from public.metrica_resultados_ocupacao($1, '2026-10-24', '2026-10-24')",
      [fixture.restauranteA]
    );
    expect(rows).toEqual([
      { tipo: "Mesa", faturamento: "0.00", participacao: null },
      { tipo: "Outros", faturamento: "0.00", participacao: null },
    ]);
  });

  it("admin só lê B pelo mesmo ID selecionado no painel", async () => {
    const resultado = await comoAutenticado(banco, fixture.admin, () =>
      banco.query(
        "select * from public.metrica_resultados_resumo($1, $2, $3, 'anterior')",
        [fixture.restauranteB, "2026-10-17", "2026-10-23"]
      )
    );
    expect(resultado.rows).toHaveLength(1);
    expect(resultado.rows[0].faturamento).toBe("100.00");
  });

  it("isolamento: dono de A não vê dados de B", async () => {
    const rpcs = [
      "metrica_resultados_resumo",
      "metrica_resultados_vendas_diarias",
      "metrica_resultados_ocupacao",
      "metrica_resultados_horas",
      "metrica_resultados_mapa_calor",
      "metrica_resultados_turnos",
      "metrica_resultados_equipe",
      "metrica_resultados_descontos",
    ];

    for (const rpc of rpcs) {
      const args =
        rpc === "metrica_resultados_resumo"
          ? [fixture.restauranteB, "2026-10-17", "2026-10-23", "anterior"]
          : [fixture.restauranteB, "2026-10-17", "2026-10-23"];

      const { rows } = await comoAutenticado(banco, fixture.usuarioA, () =>
        banco.query(
          `select * from public.${rpc}($1, $2, $3${rpc === "metrica_resultados_resumo" ? ", $4" : ""})`,
          args
        )
      );

      // Deve retornar zero linhas ou uma linha agregada vazia/zeros
      if (rows.length > 0) {
        // Se retornar uma linha (resumo), os valores devem ser zero/nulos
        const row = rows[0];
        for (const key in row) {
          if (typeof row[key] === "string" && !Number.isNaN(Number(row[key]))) {
            expect(Number(row[key])).toBe(0);
          } else if (typeof row[key] === "number") {
            expect(row[key]).toBe(0);
          }
        }
      }
    }
  });
});
