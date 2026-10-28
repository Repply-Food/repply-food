// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";
import { paginaProdutos } from "./fixtures";

let primeira: Client;
let segunda: Client;
let fixture: Fixture;
beforeAll(async () => {
  primeira = await conectarBanco();
  segunda = await conectarBanco();
  fixture = await criarFixture(primeira);
});
afterAll(async () => {
  if (primeira) {
    await primeira.query("rollback");
    if (fixture) {
      for (const tabela of [
        "relatorio_linhas",
        "relatorio_publicacoes",
        "relatorio_paginas",
        "relatorio_cargas",
        "relatorio_versoes",
      ]) {
        await primeira.query(
          `delete from public.${tabela} where restaurante_id=any($1::uuid[])`,
          [fixture.idsRestaurantes]
        );
      }
      await limparFixture(primeira, fixture);
    }
    await primeira.end();
  }
  if (segunda) await segunda.end();
});

it("serializa duas publicações concorrentes: a geração antiga não substitui a nova", async () => {
  const criarPedido = (sequencia: number) => ({
    ...structuredClone(paginaProdutos()),
    manifesto: {
      ...structuredClone(paginaProdutos().manifesto),
      carga_id: randomUUID(),
      sequencia: String(sequencia),
    },
  });
  const pedidos = [criarPedido(1), criarPedido(2)] as const;
  for (const pedido of pedidos) {
    await primeira.query(
      "select public.receber_pagina_relatorio($1,$2::jsonb)",
      [fixture.restauranteA, JSON.stringify(pedido)]
    );
  }
  await primeira.query("begin");
  const { rows: pids } = await segunda.query("select pg_backend_pid() pid");
  await primeira.query("select public.publicar_relatorio($1,$2)", [
    fixture.restauranteA,
    pedidos[1].manifesto.carga_id,
  ]);
  const pendente = segunda.query("select public.publicar_relatorio($1,$2)", [
    fixture.restauranteA,
    pedidos[0].manifesto.carga_id,
  ]);
  // Registrar o observador antes de liberar a primeira evita rejection sem handler.
  const rejeicao = expect(pendente).rejects.toMatchObject({
    code: "PR409",
    message: "sequencia_obsoleta",
  });
  try {
    let bloqueada = false;
    const prazo = Date.now() + 3000;
    while (!bloqueada && Date.now() < prazo) {
      const { rows } = await primeira.query(
        "select cardinality(pg_blocking_pids($1))>0 bloqueada",
        [pids[0].pid]
      );
      bloqueada = rows[0].bloqueada;
      if (!bloqueada) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(bloqueada).toBe(true);
  } finally {
    await primeira.query("commit");
  }
  await rejeicao;
  const { rows } = await primeira.query(
    "select p.carga_id,v.revisao::text from public.relatorio_publicacoes p join public.relatorio_versoes v using(restaurante_id) where p.restaurante_id=$1",
    [fixture.restauranteA]
  );
  expect(rows).toEqual([
    { carga_id: pedidos[1].manifesto.carga_id, revisao: "1" },
  ]);
});
