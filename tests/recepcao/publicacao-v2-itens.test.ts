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

describe("publicação de itens vendidos SCC", () => {
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

  it("substitui somente fotografia completa do escopo, preserva fontes e aceita vazio", async () => {
    const receber = (casa: string, p: unknown) =>
      banco.query<{ recibo: { estado: string; repetida: boolean } }>(
        "select public.receber_pagina_scc_v2($1,$2::jsonb) as recibo",
        [casa, JSON.stringify(p)]
      );
    const inicial = {
      ...fixtures[2],
      id_envio: randomUUID(),
      recursos: ["pdv"],
    };
    const historico = {
      ...inicial,
      id_envio: randomUUID(),
      fonte: "historico",
    };
    const outra = { ...inicial, id_envio: randomUUID() };
    expect(
      (await receber(casas.restauranteA, inicial)).rows[0]?.recibo.estado
    ).toBe("publicada");
    await receber(casas.restauranteA, historico);
    await receber(casas.restauranteB, outra);
    const primeira = {
      ...inicial,
      id_envio: randomUUID(),
      sequencia: "2",
      pagina: { numero: 1, total: 2 },
      total_registros: 2,
      dados: [{ ...inicial.dados[0], produto: "Água histórica", vendas: "3" }],
    };
    const segunda = {
      ...primeira,
      pagina: { numero: 2, total: 2 },
      dados: [{ ...primeira.dados[0], ordinal: 2, codigo_produto: "2" }],
    };
    expect(
      (await receber(casas.restauranteA, primeira)).rows[0]?.recibo.estado
    ).toBe("recebendo");
    let { rows } = await banco.query(
      "select produto from public.itens_vendidos_scc where restaurante_id=$1 and fonte='online'",
      [casas.restauranteA]
    );
    expect(rows).toEqual([{ produto: "Água" }]);
    const publicado = (await receber(casas.restauranteA, segunda)).rows[0]
      ?.recibo;
    expect(publicado).toMatchObject({ estado: "publicada", repetida: false });
    expect(
      (await receber(casas.restauranteA, segunda)).rows[0]?.recibo
    ).toEqual({ ...publicado, repetida: true });
    rows = (
      await banco.query(
        "select produto from public.itens_vendidos_scc where restaurante_id=$1 and fonte='online' order by ordinal",
        [casas.restauranteA]
      )
    ).rows;
    expect(rows).toEqual([
      { produto: "Água histórica" },
      { produto: "Água histórica" },
    ]);
    const vazia = {
      ...inicial,
      id_envio: randomUUID(),
      sequencia: "3",
      dados: [],
      total_registros: 0,
    };
    expect(
      (await receber(casas.restauranteA, vazia)).rows[0]?.recibo.estado
    ).toBe("publicada");
    const resultado = await banco.query<{
      fonte: string;
      quantidade: number;
      recursos: string[];
    }>(
      "select fonte,quantidade,recursos from public.fotografias_scc where restaurante_id=$1 order by fonte",
      [casas.restauranteA]
    );
    expect(resultado.rows).toEqual([
      { fonte: "historico", quantidade: 1, recursos: ["pdv"] },
      { fonte: "online", quantidade: 0, recursos: ["pdv"] },
    ]);
    expect(
      (
        await banco.query(
          "select * from public.itens_vendidos_scc where restaurante_id=$1",
          [casas.restauranteB]
        )
      ).rows
    ).toHaveLength(1);
    const revisao = await banco.query<{ revisao: string }>(
      "select revisao::text from public.revisoes_scc where restaurante_id=$1",
      [casas.restauranteA]
    );
    expect(revisao.rows[0]?.revisao).toBe("4");
  });

  it("reverte substituição e revisão quando a segunda linha falha", async () => {
    const fixture = await criarFixture(banco);
    const receber = (p: unknown) =>
      banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
        fixture.restauranteA,
        JSON.stringify(p),
      ]);
    try {
      const inicial = { ...fixtures[2], id_envio: randomUUID() };
      await receber(inicial);
      await banco.query("begin");
      try {
        await banco.query(`create function pg_temp.falhar_item_v2() returns trigger language plpgsql as $$
          begin if new.codigo_produto='999' then raise exception 'falha_item_teste'; end if; return new; end $$`);
        await banco.query(
          "create trigger falhar_item_v2 before insert on public.itens_vendidos_scc for each row execute function pg_temp.falhar_item_v2()"
        );
        const correcao = {
          ...inicial,
          id_envio: randomUUID(),
          sequencia: "2",
          total_registros: 2,
          dados: [
            { ...inicial.dados[0], produto: "Alterado" },
            { ...inicial.dados[0], codigo_produto: "999", ordinal: 2 },
          ],
        };
        await expect(receber(correcao)).rejects.toMatchObject({
          message: "falha_item_teste",
        });
      } finally {
        await banco.query("rollback");
      }
      const { rows } = await banco.query<{
        produto: string;
        id_envio: string;
        sequencia: string;
        revisao: string;
      }>(
        `select i.produto,f.id_envio,c.sequencia::text,r.revisao::text from public.itens_vendidos_scc i
         join public.fotografias_scc f using(restaurante_id,tipo_envio,dia_movimento,fonte)
         join public.cursores_scc c on c.restaurante_id=i.restaurante_id and c.tipo_envio=i.tipo_envio
         join public.revisoes_scc r on r.restaurante_id=i.restaurante_id where i.restaurante_id=$1`,
        [fixture.restauranteA]
      );
      expect(rows).toEqual([
        {
          produto: "Água",
          id_envio: inicial.id_envio,
          sequencia: "1",
          revisao: "1",
        },
      ]);
    } finally {
      await limparFixture(banco, fixture);
    }
  });

  it("não substitui a fotografia anterior quando uma página em staging é adulterada", async () => {
    const fixture = await criarFixture(banco);
    const receber = (p: unknown) =>
      banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
        fixture.restauranteA,
        JSON.stringify(p),
      ]);
    try {
      const inicial = { ...fixtures[2], id_envio: randomUUID() };
      await receber(inicial);
      const parcial = {
        ...inicial,
        id_envio: randomUUID(),
        sequencia: "2",
        pagina: { numero: 1, total: 2 },
        total_registros: 2,
      };
      await receber(parcial);
      await banco.query(
        "update public.paginas_scc set dados=null where restaurante_id=$1 and id_envio=$2 and numero=1",
        [fixture.restauranteA, parcial.id_envio]
      );
      await expect(
        receber({
          ...parcial,
          pagina: { numero: 2, total: 2 },
          dados: [{ ...parcial.dados[0], ordinal: 2 }],
        })
      ).rejects.toMatchObject({ code: "PR422", message: "carga_scc_invalida" });
      const { rows } = await banco.query<{
        id_envio: string;
        revisao: string;
        produto: string;
      }>(
        `select f.id_envio,r.revisao::text,i.produto from public.fotografias_scc f
         join public.revisoes_scc r using(restaurante_id) join public.itens_vendidos_scc i using(restaurante_id,tipo_envio,dia_movimento,fonte)
         where f.restaurante_id=$1`,
        [fixture.restauranteA]
      );
      expect(rows).toEqual([
        { id_envio: inicial.id_envio, revisao: "1", produto: "Água" },
      ]);
    } finally {
      await limparFixture(banco, fixture);
    }
  });
});
