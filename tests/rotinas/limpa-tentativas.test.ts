// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conectarBanco } from "../helpers/supabase-local";

const SQL_LIMPA = `
  delete from public.tentativas_de_login
   where (bloqueado_ate is null or bloqueado_ate < now())
     and atualizado_em < now() - interval '24 hours'`;

describe("rotina rf-limpa-tentativas", () => {
  let banco: Client;
  beforeAll(async () => {
    banco = await conectarBanco();
  });
  afterAll(async () => {
    await banco?.end();
  });

  it("a rotina está registrada no pg_cron", async () => {
    const r = await banco.query<{ schedule: string }>(
      "select schedule from cron.job where jobname = 'rf-limpa-tentativas'"
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.schedule).toBe("15 5 * * *");
  });

  it("apaga só a linha velha sem bloqueio vigente", async () => {
    await banco.query("begin");
    try {
      const velho = `v-${randomUUID()}@t.local`;
      const recente = `r-${randomUUID()}@t.local`;
      const bloqueado = `b-${randomUUID()}@t.local`;
      await banco.query(
        `insert into public.tentativas_de_login (email, tentativas, bloqueado_ate, atualizado_em) values
           ($1, 3, null, now() - interval '48 hours'),
           ($2, 1, null, now()),
           ($3, 9, now() + interval '1 hour', now() - interval '48 hours')`,
        [velho, recente, bloqueado]
      );
      await banco.query(SQL_LIMPA);
      const r = await banco.query<{ email: string }>(
        "select email from public.tentativas_de_login where email = any($1::text[]) order by 1",
        [[velho, recente, bloqueado]]
      );
      expect(r.rows.map((x) => x.email).sort()).toEqual(
        [bloqueado, recente].sort()
      );
    } finally {
      await banco.query("rollback");
    }
  });
});
