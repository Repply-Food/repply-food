import type { Client } from "pg";
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";

const funcoesReservadas = [
  "public.processar_envio(uuid,jsonb)",
  "public.recalcular_dia_operacao(uuid)",
  "public.atualizar_estados()",
] as const;

describe("RPCs reservadas", () => {
  let banco: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
  });

  afterAll(async () => {
    try {
      await limparFixture(banco, fixture);
    } finally {
      await banco?.end();
    }
  });

  it("nega anon e authenticated, preservando service_role", async () => {
    for (const funcao of funcoesReservadas) {
      const resultado = await banco.query<{
        anon: boolean;
        authenticated: boolean;
        service: boolean;
      }>(
        `select
          has_function_privilege('anon', $1, 'execute') as anon,
          has_function_privilege('authenticated', $1, 'execute') as authenticated,
          has_function_privilege('service_role', $1, 'execute') as service`,
        [funcao]
      );
      expect(resultado.rows[0]).toEqual({
        anon: false,
        authenticated: false,
        service: true,
      });
    }
  });

  it("mantém atualizar_turnos só para authenticated e service_role", async () => {
    const resultado = await banco.query<{
      anon: boolean;
      authenticated: boolean;
      service: boolean;
    }>(
      `select
        has_function_privilege('anon', 'public.atualizar_turnos(uuid,jsonb)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.atualizar_turnos(uuid,jsonb)', 'execute') as authenticated,
        has_function_privilege('service_role', 'public.atualizar_turnos(uuid,jsonb)', 'execute') as service`
    );
    expect(resultado.rows[0]).toEqual({
      anon: false,
      authenticated: true,
      service: true,
    });
  });

  it("recusa execução real para anon e authenticated, inclusive admin", async () => {
    const chamadas = [
      "select public.processar_envio(null::uuid, null::jsonb)",
      "select public.recalcular_dia_operacao(null::uuid)",
      "select public.atualizar_estados()",
    ];
    const identidades = [
      { papel: "anon", usuario: null },
      { papel: "authenticated", usuario: fixture.usuarioSemAcesso },
      { papel: "authenticated", usuario: fixture.admin },
    ] as const;
    for (const { papel, usuario } of identidades) {
      for (const chamada of chamadas) {
        await banco.query("begin");
        try {
          await banco.query(`set local role ${papel}`);
          if (usuario) {
            await banco.query(
              "select set_config('request.jwt.claim.sub', $1, true)",
              [usuario]
            );
          }
          await expect(banco.query(chamada)).rejects.toMatchObject({
            code: "42501",
          });
        } finally {
          await banco.query("rollback");
        }
      }
    }
  });
});
