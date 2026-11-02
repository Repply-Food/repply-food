// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { type Fixture, conectarBanco } from "../helpers/supabase-local";
import { fixtures } from "../recepcao/fixtures-v2";
import { identidade, prepararConsulta } from "./consulta-sql-helpers";

describe("cobertura de fotografias tipadas", () => {
  let banco: Client;
  let casa: Fixture;
  beforeAll(async () => {
    banco = await conectarBanco();
  });
  afterAll(async () => {
    await banco?.end();
  });
  beforeEach(async () => {
    casa = await prepararConsulta(banco);
  });
  afterEach(async () => {
    await banco.query("rollback");
  });

  it("distingue fotografia vazia de dia ausente", async () => {
    const pagina = {
      ...fixtures[2],
      id_envio: randomUUID(),
      fonte: "historico",
      dia_movimento: "2026-10-24",
      recursos: ["pdv"],
      dados: [],
      total_registros: 0,
    };
    await banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
      casa.restauranteA,
      JSON.stringify(pagina),
    ]);
    await identidade(banco, casa.usuarioA);
    const { rows } = await banco.query(
      "select relatorios_privados.cobertura($1,'produtos',$2::jsonb) r",
      [
        casa.restauranteA,
        JSON.stringify({
          inicio: "2026-10-24",
          fim: "2026-10-25",
          fonte: "historico",
        }),
      ]
    );
    expect(rows[0].r).toMatchObject({
      esperados: 2,
      recebidos: 1,
      ausentes: ["2026-10-25"],
      recursos: ["pdv"],
    });
  });

  it("lê a revisão e os itens publicados pelo webhook", async () => {
    const pagina = { ...fixtures[2], id_envio: randomUUID() };
    await banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
      casa.restauranteA,
      JSON.stringify(pagina),
    ]);
    await identidade(banco, casa.usuarioA);
    const filtros = {
      inicio: "2026-11-01",
      fim: "2026-11-01",
      fonte: "online",
    };
    const { rows } = await banco.query(
      "select public.consultar_relatorio($1,'produtos',$2::jsonb,1,50,null) r",
      [casa.restauranteA, JSON.stringify(filtros)]
    );
    expect(rows[0].r.revisao).toBe("1");
    expect(rows[0].r.linhas).toMatchObject([
      { codigoProduto: "1", produto: "Água", vendas: "2.00" },
    ]);
  });

  it("lê notas publicadas pelo webhook sem nome de cliente", async () => {
    const pagina = { ...fixtures[6], id_envio: randomUUID() };
    await banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
      casa.restauranteA,
      JSON.stringify(pagina),
    ]);
    await identidade(banco, casa.usuarioA);
    const filtros = {
      inicio: "2026-11-01",
      fim: "2026-11-01",
      fonte: "online",
    };
    const { rows } = await banco.query(
      "select relatorios_privados.notas_assinadas($1,$2::jsonb,1,50) r",
      [casa.restauranteA, JSON.stringify(filtros)]
    );
    expect(rows[0].r.linhas).toMatchObject([
      { codigoNota: "1", codigoCliente: "1" },
    ]);
    expect(rows[0].r.linhas[0]).not.toHaveProperty("nomeCliente");
  });

  it("mantém dimensões históricas quando o cadastro do produto muda", async () => {
    const item = { ...fixtures[2], id_envio: randomUUID() };
    const cadastro = {
      ...fixtures[1],
      id_envio: randomUUID(),
      dados: [
        { ...fixtures[1].dados[0], codigo_produto: "1", produto: "Novo nome" },
      ],
    };
    for (const pagina of [item, cadastro]) {
      await banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
        casa.restauranteA,
        JSON.stringify(pagina),
      ]);
    }
    await identidade(banco, casa.usuarioA);
    const { rows } = await banco.query(
      "select relatorios_privados.produtos($1,$2::jsonb,1,50) r",
      [
        casa.restauranteA,
        JSON.stringify({
          inicio: "2026-11-01",
          fim: "2026-11-01",
          fonte: "online",
        }),
      ]
    );
    expect(rows[0].r.linhas).toMatchObject([
      { codigoProduto: "1", produto: "Água" },
    ]);
  });
});
