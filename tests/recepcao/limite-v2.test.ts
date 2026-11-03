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

describe("limite de requisições SCC v2", () => {
  let banco: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
  });

  afterAll(async () => {
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      await banco?.end();
    }
  });

  it("conta 120 chamadas por casa, recusa a 121ª e reinicia após um minuto", async () => {
    for (let i = 0; i < 120; i++) {
      const { rows } = await banco.query<{ resultado: { ok: boolean } }>(
        "select public.consumir_limite_scc($1) as resultado",
        [fixture.restauranteA]
      );
      expect(rows[0]?.resultado.ok).toBe(true);
    }
    await expect(
      banco.query("select public.consumir_limite_scc($1)", [
        fixture.restauranteA,
      ])
    ).rejects.toMatchObject({
      code: "PR429",
      message: "limite_requisicoes_scc",
    });
    await expect(
      banco.query("select public.consumir_limite_scc($1)", [
        fixture.restauranteB,
      ])
    ).resolves.toBeDefined();
    await banco.query(
      "update public.limites_requisicao_scc set inicio_janela = clock_timestamp() - interval '61 seconds' where restaurante_id = $1",
      [fixture.restauranteA]
    );
    await banco.query("select public.consumir_limite_scc($1)", [
      fixture.restauranteA,
    ]);
    const { rows } = await banco.query<{ quantidade: number }>(
      "select quantidade from public.limites_requisicao_scc where restaurante_id = $1",
      [fixture.restauranteA]
    );
    expect(rows[0]?.quantidade).toBe(1);
  });

  it("recusa casa nula ou inexistente sem expor o identificador", async () => {
    for (const casa of [null, randomUUID()]) {
      await expect(
        banco.query("select public.consumir_limite_scc($1)", [casa])
      ).rejects.toMatchObject({ code: "PR422", message: "casa_invalida" });
    }
  });

  it("permite a execução efetiva pela chave de serviço", async () => {
    await banco.query("begin");
    try {
      await banco.query("set local role service_role");
      const { rows } = await banco.query<{ resultado: { ok: boolean } }>(
        "select public.consumir_limite_scc($1) as resultado",
        [fixture.restauranteB]
      );
      expect(rows[0]?.resultado).toEqual({ ok: true });
    } finally {
      await banco.query("rollback");
    }
  });

  it("serializa chamadas concorrentes no último espaço disponível", async () => {
    await banco.query(
      `insert into public.limites_requisicao_scc (restaurante_id,quantidade,inicio_janela)
       values ($1,119,clock_timestamp()) on conflict (restaurante_id)
       do update set quantidade=119, inicio_janela=clock_timestamp()`,
      [fixture.restauranteA]
    );
    const conexoes = await Promise.all(
      Array.from({ length: 10 }, conectarBanco)
    );
    try {
      const resultados = await Promise.allSettled(
        conexoes.map((conexao) =>
          conexao.query("select public.consumir_limite_scc($1)", [
            fixture.restauranteA,
          ])
        )
      );
      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(
        1
      );
      const recusados = resultados.filter((r) => r.status === "rejected");
      expect(recusados).toHaveLength(9);
      for (const recusado of recusados) {
        if (recusado.status === "rejected") {
          expect(recusado.reason).toMatchObject({ code: "PR429" });
        }
      }
      const { rows } = await banco.query<{ quantidade: number }>(
        "select quantidade from public.limites_requisicao_scc where restaurante_id=$1",
        [fixture.restauranteA]
      );
      expect(rows[0]?.quantidade).toBe(120);
    } finally {
      await Promise.all(conexoes.map((conexao) => conexao.end()));
    }
  });
});
