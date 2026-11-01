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

describe("limpeza e recepção concorrentes", () => {
  let banco: Client;
  let recepcao: Client;
  let limpeza: Client;
  let casa: Fixture;

  beforeAll(async () => {
    banco = await conectarBanco();
    casa = await criarFixture(banco);
    [recepcao, limpeza] = await Promise.all([conectarBanco(), conectarBanco()]);
  });

  afterAll(async () => {
    await Promise.all([recepcao?.end(), limpeza?.end()]);
    try {
      if (casa) await limparFixture(banco, casa);
    } finally {
      await banco?.end();
    }
  });

  it("espera a trava da recepção antes de expirar carga da casa", async () => {
    const envio = randomUUID();
    await banco.query(
      `insert into public.cargas_scc
      (restaurante_id,id_envio,tipo_envio,modo,sequencia,natureza,versao_scc,enviado_em,total_paginas,total_registros,criada_em)
      values ($1,$2,'cadastro_produtos','incremental',1,'scc','1',now(),2,1,now()-interval '25 hours')`,
      [casa.restauranteA, envio]
    );
    await recepcao.query("begin");
    try {
      await recepcao.query(
        "select pg_advisory_xact_lock(hashtextextended($1::text,0))",
        [casa.restauranteA]
      );
      await limpeza.query("set statement_timeout='300ms'");
      await expect(
        limpeza.query("select public.limpar_cargas_scc_v2()")
      ).rejects.toMatchObject({ code: "57014" });
      const { rows } = await banco.query<{ estado: string }>(
        "select estado from public.cargas_scc where restaurante_id=$1 and id_envio=$2",
        [casa.restauranteA, envio]
      );
      expect(rows[0]?.estado).toBe("recebendo");
    } finally {
      await recepcao.query("rollback");
      await limpeza.query("set statement_timeout=0");
    }
    await limpeza.query("select public.limpar_cargas_scc_v2()");
    const { rows } = await banco.query<{ estado: string }>(
      "select estado from public.cargas_scc where restaurante_id=$1 and id_envio=$2",
      [casa.restauranteA, envio]
    );
    expect(rows[0]?.estado).toBe("expirada");
  });
});
