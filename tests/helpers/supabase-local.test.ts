// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  conectarBanco,
  criarFixture,
  criarIdentificadoresFixture,
  hashToken,
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
});
