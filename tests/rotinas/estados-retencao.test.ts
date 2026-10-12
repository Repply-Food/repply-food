import type { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";

describe("rotinas locais", () => {
  let banco: Client;
  let fixture: Fixture;

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

  it("preserva resumos e contas ao limpar somente payloads vencidos", async () => {
    const payload = { entradas: [{ codEntrada: 1 }] };
    await banco.query(
      `insert into public.envios (restaurante_id, recebido_em, http_status, payload, recebidas)
       values
         ($1, now() - interval '49 hours', 200, $2::jsonb, 3),
         ($1, now() - interval '47 hours', 200, $2::jsonb, 4),
         ($1, now() - interval '91 days', 422, $2::jsonb, 5),
         ($1, now() - interval '89 days', 422, $2::jsonb, 6)`,
      [fixture.restauranteA, JSON.stringify(payload)]
    );
    await banco.query(
      `update public.envios set payload = null
        where restaurante_id = $1 and (
          (http_status = 200 and recebido_em < now() - interval '48 hours') or
          (http_status <> 200 and recebido_em < now() - interval '90 days')
        ) and payload is not null`,
      [fixture.restauranteA]
    );
    const envios = await banco.query<{
      http_status: number;
      payload: unknown;
      recebidas: number;
    }>(
      "select http_status, payload, recebidas from public.envios where restaurante_id = $1 order by recebidas",
      [fixture.restauranteA]
    );
    expect(envios.rows).toEqual([
      { http_status: 200, payload: null, recebidas: 3 },
      { http_status: 200, payload, recebidas: 4 },
      { http_status: 422, payload: null, recebidas: 5 },
      { http_status: 422, payload, recebidas: 6 },
    ]);
    expect(
      await banco.query("select 1 from public.restaurantes where id = $1", [
        fixture.restauranteA,
      ])
    ).toHaveProperty("rowCount", 1);
  });

  it("calcula estados pela abertura, sinal e horário sem alterar dados fora da fixture", async () => {
    await banco.query(
      `update public.restaurantes
          set horario_funcionamento = $2::jsonb
        where id = $1`,
      [
        fixture.restauranteA,
        JSON.stringify(
          Array.from({ length: 7 }, (_, dia) => ({
            dia,
            abre: "00:00",
            fecha: "23:59",
          }))
        ),
      ]
    );
    await banco.query(
      `insert into public.sinal_de_vida (restaurante_id, primeiro_envio_em, ultimo_envio_ok_em)
       values ($1, now() - interval '10 minutes', now() - interval '10 minutes')`,
      [fixture.restauranteA]
    );
    await banco.query("select public.atualizar_estados()");
    const estado = async () =>
      banco.query<{ estado: string }>(
        "select estado from public.sinal_de_vida where restaurante_id = $1",
        [fixture.restauranteA]
      );
    expect((await estado()).rows[0]?.estado).toBe("em_dia");
    await banco.query(
      "update public.sinal_de_vida set ultimo_envio_ok_em = now() - interval '20 minutes' where restaurante_id = $1",
      [fixture.restauranteA]
    );
    await banco.query("select public.atualizar_estados()");
    expect((await estado()).rows[0]?.estado).toBe("atrasado");
    await banco.query(
      "update public.sinal_de_vida set ultimo_envio_ok_em = now() - interval '46 minutes', alarme_enviado_em = now() where restaurante_id = $1",
      [fixture.restauranteA]
    );
    await banco.query("select public.atualizar_estados()");
    expect((await estado()).rows[0]?.estado).toBe("parado");
    await banco.query(
      "update public.sinal_de_vida set alarme_enviado_em = null where restaurante_id = $1",
      [fixture.restauranteA]
    );
    const proximoDia = await banco.query<{ dia: number }>(
      "select ((extract(dow from now() at time zone 'America/Fortaleza')::int + 1) % 7) as dia"
    );
    await banco.query(
      "update public.restaurantes set horario_funcionamento = $2::jsonb where id = $1",
      [
        fixture.restauranteA,
        JSON.stringify([
          { dia: proximoDia.rows[0]?.dia, abre: "11:00", fecha: "22:00" },
        ]),
      ]
    );
    await banco.query("select public.atualizar_estados()");
    expect((await estado()).rows[0]?.estado).toBe("fechado");
    expect(
      await banco.query(
        "select 1 from public.sinal_de_vida where restaurante_id = $1",
        [fixture.restauranteB]
      )
    ).toHaveProperty("rowCount", 0);
  });

  it("mantém os jobs da rotina com os horários contratados", async () => {
    const jobs = await banco.query<{ jobname: string; schedule: string }>(
      "select jobname, schedule from cron.job where jobname in ('rf-vigia', 'rf-retencao') order by jobname"
    );
    expect(jobs.rows).toEqual([
      { jobname: "rf-retencao", schedule: "0 5 * * *" },
      { jobname: "rf-vigia", schedule: "*/5 * * * *" },
    ]);
  });
});
