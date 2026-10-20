import type { Client } from "pg";
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Fixture,
  comoAutenticado,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";

describe("atualizar_turnos respeita o acesso (tem_acesso)", () => {
  let banco: Client = undefined as never;
  let fixture: Fixture = undefined as never;

  beforeEach(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
  });

  afterEach(async () => {
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      if (banco) await banco.end();
      banco = undefined as never;
      fixture = undefined as never;
    }
  });

  it("o dono atualiza os turnos da própria casa", async () => {
    await comoAutenticado(banco, fixture.usuarioA, () =>
      banco.query("select public.atualizar_turnos($1, $2::jsonb)", [
        fixture.restauranteA,
        '{"almoco_ate":"15:30"}',
      ])
    );
    const r = await banco.query<{ turnos: { almoco_ate: string } }>(
      "select turnos from public.restaurantes where id = $1",
      [fixture.restauranteA]
    );
    expect(r.rows[0]?.turnos.almoco_ate).toBe("15:30");
  });

  it("o dono de A não atualiza os turnos da casa B (42501)", async () => {
    await expect(
      comoAutenticado(banco, fixture.usuarioA, () =>
        banco.query("select public.atualizar_turnos($1, $2::jsonb)", [
          fixture.restauranteB,
          '{"almoco_ate":"15:30"}',
        ])
      )
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("quem não tem acesso nenhum também é recusado (42501)", async () => {
    await expect(
      comoAutenticado(banco, fixture.usuarioSemAcesso, () =>
        banco.query("select public.atualizar_turnos($1, $2::jsonb)", [
          fixture.restauranteA,
          '{"almoco_ate":"15:30"}',
        ])
      )
    ).rejects.toMatchObject({ code: "42501" });
  });
});
