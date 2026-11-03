// @vitest-environment node
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { hashDoToken } from "../../lib/admin/token";
import { prepararSmokeLocal } from "../../scripts/preparar-smoke-scc-local";

describe.skipIf(process.env.RF_SMOKE_TEST_LOCAL !== "1")(
  "preparador com PostgreSQL local e rollback",
  () => {
    it("insere casa e token apenas dentro da transação de teste", async () => {
      let cliente: Client | undefined;
      let slug = "";
      try {
        const resultado = await prepararSmokeLocal(
          [],
          { RF_SMOKE_DATABASE_URL: process.env.RF_SMOKE_DATABASE_URL },
          async (config) => {
            cliente = new Client(config);
            await cliente.connect();
            await cliente.query("begin");
            const c = cliente;
            return {
              query: async (sql, valores) => {
                if (sql === "begin") return { rows: [], rowCount: null };
                if (sql === "commit") return { rows: [], rowCount: null };
                const resposta = await c.query<{ id?: string }>(sql, valores);
                return { rows: resposta.rows, rowCount: resposta.rowCount };
              },
              end: async () => {},
            };
          }
        );
        slug = resultado.slug;
        if (!cliente) throw new Error("Sem conexão de teste");
        const resultadoBanco = await cliente.query(
          "select r.slug, t.hash from public.restaurantes r join public.tokens_envio t on t.restaurante_id = r.id where r.slug = $1",
          [slug]
        );
        expect(resultadoBanco.rows).toEqual([
          { slug, hash: hashDoToken(resultado.token) },
        ]);
        await cliente.query("rollback");
        expect(
          (
            await cliente.query(
              "select id from public.restaurantes where slug = $1",
              [slug]
            )
          ).rowCount
        ).toBe(0);
      } finally {
        if (cliente) {
          await cliente.query("rollback");
          await cliente.end();
        }
      }
    });
  }
);
