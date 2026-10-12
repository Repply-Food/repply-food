// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  conectarBanco,
  criarFixture,
  criarIdentificadoresFixture,
  hashToken,
  limparFixture,
} from "./supabase-local";

describe("lifecycle das fixtures locais", () => {
  it("remove os IDs já criados quando uma restrição real do banco interrompe a criação", async () => {
    const banco = await conectarBanco();
    const identificadores = criarIdentificadoresFixture();
    const restauranteColisao = randomUUID();
    const tokenColisao = `rf_colisao_${randomUUID()}`;
    try {
      await banco.query(
        "insert into public.restaurantes (id, slug, nome) values ($1, $2, 'Colisão de teste')",
        [restauranteColisao, `colisao-${randomUUID()}`]
      );
      await banco.query(
        "insert into public.tokens_envio (restaurante_id, hash, prefixo) values ($1, $2, 'colisao')",
        [restauranteColisao, hashToken(tokenColisao)]
      );
      await expect(
        criarFixture(banco, { identificadores, tokenA: tokenColisao })
      ).rejects.toMatchObject({ code: "23505" });
      const sobras = await banco.query<{
        usuarios: string;
        restaurantes: string;
      }>(
        `select
          (select count(*)::text from auth.users where id = any($1::uuid[])) as usuarios,
          (select count(*)::text from public.restaurantes where id = any($2::uuid[])) as restaurantes`,
        [
          [
            identificadores.usuarioA,
            identificadores.usuarioB,
            identificadores.usuarioSemAcesso,
            identificadores.admin,
          ],
          [identificadores.restauranteA, identificadores.restauranteB],
        ]
      );
      expect(sobras.rows[0]).toEqual({ usuarios: "0", restaurantes: "0" });
    } finally {
      await banco.query("delete from public.restaurantes where id = $1", [
        restauranteColisao,
      ]);
      await banco.end();
    }
  });

  it("faz rollback de uma interrupção controlada sem deixar criação parcial", async () => {
    const banco = await conectarBanco();
    const identificadores = criarIdentificadoresFixture();
    try {
      await expect(
        criarFixture(banco, {
          identificadores,
          interromperApos: "restaurantes",
        })
      ).rejects.toThrow("interrupção controlada");
      const sobras = await banco.query(
        "select count(*)::int as total from public.restaurantes where id = any($1::uuid[])",
        [[identificadores.restauranteA, identificadores.restauranteB]]
      );
      expect(sobras.rows[0]?.total).toBe(0);
    } finally {
      await banco.end();
    }
  });

  it("faz rollback da limpeza parcial e permite a limpeza posterior", async () => {
    const banco = await conectarBanco();
    let fixture: Awaited<ReturnType<typeof criarFixture>> | undefined;
    try {
      fixture = await criarFixture(banco);
      await expect(
        limparFixture(banco, fixture, { interromperApos: "restaurantes" })
      ).rejects.toThrow("interrupção controlada");
      const preservados = await banco.query(
        "select count(*)::int as total from public.restaurantes where id = any($1::uuid[])",
        [fixture.idsRestaurantes]
      );
      expect(preservados.rows[0]?.total).toBe(2);
      await limparFixture(banco, fixture);
      fixture = undefined;
    } finally {
      try {
        if (fixture) await limparFixture(banco, fixture);
      } finally {
        await banco.end();
      }
    }
  });

  it("preserva a transação externa e deixa o rollback do chamador remover a fixture", async () => {
    const banco = await conectarBanco();
    let fixture: Awaited<ReturnType<typeof criarFixture>> | undefined;
    try {
      await banco.query("begin");
      fixture = await criarFixture(banco, { transacaoExterna: true });
      expect(
        await banco.query("select 1 from public.restaurantes where id = $1", [
          fixture.restauranteA,
        ])
      ).toHaveProperty("rowCount", 1);
      await banco.query("rollback");
      expect(
        await banco.query("select 1 from public.restaurantes where id = $1", [
          fixture.restauranteA,
        ])
      ).toHaveProperty("rowCount", 0);
      fixture = undefined;
    } finally {
      try {
        await banco.query("rollback");
        if (fixture) await limparFixture(banco, fixture);
      } finally {
        await banco.end();
      }
    }
  });
});
