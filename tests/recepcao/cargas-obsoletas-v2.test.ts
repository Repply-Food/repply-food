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

describe("expiração de cargas obsoletas SCC", () => {
  let banco: Client;
  let publicador: Client;
  let antigo: Client;
  let casas: Fixture;
  beforeAll(async () => {
    banco = await conectarBanco();
    casas = await criarFixture(banco);
    [publicador, antigo] = await Promise.all([
      conectarBanco(),
      conectarBanco(),
    ]);
  });
  afterAll(async () => {
    await Promise.all([publicador?.end(), antigo?.end()]);
    try {
      if (casas) await limparFixture(banco, casas);
    } finally {
      await banco?.end();
    }
  });
  it("serializa publicação nova com retentativa antiga e isola casas e escopos", async () => {
    const inicial = { ...fixtures[2], id_envio: randomUUID() };
    const parcial = {
      ...inicial,
      id_envio: randomUUID(),
      sequencia: "2",
      pagina: { numero: 1, total: 2 },
      total_registros: 2,
    };
    const novo = { ...inicial, id_envio: randomUUID(), sequencia: "3" };
    const historico = {
      ...parcial,
      id_envio: randomUUID(),
      fonte: "historico",
    };
    const outroTipo = {
      ...fixtures[3],
      id_envio: randomUUID(),
      sequencia: "2",
      pagina: { numero: 1, total: 2 },
      total_registros: 2,
    };
    const outraCasa = { ...parcial, id_envio: randomUUID() };
    const receber = (cliente: Client, casa: string, p: unknown) =>
      cliente.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
        casa,
        JSON.stringify(p),
      ]);
    await receber(banco, casas.restauranteA, inicial);
    await receber(banco, casas.restauranteA, parcial);
    await receber(banco, casas.restauranteA, historico);
    await receber(banco, casas.restauranteA, outroTipo);
    await receber(banco, casas.restauranteB, outraCasa);
    const antes = await banco.query(
      "select recibo from public.cargas_scc where restaurante_id=$1 and id_envio=$2",
      [casas.restauranteA, inicial.id_envio]
    );
    await publicador.query("begin");
    let pendente: Promise<unknown> | undefined;
    try {
      await receber(publicador, casas.restauranteA, novo);
      const { rows: conexao } = await antigo.query<{ pid: number }>(
        "select pg_backend_pid() as pid"
      );
      pendente = receber(antigo, casas.restauranteA, parcial).then(
        () => null,
        (erro: unknown) => erro
      );
      let bloqueado = false;
      for (let i = 0; i < 50; i++) {
        const result = await banco.query<{ bloqueado: boolean }>(
          "select cardinality(pg_blocking_pids($1))>0 as bloqueado",
          [conexao[0]?.pid]
        );
        if (result.rows[0]?.bloqueado) {
          bloqueado = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(bloqueado).toBe(true);
      await publicador.query("commit");
      expect(await pendente).toMatchObject({ code: "PR409" });
    } finally {
      await publicador.query("rollback");
      if (pendente) await pendente;
    }
    const { rows } = await banco.query<{
      id_envio: string;
      estado: string;
      dados: unknown;
    }>(
      `select c.id_envio,c.estado,p.dados from public.cargas_scc c
       join public.paginas_scc p using(restaurante_id,id_envio)
       where c.id_envio=any($1::uuid[]) order by c.id_envio`,
      [
        [
          parcial.id_envio,
          historico.id_envio,
          outroTipo.id_envio,
          outraCasa.id_envio,
        ],
      ]
    );
    expect(rows.find((r) => r.id_envio === parcial.id_envio)).toMatchObject({
      estado: "expirada",
      dados: parcial.dados,
    });
    for (const id of [
      historico.id_envio,
      outroTipo.id_envio,
      outraCasa.id_envio,
    ])
      expect(rows.find((r) => r.id_envio === id)?.estado).toBe("recebendo");
    const depois = await banco.query(
      "select recibo from public.cargas_scc where restaurante_id=$1 and id_envio=$2",
      [casas.restauranteA, inicial.id_envio]
    );
    expect(depois.rows).toEqual(antes.rows);
    await expect(
      receber(banco, casas.restauranteA, {
        ...parcial,
        pagina: { numero: 2, total: 2 },
        dados: [{ ...parcial.dados[0], ordinal: 2 }],
      })
    ).rejects.toMatchObject({ code: "PR409" });
  });

  it("reverte expiração se a publicação nova falhar depois do cursor", async () => {
    const fixture = await criarFixture(banco);
    const parcial = {
      ...fixtures[2],
      id_envio: randomUUID(),
      sequencia: "2",
      pagina: { numero: 1, total: 2 },
      total_registros: 2,
    };
    const novo = { ...fixtures[2], id_envio: randomUUID(), sequencia: "3" };
    const receber = (p: unknown) =>
      banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
        fixture.restauranteA,
        JSON.stringify(p),
      ]);
    try {
      await receber(parcial);
      await banco.query("begin");
      try {
        await banco.query(`create function pg_temp.falhar_apos_cursor() returns trigger language plpgsql as $$
          begin if new.sequencia=3 and new.estado='publicada' then raise exception 'falha_depois_cursor'; end if; return new; end $$`);
        await banco.query(
          "create trigger falhar_apos_cursor before update on public.cargas_scc for each row execute function pg_temp.falhar_apos_cursor()"
        );
        await expect(receber(novo)).rejects.toMatchObject({
          message: "falha_depois_cursor",
        });
      } finally {
        await banco.query("rollback");
      }
      const { rows } = await banco.query<{
        estado: string;
        paginas: string;
        cursores: string;
      }>(
        `select c.estado,(select count(*) from public.paginas_scc p where p.restaurante_id=c.restaurante_id and p.id_envio=c.id_envio) as paginas,
          (select count(*) from public.cursores_scc cur where cur.restaurante_id=c.restaurante_id) as cursores
         from public.cargas_scc c where c.restaurante_id=$1 and c.id_envio=$2`,
        [fixture.restauranteA, parcial.id_envio]
      );
      expect(rows).toEqual([
        { estado: "recebendo", paginas: "1", cursores: "0" },
      ]);
    } finally {
      await limparFixture(banco, fixture);
    }
  });

  it.each([0, 1, 2, 3, 4, 5, 6])(
    "expira cargas incompletas do tipo %i ao avançar o cursor",
    async (indice) => {
      const exemplo = fixtures[indice];
      if (!exemplo) throw new Error("fixture ausente");
      await banco.query("begin");
      try {
        const fixture = await criarFixture(banco, { transacaoExterna: true });
        const parcial = {
          ...exemplo,
          id_envio: randomUUID(),
          sequencia: "1",
          pagina: { numero: 1, total: 2 },
          total_registros: 2,
        };
        const nova = { ...exemplo, id_envio: randomUUID(), sequencia: "2" };
        await banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
          fixture.restauranteA,
          JSON.stringify(parcial),
        ]);
        await banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
          fixture.restauranteA,
          JSON.stringify(nova),
        ]);
        const { rows } = await banco.query<{ estado: string; dados: unknown }>(
          "select c.estado,p.dados from public.cargas_scc c join public.paginas_scc p using(restaurante_id,id_envio) where c.restaurante_id=$1 and c.id_envio=$2",
          [fixture.restauranteA, parcial.id_envio]
        );
        expect(rows).toEqual([{ estado: "expirada", dados: parcial.dados }]);
      } finally {
        await banco.query("rollback");
      }
    }
  );
});
