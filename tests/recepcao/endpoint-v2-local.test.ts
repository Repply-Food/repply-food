import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  endpointRecepcao,
  envelope,
  enviar,
  hashToken,
  limparFixture,
} from "../helpers/supabase-local";
import { fixtures } from "./fixtures-v2";

describe("endpoint v2 local", () => {
  let db: Client;
  let casa: Fixture;
  beforeAll(async () => {
    db = await conectarBanco();
    casa = await criarFixture(db);
  });
  afterAll(async () => {
    if (casa) await limparFixture(db, casa);
    if (db) await db.end();
  });

  it("recusa método, token inválido e envelope antigo", async () => {
    expect((await fetch(endpointRecepcao)).status).toBe(405);
    expect((await enviar("invalido", fixtures[0])).status).toBe(401);
    expect((await enviar(casa.tokenA, envelope([]))).status).toBe(422);
  });
  it("publica uma página v2", async () => {
    const resposta = await enviar(casa.tokenA, fixtures[1]);
    expect(resposta.status).toBe(200);
    expect((await resposta.json()).estado).toBe("publicada");
  });
  it("retém páginas, publica ao completar e mantém recibo em retry", async () => {
    const id_envio = randomUUID();
    const base = {
      ...fixtures[1],
      id_envio,
      sequencia: "2",
      total_registros: 2,
    };
    const segunda = {
      ...base,
      pagina: { numero: 2, total: 2 },
      dados: [{ ...fixtures[1].dados[0], codigo_produto: "002" }],
    };
    const primeira = { ...base, pagina: { numero: 1, total: 2 } };
    expect(await (await enviar(casa.tokenA, segunda)).json()).toMatchObject({
      estado: "recebendo",
    });
    const resultado = await enviar(casa.tokenA, primeira);
    expect(resultado.status).toBe(200);
    const publicado = await resultado.json();
    expect(publicado.estado).toBe("publicada");
    const retry = await (await enviar(casa.tokenA, primeira)).json();
    expect(retry).toMatchObject({
      estado: "publicada",
      id_envio,
      sequencia: "2",
      repetida: true,
    });
    expect(
      (await enviar(casa.tokenA, { ...primeira, total_registros: 3 })).status
    ).toBe(409);
  });
  it("recusa dados inválidos, simulação e identidade no corpo sem trocar de casa", async () => {
    const corpo = { ...fixtures[1], id_envio: randomUUID() };
    expect(
      (await enviar(casa.tokenB, { ...corpo, natureza: "simulacao" })).status
    ).toBe(422);
    for (const campo of ["restaurante_id", "slug", "nome"]) {
      expect(
        (await enviar(casa.tokenB, { ...corpo, [campo]: casa.restauranteA }))
          .status
      ).toBe(422);
    }
    const cargas = await db.query(
      "select restaurante_id from public.cargas_scc where id_envio = $1",
      [corpo.id_envio]
    );
    expect(cargas.rowCount).toBe(0);
    expect((await enviar(casa.tokenB, corpo)).status).toBe(200);
    const rows = await db.query(
      "select restaurante_id from public.produtos_scc where restaurante_id = $1",
      [casa.restauranteB]
    );
    expect(rows.rows).toEqual([{ restaurante_id: casa.restauranteB }]);
    const cargasDepois = await db.query(
      "select restaurante_id from public.cargas_scc where id_envio = $1",
      [corpo.id_envio]
    );
    expect(cargasDepois.rows).toEqual([{ restaurante_id: casa.restauranteB }]);
    const invalido = await fetch(endpointRecepcao, {
      method: "POST",
      headers: { authorization: `Bearer ${casa.tokenB}` },
      body: "{",
    });
    expect(invalido.status).toBe(400);
    expect(
      (
        await enviar(casa.tokenB, {
          ...corpo,
          dados: Array(501).fill(corpo.dados[0]),
        })
      ).status
    ).toBe(413);
  });
  it("recusa tokens revogado e expirado", async () => {
    for (const [token, coluna] of [
      [`revogado-${randomUUID()}`, "revogado_em"],
      [`expirado-${randomUUID()}`, "expira_em"],
    ] as const) {
      await db.query(
        `insert into public.tokens_envio (restaurante_id, hash, prefixo, ${coluna}) values ($1, $2, 'teste', now() - interval '1 day')`,
        [casa.restauranteA, hashToken(token)]
      );
      expect((await enviar(token, fixtures[0])).status).toBe(401);
    }
  });
  it("conta requisições inválidas na quota independente", async () => {
    await db.query(
      "update public.limites_requisicao_scc set quantidade = 119, inicio_janela = now() where restaurante_id = $1",
      [casa.restauranteB]
    );
    expect((await enviar(casa.tokenB, {})).status).toBe(422);
    expect((await enviar(casa.tokenB, {})).status).toBe(429);
  });
  it("descarta campos pessoais antes de persistir", async () => {
    const privado = "pessoal_ficticio_123";
    const dados = {
      ...fixtures[0].dados[0],
      NomeCliente: privado,
      RG: privado,
      FoneCliente: privado,
      Sexo: privado,
    };
    const resposta = await enviar(casa.tokenA, {
      ...fixtures[0],
      id_envio: randomUUID(),
      dados: [dados],
    });
    expect(resposta.status).toBe(200);
    expect(await resposta.text()).not.toContain(privado);
    for (const tabela of ["entradas", "envios", "cargas_scc", "paginas_scc"]) {
      const resultado = await db.query(
        `select row_to_json(t)::text as registro from public.${tabela} t where restaurante_id = $1`,
        [casa.restauranteA]
      );
      expect(JSON.stringify(resultado.rows)).not.toContain(privado);
    }
  });
});
