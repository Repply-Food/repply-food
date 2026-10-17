// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conectarBanco } from "../helpers/supabase-local";

/** Cada teste usa um e-mail único e apaga a própria linha no fim. */
describe("trava de tentativas por e-mail", () => {
  let banco: Client;

  beforeAll(async () => {
    banco = await conectarBanco();
  });
  afterAll(async () => {
    await banco?.end();
  });

  async function emTransacao<T>(executar: () => Promise<T>): Promise<T> {
    await banco.query("begin");
    try {
      return await executar();
    } finally {
      await banco.query("rollback");
    }
  }

  it("bloqueia só a partir do 5º erro e o recuo cresce", async () => {
    await emTransacao(async () => {
      const email = `a-${randomUUID()}@teste.local`;
      const bloqueios: (Date | null | undefined)[] = [];
      for (let i = 0; i < 7; i++) {
        const r = await banco.query<{ b: Date | null }>(
          "select public.registrar_tentativa_errada($1) as b",
          [email]
        );
        bloqueios.push(r.rows[0]?.b);
      }
      expect(bloqueios.slice(0, 4).every((b) => b === null)).toBe(true);
      expect(bloqueios[4]).toBeInstanceOf(Date);
      const minutos = await banco.query<{ m: string }>(
        "select round(extract(epoch from (bloqueado_ate - now()))/60)::text as m from public.tentativas_de_login where email = $1",
        [email]
      );
      // 7º erro: 15 min × 2^(7−5) = 60 min.
      expect(minutos.rows[0]?.m).toBe("60");
    });
  });

  it("normaliza o e-mail (espaço e maiúsculas)", async () => {
    await emTransacao(async () => {
      const base = `b-${randomUUID()}@teste.local`;
      for (let i = 0; i < 5; i++) {
        await banco.query("select public.registrar_tentativa_errada($1)", [
          `  ${base.toUpperCase()} `,
        ]);
      }
      const r = await banco.query<{ b: Date | null }>(
        "select public.login_bloqueado($1) as b",
        [base]
      );
      expect(r.rows[0]?.b).toBeInstanceOf(Date);
    });
  });

  it("login_bloqueado devolve null quando o bloqueio já passou", async () => {
    await emTransacao(async () => {
      const email = `c-${randomUUID()}@teste.local`;
      for (let i = 0; i < 5; i++) {
        await banco.query("select public.registrar_tentativa_errada($1)", [
          email,
        ]);
      }
      await banco.query(
        "update public.tentativas_de_login set bloqueado_ate = now() - interval '1 minute' where email = $1",
        [email]
      );
      const r = await banco.query<{ b: Date | null }>(
        "select public.login_bloqueado($1) as b",
        [email]
      );
      expect(r.rows[0]?.b).toBeNull();
    });
  });

  it("limpar_tentativas zera a contagem", async () => {
    await emTransacao(async () => {
      const email = `d-${randomUUID()}@teste.local`;
      for (let i = 0; i < 5; i++) {
        await banco.query("select public.registrar_tentativa_errada($1)", [
          email,
        ]);
      }
      await banco.query("select public.limpar_tentativas($1)", [email]);
      const r = await banco.query<{ n: string }>(
        "select count(*)::int::text as n from public.tentativas_de_login where email = $1",
        [email]
      );
      expect(r.rows[0]?.n).toBe("0");
    });
  });

  it("e-mail que não existe em auth.users é contado igual (não vaza)", async () => {
    await emTransacao(async () => {
      const email = `nao-existe-${randomUUID()}@nada.local`;
      const r = await banco.query<{ b: Date | null }>(
        "select public.registrar_tentativa_errada($1) as b",
        [email]
      );
      expect(r.rows[0]?.b).toBeNull();
      const q = await banco.query<{ t: number }>(
        "select tentativas as t from public.tentativas_de_login where email = $1",
        [email]
      );
      expect(q.rows[0]?.t).toBe(1);
    });
  });
});
