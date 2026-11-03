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

describe("concorrência na recepção SCC v2", () => {
  let banco: Client;
  let casa: Fixture;
  let a: Client;
  let b: Client;

  beforeAll(async () => {
    banco = await conectarBanco();
    casa = await criarFixture(banco);
    [a, b] = await Promise.all([conectarBanco(), conectarBanco()]);
  });

  afterAll(async () => {
    await Promise.all([a?.end(), b?.end()]);
    try {
      if (casa) await limparFixture(banco, casa);
    } finally {
      await banco?.end();
    }
  });

  it("serializa duas retentativas idênticas em conexões independentes", async () => {
    const pagina = {
      ...fixtures[3],
      id_envio: randomUUID(),
      sequencia: "20",
      pagina: { numero: 1, total: 2 },
      total_registros: 2,
    };
    const chamar = (cliente: Client) =>
      cliente.query<{ recibo: { repetida: boolean; estado: string } }>(
        "select public.receber_pagina_scc_v2($1,$2::jsonb) as recibo",
        [casa.restauranteA, JSON.stringify(pagina)]
      );
    const resultados = await Promise.all([chamar(a), chamar(b)]);
    expect(resultados.map((r) => r.rows[0]?.recibo.repetida).sort()).toEqual([
      false,
      true,
    ]);
    expect(resultados.map((r) => r.rows[0]?.recibo.estado)).toEqual([
      "recebendo",
      "recebendo",
    ]);
    const { rows } = await banco.query<{ n: string }>(
      "select count(*) as n from public.paginas_scc where restaurante_id=$1 and id_envio=$2",
      [casa.restauranteA, pagina.id_envio]
    );
    expect(rows[0]?.n).toBe("1");
  });

  it("só admite uma das versões concorrentes da mesma página", async () => {
    const pagina = {
      ...fixtures[3],
      id_envio: randomUUID(),
      sequencia: "21",
      pagina: { numero: 1, total: 2 },
      total_registros: 2,
    };
    const alterada = {
      ...pagina,
      dados: [{ ...pagina.dados[0], vendas_elegiveis: "2" }],
    };
    const resultados = await Promise.allSettled([
      a.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
        casa.restauranteA,
        JSON.stringify(pagina),
      ]),
      b.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
        casa.restauranteA,
        JSON.stringify(alterada),
      ]),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const recusado = resultados.find((r) => r.status === "rejected");
    expect(recusado?.status).toBe("rejected");
    if (recusado?.status === "rejected")
      expect(recusado.reason).toMatchObject({ code: "PR409" });
  });
});
