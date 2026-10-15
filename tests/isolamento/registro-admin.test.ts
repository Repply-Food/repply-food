// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";

describe("histórico das ações do admin (D-59)", () => {
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

  /**
   * `preparar` roda como dono do banco (postgres); depois troca para `quem`
   * (null = sem login) e roda `executar`. Tudo é desfeito no fim.
   */
  async function desfazendoComo<T>(
    quem: string | null,
    executar: () => Promise<T>,
    preparar?: () => Promise<unknown>
  ): Promise<T> {
    await banco.query("begin");
    try {
      if (preparar) await preparar();
      await banco.query(`set local role ${quem ? "authenticated" : "anon"}`);
      if (quem) {
        await banco.query(
          "select set_config('request.jwt.claim.role', 'authenticated', true)"
        );
        await banco.query(
          "select set_config('request.jwt.claim.sub', $1, true)",
          [quem]
        );
      }
      return await executar();
    } finally {
      await banco.query("rollback");
    }
  }

  const inserir = (
    autor: string,
    restaurante: string,
    acao = "editou_dados",
    detalhe: string | null = null
  ) =>
    banco.query(
      "insert into public.registro_admin (autor, restaurante_id, acao, detalhe) values ($1, $2, $3, $4)",
      [autor, restaurante, acao, detalhe]
    );

  const semente = () => inserir(fixture.admin, fixture.restauranteA);

  it("o admin registra em nome próprio e lê", async () => {
    await desfazendoComo(fixture.admin, async () => {
      expect(
        (await inserir(fixture.admin, fixture.restauranteA)).rowCount
      ).toBe(1);
      const lidos = await banco.query(
        "select 1 from public.registro_admin where restaurante_id = $1",
        [fixture.restauranteA]
      );
      expect(lidos.rowCount).toBe(1);
    });
  });

  it("o admin não registra em nome de outro login", async () => {
    await expect(
      desfazendoComo(fixture.admin, () =>
        inserir(fixture.usuarioA, fixture.restauranteA)
      )
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("o dono não registra nem lê o histórico da própria casa", async () => {
    await expect(
      desfazendoComo(fixture.usuarioA, () =>
        inserir(fixture.usuarioA, fixture.restauranteA)
      )
    ).rejects.toMatchObject({ code: "42501" });
    const lidos = await desfazendoComo(
      fixture.usuarioA,
      () =>
        banco.query(
          "select 1 from public.registro_admin where restaurante_id = $1",
          [fixture.restauranteA]
        ),
      semente
    );
    expect(lidos.rowCount).toBe(0);
  });

  it("ninguém altera nem apaga o histórico, nem o admin", async () => {
    for (const sql of [
      "update public.registro_admin set detalhe = 'adulterado' where restaurante_id = $1",
      "delete from public.registro_admin where restaurante_id = $1",
    ]) {
      await expect(
        desfazendoComo(
          fixture.admin,
          () => banco.query(sql, [fixture.restauranteA]),
          semente
        )
      ).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("sem login não pode nem consultar", async () => {
    await expect(
      desfazendoComo(null, () =>
        banco.query("select 1 from public.registro_admin")
      )
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("ação fora da lista e detalhe longo demais são recusados", async () => {
    await expect(
      desfazendoComo(fixture.admin, () =>
        inserir(fixture.admin, fixture.restauranteA, "apagou_tudo")
      )
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      desfazendoComo(fixture.admin, () =>
        inserir(
          fixture.admin,
          fixture.restauranteA,
          "editou_dados",
          "x".repeat(201)
        )
      )
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("'abriu o painel' entra no máximo uma vez por hora por admin e casa", async () => {
    await desfazendoComo(fixture.admin, async () => {
      await inserir(fixture.admin, fixture.restauranteA, "abriu_painel");
      await banco.query("savepoint segunda");
      await expect(
        inserir(fixture.admin, fixture.restauranteA, "abriu_painel")
      ).rejects.toMatchObject({ code: "23505" });
      await banco.query("rollback to savepoint segunda");
      // Outra casa, na mesma hora: entra.
      expect(
        (await inserir(fixture.admin, fixture.restauranteB, "abriu_painel"))
          .rowCount
      ).toBe(1);
      // A mesma casa, na hora seguinte: entra.
      const outraHora = await banco.query(
        `insert into public.registro_admin (autor, restaurante_id, acao, criado_em)
         values ($1, $2, 'abriu_painel', now() + interval '1 hour')`,
        [fixture.admin, fixture.restauranteA]
      );
      expect(outraHora.rowCount).toBe(1);
      // As outras ações se repetem à vontade.
      await inserir(fixture.admin, fixture.restauranteA, "editou_dados");
      expect(
        (await inserir(fixture.admin, fixture.restauranteA, "editou_dados"))
          .rowCount
      ).toBe(1);
    });
  });
});
