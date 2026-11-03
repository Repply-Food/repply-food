// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  enviar,
  limparFixture,
} from "../helpers/supabase-local";
import { fixtures } from "./fixtures-v2";

describe("entradas v2 por HTTP", () => {
  let db: Client;
  let casa: Fixture;
  beforeEach(async () => {
    db = await conectarBanco();
    casa = await criarFixture(db);
  });
  afterEach(async () => {
    try {
      if (casa) await limparFixture(db, casa);
    } finally {
      await db?.end();
    }
  });

  it("reconcilia ausência, restaura a conta e preserva a outra casa", async () => {
    const original = { ...fixtures[0], id_envio: randomUUID() };
    expect((await enviar(casa.tokenA, original)).status).toBe(200);
    expect(
      (await enviar(casa.tokenB, { ...original, id_envio: randomUUID() }))
        .status
    ).toBe(200);
    const vazia = {
      ...original,
      id_envio: randomUUID(),
      sequencia: "2",
      dados: [],
      total_registros: 0,
    };
    expect((await enviar(casa.tokenA, vazia)).status).toBe(429);
    await db.query(
      "update public.cargas_scc set publicada_em = now() - interval '21 seconds' where restaurante_id = $1 and estado = 'publicada'",
      [casa.restauranteA]
    );
    expect((await enviar(casa.tokenA, vazia)).status).toBe(200);
    const linhas = await db.query(
      "select restaurante_id, removida_em is not null as removida from public.entradas where restaurante_id = any($1::uuid[])",
      [casa.idsRestaurantes]
    );
    expect(linhas.rows).toEqual(
      expect.arrayContaining([
        { restaurante_id: casa.restauranteA, removida: true },
        { restaurante_id: casa.restauranteB, removida: false },
      ])
    );
    await db.query(
      "update public.cargas_scc set publicada_em = now() - interval '21 seconds' where restaurante_id = $1 and estado = 'publicada'",
      [casa.restauranteA]
    );
    expect(
      (
        await enviar(casa.tokenA, {
          ...original,
          id_envio: randomUUID(),
          sequencia: "3",
        })
      ).status
    ).toBe(200);
    const restaurada = await db.query(
      "select removida_em from public.entradas where restaurante_id=$1",
      [casa.restauranteA]
    );
    expect(restaurada.rows[0]?.removida_em).toBeNull();
  });

  it("atualiza sinal somente ao publicar entradas e mantém recibo na repetição", async () => {
    const cadastro = { ...fixtures[1], id_envio: randomUUID() };
    const cadastroResposta = await enviar(casa.tokenA, cadastro);
    expect(cadastroResposta.status).toBe(200);
    const cadastroRecibo = await cadastroResposta.json();
    expect(cadastroRecibo.revisao).toBe(1);
    const antes = await db.query(
      "select ultimo_envio_ok_em from public.sinal_de_vida where restaurante_id=$1",
      [casa.restauranteA]
    );
    expect(antes.rows[0]?.ultimo_envio_ok_em ?? null).toBeNull();
    const entradas = { ...fixtures[0], id_envio: randomUUID() };
    const primeira = await (await enviar(casa.tokenA, entradas)).json();
    expect(primeira).toMatchObject({
      estado: "publicada",
      id_envio: entradas.id_envio,
      sequencia: "1",
      repetida: false,
    });
    expect(primeira.revisao).toBe(2);
    const sinal = await db.query(
      "select ultimo_envio_ok_em from public.sinal_de_vida where restaurante_id=$1",
      [casa.restauranteA]
    );
    expect(sinal.rows[0]?.ultimo_envio_ok_em).not.toBeNull();
    const repetida = await (await enviar(casa.tokenA, entradas)).json();
    expect(repetida).toEqual({ ...primeira, repetida: true });
    const depois = await db.query(
      "select ultimo_envio_ok_em from public.sinal_de_vida where restaurante_id=$1",
      [casa.restauranteA]
    );
    expect(depois.rows).toEqual(sinal.rows);
    const revisao = await db.query(
      "select revisao from public.revisoes_scc where restaurante_id=$1",
      [casa.restauranteA]
    );
    expect(revisao.rows[0]?.revisao).toBe("2");
    expect(await (await enviar(casa.tokenA, cadastro)).json()).toMatchObject({
      revisao: 1,
      repetida: true,
    });
  });

  it("controla falha inesperada do banco sem expor mensagem ou persistir página", async () => {
    const nome = `falha_${randomUUID().replaceAll("-", "")}`;
    await db.query(
      `create function pg_temp.${nome}() returns trigger language plpgsql as $$ begin raise exception 'segredo ficticio SQL'; end $$`
    );
    await db.query(
      `create trigger ${nome} before insert on public.entradas for each row when (new.restaurante_id = '${casa.restauranteA}'::uuid) execute function pg_temp.${nome}()`
    );
    try {
      const resposta = await enviar(casa.tokenA, {
        ...fixtures[0],
        id_envio: randomUUID(),
      });
      expect(resposta.status).toBe(500);
      expect(await resposta.json()).toEqual({
        ok: false,
        erro: "erro interno",
      });
      const linhas = await db.query(
        "select count(*)::int as total from public.cargas_scc where restaurante_id=$1",
        [casa.restauranteA]
      );
      expect(linhas.rows[0]?.total).toBe(0);
    } finally {
      await db.query(`drop trigger ${nome} on public.entradas`);
    }
  });
});
