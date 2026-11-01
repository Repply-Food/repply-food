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

describe("revalidação transacional antes da publicação SCC", () => {
  let banco: Client;
  let casa: Fixture;

  beforeAll(async () => {
    banco = await conectarBanco();
    casa = await criarFixture(banco);
  });
  afterAll(async () => {
    try {
      if (casa) await limparFixture(banco, casa);
    } finally {
      await banco?.end();
    }
  });

  async function preparar() {
    const id = randomUUID();
    const pagina = {
      ...fixtures[3],
      id_envio: id,
      pagina: { numero: 1, total: 2 },
      total_registros: 2,
    };
    await banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
      casa.restauranteA,
      JSON.stringify(pagina),
    ]);
    const segunda = { ...pagina, pagina: { numero: 2, total: 2 } };
    await banco.query(
      `insert into public.paginas_scc (restaurante_id,id_envio,numero,hash,quantidade,bytes,dados)
      select $1,$2,2,encode(extensions.digest(convert_to(($3::jsonb->'dados')::text,'UTF8'),'sha256'),'hex'),
      jsonb_array_length($3::jsonb->'dados'),octet_length(convert_to(($3::jsonb)::text,'UTF8')),$3::jsonb->'dados'`,
      [casa.restauranteA, id, JSON.stringify(segunda)]
    );
    await banco.query(
      "update public.cargas_scc c set bytes_recebidos=(select sum(bytes) from public.paginas_scc p where p.restaurante_id=c.restaurante_id and p.id_envio=c.id_envio) where c.restaurante_id=$1 and c.id_envio=$2",
      [casa.restauranteA, id]
    );
    return id;
  }

  it("aceita carga íntegra sem alterar fotografia ou revisão", async () => {
    await banco.query("begin");
    try {
      const id = await preparar();
      await banco.query("select public.revalidar_carga_scc_v2($1,$2)", [
        casa.restauranteA,
        id,
      ]);
      const { rows } = await banco.query<{ n: string }>(
        "select count(*) as n from public.fotografias_scc where restaurante_id=$1",
        [casa.restauranteA]
      );
      expect(rows[0]?.n).toBe("0");
    } finally {
      await banco.query("rollback");
    }
  });

  it("não permite revalidar carga de outra casa", async () => {
    await banco.query("begin");
    try {
      const id = await preparar();
      await expect(
        banco.query("select public.revalidar_carga_scc_v2($1,$2)", [
          casa.restauranteB,
          id,
        ])
      ).rejects.toMatchObject({ code: "PR422", message: "carga_scc_invalida" });
    } finally {
      await banco.query("rollback");
    }
  });

  it("não expõe a função interna como RPC", async () => {
    const { rows } = await banco.query<{
      anon: boolean;
      autenticado: boolean;
      servico: boolean;
    }>(
      `select has_function_privilege('anon','public.revalidar_carga_scc_v2(uuid,uuid)','execute') as anon,
       has_function_privilege('authenticated','public.revalidar_carga_scc_v2(uuid,uuid)','execute') as autenticado,
       has_function_privilege('service_role','public.revalidar_carga_scc_v2(uuid,uuid)','execute') as servico`
    );
    expect(rows[0]).toEqual({
      anon: false,
      autenticado: false,
      servico: false,
    });
  });

  it.each([
    "update public.paginas_scc set hash=repeat('a',64) where restaurante_id=$1 and id_envio=$2 and numero=2",
    "update public.paginas_scc set dados=null where restaurante_id=$1 and id_envio=$2 and numero=2",
    'update public.paginas_scc set dados=\'[{"codigo_operador":"segredo"}]\'::jsonb where restaurante_id=$1 and id_envio=$2 and numero=2',
    "update public.paginas_scc set bytes=bytes+1 where restaurante_id=$1 and id_envio=$2 and numero=2",
    "update public.cargas_scc set fonte='historico' where restaurante_id=$1 and id_envio=$2",
  ])("recusa adulteração em staging sem expor valores", async (adulterar) => {
    await banco.query("begin");
    try {
      const id = await preparar();
      await banco.query(adulterar, [casa.restauranteA, id]);
      await expect(
        banco.query("select public.revalidar_carga_scc_v2($1,$2)", [
          casa.restauranteA,
          id,
        ])
      ).rejects.toMatchObject({ code: "PR422", message: "carga_scc_invalida" });
    } finally {
      await banco.query("rollback");
    }
  });

  it("revalida o conteúdo mesmo se um hash adulterado for recalculado", async () => {
    await banco.query("begin");
    try {
      const id = await preparar();
      await banco.query(
        `update public.paginas_scc
        set dados='[{"codigo_operador":"segredo"}]'::jsonb,
            hash=encode(extensions.digest(convert_to('[{"codigo_operador":"segredo"}]'::jsonb::text,'UTF8'),'sha256'),'hex')
        where restaurante_id=$1 and id_envio=$2 and numero=2`,
        [casa.restauranteA, id]
      );
      await banco.query(
        `update public.paginas_scc p set bytes=octet_length(convert_to(
        jsonb_set(c.manifesto || jsonb_build_object('dados',p.dados),'{pagina,numero}',to_jsonb(p.numero),true)::text,'UTF8'))
        from public.cargas_scc c where p.restaurante_id=$1 and p.id_envio=$2 and p.numero=2
        and c.restaurante_id=p.restaurante_id and c.id_envio=p.id_envio`,
        [casa.restauranteA, id]
      );
      await banco.query(
        `update public.cargas_scc c set bytes_recebidos=(select sum(bytes) from public.paginas_scc p
        where p.restaurante_id=c.restaurante_id and p.id_envio=c.id_envio) where c.restaurante_id=$1 and c.id_envio=$2`,
        [casa.restauranteA, id]
      );
      await expect(
        banco.query("select public.revalidar_carga_scc_v2($1,$2)", [
          casa.restauranteA,
          id,
        ])
      ).rejects.toMatchObject({ code: "PR422", message: "carga_scc_invalida" });
    } finally {
      await banco.query("rollback");
    }
  });
});
