// @vitest-environment node
import type { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";

const SEMPRE_ABERTO = Array.from({ length: 7 }, (_, dia) => [
  { dia, abre: "00:00", fecha: "12:00" },
  { dia, abre: "12:00", fecha: "00:00" },
]).flat();

type Alerta = {
  id: string;
  estado: string;
  tipo: string;
};

async function deixarParado(cliente: Client, restauranteId: string) {
  await cliente.query(
    `update public.restaurantes
        set horario_funcionamento = $2::jsonb
      where id = $1`,
    [restauranteId, JSON.stringify(SEMPRE_ABERTO)]
  );
  await cliente.query(
    `insert into public.sinal_de_vida (
       restaurante_id, primeiro_envio_em, ultimo_envio_ok_em
     ) values ($1, now() - interval '2 hours', now() - interval '46 minutes')
     on conflict (restaurante_id) do update set
       primeiro_envio_em = excluded.primeiro_envio_em,
       ultimo_envio_ok_em = excluded.ultimo_envio_ok_em`,
    [restauranteId]
  );
  await cliente.query("select public.atualizar_estados()");
}

async function alertasDaCasa(cliente: Client, restauranteId: string) {
  return cliente.query<Alerta>(
    `select id::text, tipo, estado
       from public.alertas_sinal
      where restaurante_id = $1
      order by criado_em, tipo`,
    [restauranteId]
  );
}

describe("alarme de sinal de vida", () => {
  let banco: Client = undefined as never;
  let fixture: Fixture = undefined as never;

  beforeEach(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
  });

  afterEach(async () => {
    try {
      await limparFixture(banco, fixture);
    } finally {
      await banco.end();
    }
  });

  it("cria uma única parada pendente mesmo quando o vigia roda outra vez", async () => {
    await deixarParado(banco, fixture.restauranteA);
    await banco.query("select public.atualizar_estados()");

    const alertas = await alertasDaCasa(banco, fixture.restauranteA);

    expect(alertas.rows).toEqual([
      expect.objectContaining({ tipo: "parado", estado: "pendente" }),
    ]);
  });

  it("marca a parada entregue somente depois da confirmação HTTP", async () => {
    await deixarParado(banco, fixture.restauranteA);
    const alerta = (await alertasDaCasa(banco, fixture.restauranteA)).rows[0];

    await banco.query(
      "select public.confirmar_alerta_sinal($1::uuid, 202, '{\"ok\":true}'::jsonb, null)",
      [alerta?.id]
    );

    const alertas = await alertasDaCasa(banco, fixture.restauranteA);
    const sinal = await banco.query<{ alarme_enviado_em: string | null }>(
      "select alarme_enviado_em::text from public.sinal_de_vida where restaurante_id = $1",
      [fixture.restauranteA]
    );
    expect(alertas.rows).toEqual([
      expect.objectContaining({ tipo: "parado", estado: "enviado" }),
    ]);
    expect(sinal.rows[0]?.alarme_enviado_em).not.toBeNull();
  });

  it("mantém pendente quando a resposta HTTP falha", async () => {
    await deixarParado(banco, fixture.restauranteA);
    const alerta = (await alertasDaCasa(banco, fixture.restauranteA)).rows[0];

    await banco.query(
      "select public.confirmar_alerta_sinal($1::uuid, 500, '{\"ok\":false}'::jsonb, 'resposta_500')",
      [alerta?.id]
    );

    const estado = await banco.query<{
      estado: string;
      erro_codigo: string | null;
    }>(
      "select estado, erro_codigo from public.alertas_sinal where id = $1::uuid",
      [alerta?.id]
    );
    expect(estado.rows[0]).toEqual({
      estado: "pendente",
      erro_codigo: "resposta_500",
    });
  });

  it("cria uma única volta após uma parada entregue e novo envio válido", async () => {
    await deixarParado(banco, fixture.restauranteA);
    const alerta = (await alertasDaCasa(banco, fixture.restauranteA)).rows[0];
    await banco.query(
      "select public.confirmar_alerta_sinal($1::uuid, 202, '{\"ok\":true}'::jsonb, null)",
      [alerta?.id]
    );

    await banco.query(
      "update public.sinal_de_vida set ultimo_envio_ok_em = now() where restaurante_id = $1",
      [fixture.restauranteA]
    );
    await banco.query(
      "update public.sinal_de_vida set ultimo_envio_ok_em = now() + interval '1 second' where restaurante_id = $1",
      [fixture.restauranteA]
    );

    const alertas = await alertasDaCasa(banco, fixture.restauranteA);
    expect(alertas.rows.map(({ tipo, estado }) => ({ tipo, estado }))).toEqual([
      { tipo: "parado", estado: "enviado" },
      { tipo: "voltou", estado: "pendente" },
    ]);
  });

  it("não chama volta só porque a casa fechou", async () => {
    await deixarParado(banco, fixture.restauranteA);
    const alerta = (await alertasDaCasa(banco, fixture.restauranteA)).rows[0];
    await banco.query(
      "select public.confirmar_alerta_sinal($1::uuid, 202, '{\"ok\":true}'::jsonb, null)",
      [alerta?.id]
    );
    const amanha = await banco.query<{ dia: number }>(
      "select ((extract(dow from now())::int + 1) % 7) as dia"
    );
    await banco.query(
      "update public.restaurantes set horario_funcionamento = $2::jsonb where id = $1",
      [
        fixture.restauranteA,
        JSON.stringify([
          { dia: amanha.rows[0]?.dia, abre: "12:00", fecha: "13:00" },
        ]),
      ]
    );
    await banco.query("select public.atualizar_estados()");

    const alertas = await alertasDaCasa(banco, fixture.restauranteA);
    expect(alertas.rows).toHaveLength(1);
    expect(alertas.rows[0]).toEqual(
      expect.objectContaining({ tipo: "parado", estado: "enviado" })
    );
  });

  it("cancela a parada que ainda não saiu quando o SCC volta", async () => {
    await deixarParado(banco, fixture.restauranteA);

    await banco.query(
      "update public.sinal_de_vida set ultimo_envio_ok_em = now() where restaurante_id = $1",
      [fixture.restauranteA]
    );

    const alertas = await alertasDaCasa(banco, fixture.restauranteA);
    expect(alertas.rows).toEqual([
      expect.objectContaining({ tipo: "parado", estado: "cancelado" }),
    ]);
  });

  it("mantém os incidentes de cada restaurante separados", async () => {
    await deixarParado(banco, fixture.restauranteA);

    const alertasA = await alertasDaCasa(banco, fixture.restauranteA);
    const alertasB = await alertasDaCasa(banco, fixture.restauranteB);

    expect(alertasA.rows).toHaveLength(1);
    expect(alertasB.rows).toHaveLength(0);
  });
});
