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
import { fixtures } from "../recepcao/fixtures-v2";

const internas = [
  "public.publicar_carga_scc_v2(uuid,uuid)",
  "public.publicar_entradas_scc_v2(uuid,uuid)",
  "public.publicar_itens_scc_v2(uuid,uuid)",
  "public.publicar_comissoes_caixa_scc_v2(uuid,uuid)",
  "public.publicar_auditoria_notas_scc_v2(uuid,uuid)",
  "public.publicar_financeiro_scc_v2(uuid,uuid)",
  "public.revalidar_carga_scc_v2(uuid,uuid)",
  "public.receber_pagina_scc_v2_base(uuid,jsonb)",
  "public.validar_pagina_scc_v2(jsonb)",
  "public.validar_pagina_scc_v2_base(jsonb)",
  "public.validar_cadastro_scc_v2(jsonb)",
  "public.validar_fotografia_scc_v2(jsonb)",
  "public.validar_envelope_comissoes_scc_v2(jsonb)",
] as const;

describe("funções internas SCC v2", () => {
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

  it.each(internas)(
    "fecha %s inclusive para service_role e PUBLIC",
    async (funcao) => {
      const { rows } = await banco.query<{
        publico: boolean;
        anon: boolean;
        authenticated: boolean;
        service: boolean;
      }>(
        `select exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as publico,
        has_function_privilege('anon',p.oid,'execute') as anon,
        has_function_privilege('authenticated',p.oid,'execute') as authenticated,
        has_function_privilege('service_role',p.oid,'execute') as service
        from pg_proc p where p.oid=$1::regprocedure`,
        [funcao]
      );
      expect(rows[0]).toEqual({
        publico: false,
        anon: false,
        authenticated: false,
        service: false,
      });
    }
  );

  it("service_role publica cadastro apenas pela recepção", async () => {
    const pagina = { ...fixtures[1], id_envio: randomUUID() };
    await banco.query("begin");
    try {
      await banco.query("set local role service_role");
      const { rows } = await banco.query<{ recibo: { estado: string } }>(
        "select public.receber_pagina_scc_v2($1,$2::jsonb) as recibo",
        [fixture.restauranteA, JSON.stringify(pagina)]
      );
      expect(rows[0]?.recibo.estado).toBe("publicada");
    } finally {
      await banco.query("rollback");
    }
  });

  it.each(fixtures)(
    "service_role recebe $tipo_envio após fechar auxiliares",
    async (exemplo) => {
      const pagina = { ...exemplo, id_envio: randomUUID() };
      await banco.query("begin");
      try {
        await banco.query("set local role service_role");
        const { rows } = await banco.query<{ recibo: { estado: string } }>(
          "select public.receber_pagina_scc_v2($1,$2::jsonb) as recibo",
          [fixture.restauranteA, JSON.stringify(pagina)]
        );
        expect(rows[0]?.recibo.estado).toBe("publicada");
      } finally {
        await banco.query("rollback");
      }
    }
  );

  it("nega chamada direta do publicador ao service_role", async () => {
    await banco.query("begin");
    try {
      await banco.query("set local role service_role");
      await expect(
        banco.query(
          "select public.publicar_carga_scc_v2(null::uuid,null::uuid)"
        )
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await banco.query("rollback");
    }
  });
});
