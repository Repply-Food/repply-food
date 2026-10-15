// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  comoAutenticado,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";

type Linha = { id: string; estado: string | null; versao_scc: string | null };

describe("visão restaurantes_no_admin (lista do admin)", () => {
  let banco: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
    // Horas diferentes de propósito: na mesma instrução o now() é igual e a
    // ordem do "último envio" ficaria empatada.
    await banco.query(
      `insert into public.envios (restaurante_id, recebido_em, http_status, versao_scc)
       values ($1, now() - interval '1 hour', 200, '5.1.8'),
              ($1, now(), 200, '5.2.1'),
              ($2, now(), 200, '5.1.8')`,
      [fixture.restauranteA, fixture.restauranteB]
    );
    await banco.query(
      `insert into public.sinal_de_vida (restaurante_id, primeiro_envio_em, ultimo_envio_ok_em, estado)
       values ($1, now(), now(), 'em_dia')`,
      [fixture.restauranteA]
    );
  });

  afterAll(async () => {
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      await banco?.end();
    }
  });

  const ler = (quem: string) =>
    comoAutenticado(banco, quem, () =>
      banco.query<Linha>(
        `select id::text, estado, versao_scc from public.restaurantes_no_admin
          where id = any($1::uuid[]) order by nome`,
        [fixture.idsRestaurantes]
      )
    );

  it("roda com a permissão de quem consulta (security_invoker)", async () => {
    const { rows } = await banco.query<{ opcoes: string[] | null }>(
      "select reloptions as opcoes from pg_class where oid = 'public.restaurantes_no_admin'::regclass"
    );
    expect(rows[0]?.opcoes).toContain("security_invoker=true");
  });

  it("o admin vê as casas com o estado e a versão do SCC do último envio", async () => {
    expect((await ler(fixture.admin)).rows).toEqual([
      { id: fixture.restauranteA, estado: "em_dia", versao_scc: "5.2.1" },
      { id: fixture.restauranteB, estado: null, versao_scc: "5.1.8" },
    ]);
  });

  it("o dono vê só a casa dele, sem a versão (envios são só do admin)", async () => {
    expect((await ler(fixture.usuarioA)).rows).toEqual([
      { id: fixture.restauranteA, estado: "em_dia", versao_scc: null },
    ]);
  });

  it("login sem acesso não vê nada; sem login, nem pode consultar", async () => {
    expect((await ler(fixture.usuarioSemAcesso)).rows).toEqual([]);
    await banco.query("begin");
    try {
      await banco.query("set local role anon");
      await expect(
        banco.query("select 1 from public.restaurantes_no_admin")
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await banco.query("rollback");
    }
  });
});
