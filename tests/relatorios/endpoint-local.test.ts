// @vitest-environment node
// HTTP real: exige Supabase local com migrations e receber-relatorios servida
// SEM RF_PERMITIR_SIMULACAO. Não substitua fetch/RPC por mocks nesta suíte.
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";
import { paginaProdutos } from "./fixtures";

const endpoint = "http://127.0.0.1:54321/functions/v1/receber-relatorios";

describe("receber-relatorios por HTTP real local", () => {
  let banco: Client;
  let fixture: Fixture;
  let original: unknown;
  async function statusContas() {
    return (
      await banco.query(
        `select r.id,
      (select to_jsonb(s) from public.sinal_de_vida s where s.restaurante_id=r.id) as sinal,
      (select coalesce(jsonb_agg(to_jsonb(e) order by e.cod_entrada),'[]') from public.entradas e where e.restaurante_id=r.id) as contas,
      (select count(*)::int from public.envios e where e.restaurante_id=r.id) as envios
      from public.restaurantes r where r.id=any($1::uuid[]) order by r.id`,
        [fixture.idsRestaurantes]
      )
    ).rows;
  }
  function paginaScc() {
    const pagina = paginaProdutos();
    return {
      ...pagina,
      manifesto: {
        ...pagina.manifesto,
        carga_id: randomUUID(),
        natureza: "scc",
      },
    };
  }
  async function enviar(corpo: unknown, token = fixture.tokenA) {
    return fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(corpo),
    });
  }
  beforeAll(async () => {
    // Falha explicitamente se função/banco não estiverem disponíveis: não é HTTP aprovado.
    const verificacao = await fetch(endpoint);
    expect(verificacao.status).toBe(405);
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
    await banco.query(
      `insert into public.sinal_de_vida (restaurante_id,ultimo_envio_em,ultimo_erro_em)
      values ($1,'2026-02-14T12:00:00Z','2026-02-14T11:00:00Z'),($2,'2026-02-14T12:00:00Z',null)
      on conflict(restaurante_id) do update set ultimo_envio_em=excluded.ultimo_envio_em,ultimo_erro_em=excluded.ultimo_erro_em`,
      fixture.idsRestaurantes
    );
    await banco.query(
      `insert into public.entradas
      (restaurante_id,cod_entrada,aberta_em,fechada_em,dia_operacao,valor_consumido,pago,hash_origem)
      values ($1,1,'2026-02-14T12:00:00Z',null,'2026-02-14',10,false,'ficticio-aberta'),
      ($2,1,'2026-02-14T12:00:00Z','2026-02-14T13:00:00Z','2026-02-14',20,true,'ficticio-paga')`,
      fixture.idsRestaurantes
    );
    original = await statusContas();
  });
  afterAll(async () => {
    if (!banco) return;
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      await banco.end();
    }
  });
  it("GET retorna 405", async () => {
    expect((await fetch(endpoint)).status).toBe(405);
  });
  it("token errado retorna 401", async () => {
    expect((await enviar(paginaScc(), "token-errado-ficticio")).status).toBe(
      401
    );
  });
  it("página e retry são 200; conflito é 409; publicar é idempotente", async () => {
    const pagina = paginaScc();
    const primeira = await enviar(pagina);
    expect(primeira.status).toBe(200);
    expect(await primeira.json()).toMatchObject({
      ok: true,
      estado: "recebendo",
      repetida: false,
    });
    const repetida = await enviar(pagina);
    expect(repetida.status).toBe(200);
    expect(await repetida.json()).toMatchObject({ repetida: true });
    expect(
      (
        await enviar({
          ...pagina,
          linhas: [{ ...pagina.linhas[0], vendas: "99.00" }],
        })
      ).status
    ).toBe(409);
    const publicar = { acao: "publicar", carga_id: pagina.manifesto.carga_id };
    const publicada = await enviar(publicar);
    expect(publicada.status).toBe(200);
    const recibo = await publicada.json();
    expect(recibo).toMatchObject({ ok: true, estado: "publicada" });
    const retry = await enviar(publicar);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(recibo);
    // A casa B não pode publicar ou acessar a carga A.
    expect((await enviar(publicar, fixture.tokenB)).status).toBe(422);
  });
  it("publicação incompleta retorna 422", async () => {
    const pagina = paginaScc();
    const incompleta = {
      ...pagina,
      manifesto: {
        ...pagina.manifesto,
        sequencia: "2",
        total_paginas: 2,
        total_linhas: 2,
      },
    };
    expect((await enviar(incompleta)).status).toBe(200);
    expect(
      (await enviar({ acao: "publicar", carga_id: pagina.manifesto.carga_id }))
        .status
    ).toBe(422);
  });
  it("corpo grande retorna 413", async () => {
    expect((await enviar("x".repeat(1048576))).status).toBe(413);
  });
  it("simulação não liberada e campo de casa no corpo retornam 422", async () => {
    expect((await enviar(paginaProdutos())).status).toBe(422);
    expect(
      (await enviar({ ...paginaScc(), restaurante_id: fixture.restauranteB }))
        .status
    ).toBe(422);
  });
  it("preserva sinal de vida, status das contas e contador v1 das duas casas", async () => {
    expect(await statusContas()).toEqual(original);
  });
});
