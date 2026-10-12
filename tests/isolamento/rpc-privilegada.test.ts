import type { Client } from "pg";
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conectarBanco } from "../helpers/supabase-local";

const funcoesReservadas = [
  "public.processar_envio(uuid,jsonb)",
  "public.recalcular_dia_operacao(uuid)",
  "public.atualizar_estados()",
] as const;

describe("RPCs reservadas", () => {
  let banco: Client;

  beforeAll(async () => {
    banco = await conectarBanco();
  });

  afterAll(async () => {
    await banco?.end();
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
});
