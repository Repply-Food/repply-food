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

describe("RLS com identidades authenticated reais", () => {
  let banco: Client;
  let fixture: Fixture;

  beforeEach(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
    await banco.query(
      `insert into public.entradas (
        restaurante_id, cod_entrada, aberta_em, dia_operacao, valor_consumido, pago, hash_origem
      ) values
        ($1, 1, now(), current_date, 100, true, 'teste-a'),
        ($2, 1, now(), current_date, 100, true, 'teste-b')`,
      [fixture.restauranteA, fixture.restauranteB]
    );
  });

  afterEach(async () => {
    await limparFixture(banco, fixture);
    await banco.end();
  });

  it("cliente A lê somente as entradas do próprio restaurante", async () => {
    const linhas = await comoAutenticado(banco, fixture.usuarioA, () =>
      banco.query<{ restaurante_id: string }>(
        "select restaurante_id from public.entradas order by restaurante_id"
      )
    );
    expect(linhas.rows).toEqual([{ restaurante_id: fixture.restauranteA }]);
  });

  it("usuário sem acesso e anon não leem entradas", async () => {
    const semAcesso = await comoAutenticado(
      banco,
      fixture.usuarioSemAcesso,
      () => banco.query("select restaurante_id from public.entradas")
    );
    expect(semAcesso.rowCount).toBe(0);
    await banco.query("begin");
    try {
      await banco.query("set local role anon");
      const anonimo = await banco.query(
        "select restaurante_id from public.entradas"
      );
      expect(anonimo.rowCount).toBe(0);
    } finally {
      await banco.query("rollback");
    }
  });

  it("admin lê entradas do painel do cliente, mas não escreve entradas nem metas", async () => {
    const leituras = await comoAutenticado(banco, fixture.admin, () =>
      banco.query(
        "select restaurante_id from public.entradas where restaurante_id = any($1::uuid[])",
        [fixture.idsRestaurantes]
      )
    );
    expect(leituras.rowCount).toBe(2);
    await expect(
      comoAutenticado(banco, fixture.admin, () =>
        banco.query(
          "insert into public.metas (restaurante_id, mes, valor) values ($1, '2026-10-01', 1000)",
          [fixture.restauranteA]
        )
      )
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("cliente escreve a própria meta e recebe zero linhas ao tentar alterar a do B", async () => {
    const inserida = await comoAutenticado(banco, fixture.usuarioA, () =>
      banco.query(
        "insert into public.metas (restaurante_id, mes, valor) values ($1, '2026-10-01', 1000)",
        [fixture.restauranteA]
      )
    );
    expect(inserida.rowCount).toBe(1);
    await banco.query(
      "insert into public.metas (restaurante_id, mes, valor) values ($1, '2026-10-01', 2000)",
      [fixture.restauranteB]
    );
    const recusada = await comoAutenticado(banco, fixture.usuarioA, () =>
      banco.query(
        "update public.metas set valor = 3000 where restaurante_id = $1 and mes = '2026-10-01'",
        [fixture.restauranteB]
      )
    );
    expect(recusada.rowCount).toBe(0);
    const valorB = await banco.query<{ valor: string }>(
      "select valor::text from public.metas where restaurante_id = $1",
      [fixture.restauranteB]
    );
    expect(valorB.rows[0]?.valor).toBe("2000.00");
  });

  it("bloqueia mudar restaurante_id e os helpers não entram em recursão", async () => {
    await expect(
      banco.query(
        "update public.entradas set restaurante_id = $1 where restaurante_id = $2 and cod_entrada = 1",
        [fixture.restauranteB, fixture.restauranteA]
      )
    ).rejects.toMatchObject({ code: "55000" });
    const acesso = await comoAutenticado(banco, fixture.usuarioA, () =>
      banco.query<{ tem_acesso: boolean }>(
        "select public.tem_acesso($1) as tem_acesso",
        [fixture.restauranteA]
      )
    );
    expect(acesso.rows[0]?.tem_acesso).toBe(true);
  });
});
