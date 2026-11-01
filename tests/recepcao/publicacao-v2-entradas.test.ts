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

describe("publicação de entradas SCC v2", () => {
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

  it("publica uma carga íntegra preparada com a reconciliação legada", async () => {
    await banco.query("begin");
    try {
      const id = randomUUID();
      const pagina = { ...fixtures[0], id_envio: id };
      await banco.query(
        `insert into public.cargas_scc(restaurante_id,id_envio,tipo_envio,modo,sequencia,natureza,versao_scc,enviado_em,janela_desde,janela_ate,total_paginas,total_registros,bytes_recebidos,manifesto)
        values($1,$2,'entradas','janela',1,'scc','1',($3::jsonb->>'enviado_em')::timestamptz,'2026-11-01','2026-11-01',1,1,
          octet_length(convert_to(($3::jsonb)::text,'UTF8')),jsonb_set($3::jsonb-'dados','{pagina}',jsonb_build_object('total',1)))`,
        [casas.restauranteA, id, JSON.stringify(pagina)]
      );
      await banco.query(
        `insert into public.paginas_scc(restaurante_id,id_envio,numero,hash,quantidade,bytes,dados)
        values($1,$2,1,encode(extensions.digest(convert_to(($3::jsonb->'dados')::text,'UTF8'),'sha256'),'hex'),1,
        octet_length(convert_to(($3::jsonb)::text,'UTF8')),$3::jsonb->'dados')`,
        [casas.restauranteA, id, JSON.stringify(pagina)]
      );
      const resultado = await banco.query<{ recibo: { estado: string } }>(
        "select public.publicar_entradas_scc_v2($1,$2) as recibo",
        [casas.restauranteA, id]
      );
      expect(resultado.rows[0]?.recibo.estado).toBe("publicada");
      const { rows } = await banco.query<{ total: string; valor: string }>(
        "select count(*) as total,max(valor_consumido)::text as valor from public.entradas where restaurante_id=$1",
        [casas.restauranteA]
      );
      expect(rows[0]).toEqual({ total: "1", valor: "1.00" });
    } finally {
      await banco.query("rollback");
    }
  });

  it("publica uma janela, repete sem reiniciar ritmo e reconcilia apenas a casa", async () => {
    const receber = (casa: string, p: unknown) =>
      banco.query<{ recibo: { estado: string; repetida: boolean } }>(
        "select public.receber_pagina_scc_v2($1,$2::jsonb) as recibo",
        [casa, JSON.stringify(p)]
      );
    const primeira = { ...fixtures[0], id_envio: randomUUID() };
    const outra = { ...primeira, id_envio: randomUUID() };
    expect(
      (await receber(casas.restauranteA, primeira)).rows[0]?.recibo.estado
    ).toBe("publicada");
    expect(
      (await receber(casas.restauranteB, outra)).rows[0]?.recibo.estado
    ).toBe("publicada");
    expect(
      (await receber(casas.restauranteA, primeira)).rows[0]?.recibo
    ).toMatchObject({ estado: "publicada", repetida: true });
    const vazia = {
      ...primeira,
      id_envio: randomUUID(),
      sequencia: "2",
      dados: [],
      total_registros: 0,
    };
    await expect(receber(casas.restauranteA, vazia)).rejects.toMatchObject({
      code: "PR429",
    });
    await banco.query(
      "update public.cargas_scc set publicada_em=clock_timestamp()-interval '21 seconds' where restaurante_id=$1 and id_envio=$2",
      [casas.restauranteA, primeira.id_envio]
    );
    expect(
      (await receber(casas.restauranteA, vazia)).rows[0]?.recibo.estado
    ).toBe("publicada");
    const { rows } = await banco.query<{
      restaurante_id: string;
      removida: boolean;
    }>(
      "select restaurante_id,removida_em is not null as removida from public.entradas where restaurante_id=any($1::uuid[]) order by restaurante_id",
      [casas.idsRestaurantes]
    );
    expect(rows).toHaveLength(2);
    expect(
      rows.find((r) => r.restaurante_id === casas.restauranteA)?.removida
    ).toBe(true);
    expect(
      rows.find((r) => r.restaurante_id === casas.restauranteB)?.removida
    ).toBe(false);
  });

  it("reverte a janela completa quando a segunda entrada excede a precisão do banco", async () => {
    const fixture = await criarFixture(banco);
    const receber = (p: unknown) =>
      banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
        fixture.restauranteA,
        JSON.stringify(p),
      ]);
    try {
      const inicial = { ...fixtures[0], id_envio: randomUUID() };
      await receber(inicial);
      await banco.query(
        "update public.cargas_scc set publicada_em=clock_timestamp()-interval '21 seconds' where restaurante_id=$1 and id_envio=$2",
        [fixture.restauranteA, inicial.id_envio]
      );
      const primeiro = {
        ...fixtures[0],
        id_envio: randomUUID(),
        sequencia: "2",
        pagina: { numero: 1, total: 2 },
        total_registros: 2,
        dados: [{ ...fixtures[0].dados[0], ValorConsumido: "2" }],
      };
      const segundo = {
        ...primeiro,
        pagina: { numero: 2, total: 2 },
        dados: [
          {
            ...fixtures[0].dados[0],
            codEntrada: 2,
            ValorConsumido: "99999999999999",
          },
        ],
      };
      await receber(primeiro);
      await expect(receber(segundo)).rejects.toMatchObject({
        code: "PR422",
        message: "carga_scc_invalida",
      });
      const { rows } = await banco.query<{
        valor: string;
        total: string;
        seq: string;
        paginas: string;
        envios: string;
      }>(
        `select (select valor_consumido::text from public.entradas where restaurante_id=$1 and cod_entrada=1) as valor,
          (select count(*) from public.entradas where restaurante_id=$1) as total,
          (select sequencia::text from public.cursores_scc where restaurante_id=$1 and tipo_envio='entradas') as seq,
          (select count(*) from public.paginas_scc where restaurante_id=$1 and id_envio=$2) as paginas,
          (select count(*) from public.envios where restaurante_id=$1) as envios`,
        [fixture.restauranteA, primeiro.id_envio]
      );
      expect(rows[0]).toEqual({
        valor: "1.00",
        total: "1",
        seq: "1",
        paginas: "1",
        envios: "1",
      });
    } finally {
      await limparFixture(banco, fixture);
    }
  });

  it("aceita páginas parciais durante o ritmo e não permite que elas reiniciem o relógio", async () => {
    const fixture = await criarFixture(banco);
    const receber = (p: unknown) =>
      banco.query<{ recibo: { estado: string } }>(
        "select public.receber_pagina_scc_v2($1,$2::jsonb) as recibo",
        [fixture.restauranteA, JSON.stringify(p)]
      );
    try {
      const inicial = { ...fixtures[0], id_envio: randomUUID() };
      await receber(inicial);
      const primeira = {
        ...fixtures[0],
        id_envio: randomUUID(),
        sequencia: "2",
        pagina: { numero: 1, total: 2 },
        total_registros: 2,
      };
      const segunda = {
        ...primeira,
        pagina: { numero: 2, total: 2 },
        dados: [{ ...primeira.dados[0], codEntrada: 2 }],
      };
      expect((await receber(primeira)).rows[0]?.recibo.estado).toBe(
        "recebendo"
      );
      await expect(receber(segunda)).rejects.toMatchObject({ code: "PR429" });
      await banco.query(
        "update public.cargas_scc set publicada_em=clock_timestamp()-interval '21 seconds' where restaurante_id=$1 and id_envio=$2",
        [fixture.restauranteA, inicial.id_envio]
      );
      expect((await receber(segunda)).rows[0]?.recibo.estado).toBe("publicada");
    } finally {
      await limparFixture(banco, fixture);
    }
  });
});
