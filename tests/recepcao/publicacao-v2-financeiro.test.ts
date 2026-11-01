// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";
import { fixtures } from "./fixtures-v2";

describe("publicação financeira SCC", () => {
  let banco: Client;
  let casas: Fixture;
  beforeAll(async () => {
    banco = await conectarBanco();
    casas = await criarFixture(banco);
  });
  afterAll(async () => {
    try {
      if (casas) await limparFixture(banco, casas);
    } finally {
      await banco?.end();
    }
  });

  it("publica componentes, totais, meios e público; corrige e esvazia isoladamente", async () => {
    const linha = {
      ...fixtures[7].dados[0],
      componentes: {
        ...fixtures[7].dados[0].componentes,
        consumo: "5.25",
        servico: null,
      },
      totais_oficiais: {
        ...fixtures[7].dados[0].totais_oficiais,
        recebido: "4.50",
      },
      entradas: { ...fixtures[7].dados[0].entradas, abertos: 0 },
      meios: [{ codigo: "01", rotulo: "Pix", classe: "pix", valor: "4.50" }],
      publico: [{ sexo: "nao_informado", categoria: "pagante", quantidade: 3 }],
    };
    const inicial = { ...fixtures[7], id_envio: randomUUID(), dados: [linha] };
    const receber = (casa: string, p: unknown) =>
      banco.query<{ recibo: { estado: string; repetida: boolean } }>(
        "select public.receber_pagina_scc_v2($1,$2::jsonb) as recibo",
        [casa, JSON.stringify(p)]
      );
    const publicado = (await receber(casas.restauranteA, inicial)).rows[0]
      ?.recibo;
    expect(publicado).toMatchObject({ estado: "publicada", repetida: false });
    expect(
      (await receber(casas.restauranteA, inicial)).rows[0]?.recibo
    ).toEqual({ ...publicado, repetida: true });
    await receber(casas.restauranteA, {
      ...inicial,
      id_envio: randomUUID(),
      fonte: "historico",
    });
    await receber(casas.restauranteB, { ...inicial, id_envio: randomUUID() });
    const { rows } = await banco.query(
      "select consumo::text,servico::text,recebido::text,abertos from public.financeiro_scc where restaurante_id=$1 and fonte='online'",
      [casas.restauranteA]
    );
    expect(rows).toEqual([
      { consumo: "5.250000", servico: null, recebido: "4.500000", abertos: 0 },
    ]);
    expect(
      (
        await banco.query(
          "select codigo,valor::text from public.financeiro_meios_scc where restaurante_id=$1 and fonte='online'",
          [casas.restauranteA]
        )
      ).rows
    ).toEqual([{ codigo: "01", valor: "4.500000" }]);
    expect(
      (
        await banco.query(
          "select sexo,categoria,quantidade from public.financeiro_publico_scc where restaurante_id=$1 and fonte='online'",
          [casas.restauranteA]
        )
      ).rows
    ).toEqual([{ sexo: "nao_informado", categoria: "pagante", quantidade: 3 }]);
    const correcao = {
      ...inicial,
      id_envio: randomUUID(),
      sequencia: "2",
      dados: [
        {
          ...linha,
          componentes: { ...linha.componentes, consumo: null },
          meios: [],
          publico: [],
        },
      ],
    };
    await receber(casas.restauranteA, correcao);
    expect(
      (
        await banco.query(
          "select consumo from public.financeiro_scc where restaurante_id=$1 and fonte='online'",
          [casas.restauranteA]
        )
      ).rows
    ).toEqual([{ consumo: null }]);
    await receber(casas.restauranteA, {
      ...inicial,
      id_envio: randomUUID(),
      sequencia: "3",
      dados: [],
      total_registros: 0,
    });
    expect(
      (
        await banco.query(
          "select fonte,quantidade from public.fotografias_scc where restaurante_id=$1 and tipo_envio='financeiro' order by fonte",
          [casas.restauranteA]
        )
      ).rows
    ).toEqual([
      { fonte: "historico", quantidade: 1 },
      { fonte: "online", quantidade: 0 },
    ]);
    expect(
      (
        await banco.query(
          "select * from public.financeiro_scc where restaurante_id=$1 and fonte='online'",
          [casas.restauranteA]
        )
      ).rows
    ).toHaveLength(0);
    expect(
      (
        await banco.query(
          "select * from public.financeiro_scc where restaurante_id=$1",
          [casas.restauranteB]
        )
      ).rows
    ).toHaveLength(1);
  });

  it("reverte fotografia, totais, meios e cursor quando a gravação do público falha", async () => {
    const fixture = await criarFixture(banco);
    const linha = {
      ...fixtures[7].dados[0],
      componentes: { ...fixtures[7].dados[0].componentes, consumo: "5.25" },
      meios: [{ codigo: "01", rotulo: "Pix", classe: "pix", valor: "4.50" }],
      publico: [{ sexo: "nao_informado", categoria: "pagante", quantidade: 3 }],
    };
    const inicial = { ...fixtures[7], id_envio: randomUUID(), dados: [linha] };
    const receber = (p: unknown) =>
      banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
        fixture.restauranteA,
        JSON.stringify(p),
      ]);
    try {
      await receber(inicial);
      await banco.query("begin");
      try {
        await banco.query(`create function pg_temp.falhar_publico_financeiro() returns trigger language plpgsql as $$
          begin raise exception 'falha_financeiro_teste'; end $$`);
        await banco.query(
          "create trigger falhar_publico_financeiro before insert on public.financeiro_publico_scc for each row execute function pg_temp.falhar_publico_financeiro()"
        );
        await expect(
          receber({
            ...inicial,
            id_envio: randomUUID(),
            sequencia: "2",
            dados: [
              { ...linha, componentes: { ...linha.componentes, consumo: "9" } },
            ],
          })
        ).rejects.toMatchObject({ message: "falha_financeiro_teste" });
      } finally {
        await banco.query("rollback");
      }
      const { rows } = await banco.query<{
        id_envio: string;
        consumo: string;
        revisao: string;
        seq: string;
        meios: string;
        publico: string;
      }>(
        `select f.id_envio,fi.consumo::text,r.revisao::text,c.sequencia::text as seq,
         (select count(*) from public.financeiro_meios_scc where restaurante_id=$1) as meios,
         (select count(*) from public.financeiro_publico_scc where restaurante_id=$1) as publico
         from public.fotografias_scc f join public.financeiro_scc fi using(restaurante_id,tipo_envio,dia_movimento,fonte)
         join public.revisoes_scc r using(restaurante_id) join public.cursores_scc c on c.restaurante_id=f.restaurante_id and c.tipo_envio=f.tipo_envio
         where f.restaurante_id=$1`,
        [fixture.restauranteA]
      );
      expect(rows).toEqual([
        {
          id_envio: inicial.id_envio,
          consumo: "5.250000",
          revisao: "1",
          seq: "1",
          meios: "1",
          publico: "1",
        },
      ]);
    } finally {
      await limparFixture(banco, fixture);
    }
  });

  it("recusa mais de uma linha financeira", async () => {
    const pagina = {
      ...fixtures[7],
      id_envio: randomUUID(),
      dados: [fixtures[7].dados[0], fixtures[7].dados[0]],
      total_registros: 2,
    };
    await expect(
      banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
        casas.restauranteA,
        JSON.stringify(pagina),
      ])
    ).rejects.toMatchObject({ code: "PR422" });
  });
});
