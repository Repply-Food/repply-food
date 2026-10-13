import type { Client, QueryResult, QueryResultRow } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
} from "../helpers/supabase-local";

type SinalSnapshot = {
  restaurante_id: string;
  primeiro_envio_em: string | null;
  ultimo_envio_em: string | null;
  ultimo_envio_ok_em: string | null;
  ultimo_erro_em: string | null;
  estado: string;
  estado_desde: string;
  alarme_enviado_em: string | null;
};

type ConsultaVigia = {
  query: <R extends QueryResultRow = QueryResultRow>(
    sql: string,
    parametros?: unknown[]
  ) => Promise<QueryResult<R>>;
};

async function comSinaisEstaveis<T>(
  cliente: Client,
  fase: (consulta: ConsultaVigia) => Promise<T>
): Promise<T> {
  // READ COMMITTED é intencional: a visão nasce DEPOIS da trava, não antes
  // dela como em REPEATABLE READ com snapshot já tomado pela fixture.
  // Excluímos INSERT/UPDATE/DELETE, mas não SELECT, só nesta fase curta.
  await cliente.query("savepoint trava_vigia");
  let expirou = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await cliente.query("set local lock_timeout = '250ms'");
    await cliente.query("set local statement_timeout = '750ms'");
    await cliente.query("set local idle_in_transaction_session_timeout = '2s'");
    const prazo = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expirou = true;
        reject(new Error("fase vigia excedeu 1500ms"));
      }, 1500);
    });
    await cliente.query(
      "lock table public.sinal_de_vida in share row exclusive mode"
    );
    const consulta: ConsultaVigia = {
      query: (sql, parametros) => {
        if (expirou) return Promise.reject(new Error("fase vigia encerrada"));
        return cliente.query(sql, parametros);
      },
    };
    return await Promise.race([fase(consulta), prazo]);
  } finally {
    expirou = true;
    if (timer) clearTimeout(timer);
    // A trava antecede efeitos_vigia, portanto sobrevive ao rollback interno.
    // Este rollback libera a trava em sucesso/erro, sem encerrar o chamador.
    await cliente.query("rollback to savepoint trava_vigia");
    await cliente.query("release savepoint trava_vigia");
  }
}

describe("rotinas locais", () => {
  let banco: Client | undefined;
  let fixture: Fixture | undefined;

  beforeEach(async () => {
    banco = undefined;
    fixture = undefined;
    banco = await conectarBanco();
    await banco.query("begin isolation level read committed");
    fixture = await criarFixture(banco, { transacaoExterna: true });
  });

  afterEach(async () => {
    const cliente = banco;
    try {
      if (cliente) await cliente.query("rollback");
      if (cliente) {
        if (fixture) {
          const restos = await cliente.query(
            "select count(*)::int as total from public.restaurantes where id = any($1::uuid[])",
            [fixture.idsRestaurantes]
          );
          expect(restos.rows[0]?.total).toBe(0);
        }
      }
    } finally {
      await cliente?.end();
      banco = undefined;
      fixture = undefined;
    }
  });

  it("executa o comando instalado de retenção somente na transação revertida e preserva contas", async () => {
    const cliente = banco as Client;
    const dados = fixture as Fixture;
    const payload = { entradas: [{ codEntrada: 1 }] };
    await cliente.query(
      `insert into public.envios (restaurante_id, recebido_em, http_status, payload, recebidas)
       values
         ($1, now() - interval '49 hours', 200, $2::jsonb, 3),
         ($1, now() - interval '47 hours', 200, $2::jsonb, 4),
         ($1, now() - interval '91 days', 422, $2::jsonb, 5),
         ($1, now() - interval '89 days', 422, $2::jsonb, 6)`,
      [dados.restauranteA, JSON.stringify(payload)]
    );
    await cliente.query(
      `insert into public.entradas (
        restaurante_id, cod_entrada, aberta_em, dia_operacao, valor_consumido,
        pago, hash_origem
      ) values ($1, 88001, now(), current_date, 12.34, true, 'fixture-retencao')`,
      [dados.restauranteA]
    );
    const job = await cliente.query<{ command: string }>(
      "select command from cron.job where jobname = 'rf-retencao' and active"
    );
    expect(job.rowCount).toBe(1);
    await cliente.query(job.rows[0]?.command ?? "select 1");
    const envios = await cliente.query<{
      http_status: number;
      payload: unknown;
      recebidas: number;
    }>(
      "select http_status, payload, recebidas from public.envios where restaurante_id = $1 order by recebidas",
      [dados.restauranteA]
    );
    expect(envios.rows).toEqual([
      { http_status: 200, payload: null, recebidas: 3 },
      { http_status: 200, payload, recebidas: 4 },
      { http_status: 422, payload: null, recebidas: 5 },
      { http_status: 422, payload, recebidas: 6 },
    ]);
    expect(
      await cliente.query(
        "select cod_entrada from public.entradas where restaurante_id = $1 and cod_entrada = 88001",
        [dados.restauranteA]
      )
    ).toHaveProperty("rowCount", 1);
  });

  it("calcula em_dia, atrasado, parado, fechado e sem sinal no fuso da fixture sem persistir efeitos globais", async () => {
    const dados = fixture as Fixture;
    await comSinaisEstaveis(banco as Client, async (cliente) => {
      const sinaisAntes = (
        await cliente.query<SinalSnapshot>(
          `select restaurante_id::text, primeiro_envio_em::text, ultimo_envio_em::text,
                ultimo_envio_ok_em::text, ultimo_erro_em::text, estado,
                estado_desde::text, alarme_enviado_em::text
           from public.sinal_de_vida order by restaurante_id`
        )
      ).rows;
      await cliente.query("savepoint efeitos_vigia");
      await cliente.query(
        "update public.restaurantes set fuso = 'America/Fortaleza', horario_funcionamento = $2::jsonb where id = $1",
        [
          dados.restauranteA,
          JSON.stringify(
            Array.from({ length: 7 }, (_, dia) => ({
              dia,
              abre: "00:00",
              fecha: "00:00",
            }))
          ),
        ]
      );
      await cliente.query(
        `insert into public.sinal_de_vida (restaurante_id, primeiro_envio_em, ultimo_envio_ok_em, alarme_enviado_em)
       values ($1, now() - interval '10 minutes', now() - interval '10 minutes', now())`,
        [dados.restauranteA]
      );
      await cliente.query("select public.atualizar_estados()");
      const estado = () =>
        cliente.query<{ estado: string }>(
          "select estado from public.sinal_de_vida where restaurante_id = $1",
          [dados.restauranteA]
        );
      expect((await estado()).rows[0]?.estado).toBe("em_dia");
      await cliente.query(
        "update public.sinal_de_vida set ultimo_envio_ok_em = now() - interval '20 minutes' where restaurante_id = $1",
        [dados.restauranteA]
      );
      await cliente.query("select public.atualizar_estados()");
      expect((await estado()).rows[0]?.estado).toBe("atrasado");
      await cliente.query(
        "update public.sinal_de_vida set ultimo_envio_ok_em = now() - interval '46 minutes', alarme_enviado_em = now() where restaurante_id = $1",
        [dados.restauranteA]
      );
      await cliente.query("select public.atualizar_estados()");
      expect((await estado()).rows[0]?.estado).toBe("parado");
      const proximoDia = await cliente.query<{ dia: number }>(
        "select ((extract(dow from now() at time zone 'America/Fortaleza')::int + 1) % 7) as dia"
      );
      await cliente.query(
        `update public.restaurantes
          set horario_funcionamento = $2::jsonb
        where id = $1`,
        [
          dados.restauranteA,
          JSON.stringify([
            { dia: proximoDia.rows[0]?.dia, abre: "12:00", fecha: "13:00" },
          ]),
        ]
      );
      await cliente.query(
        "update public.sinal_de_vida set alarme_enviado_em = null where restaurante_id = $1",
        [dados.restauranteA]
      );
      await cliente.query("select public.atualizar_estados()");
      expect((await estado()).rows[0]?.estado).toBe("fechado");
      expect(
        await cliente.query(
          "select 1 from public.sinal_de_vida where restaurante_id = $1",
          [dados.restauranteB]
        )
      ).toHaveProperty("rowCount", 0);
      await cliente.query("rollback to savepoint efeitos_vigia");
      const sinaisDepois = (
        await cliente.query<SinalSnapshot>(
          `select restaurante_id::text, primeiro_envio_em::text, ultimo_envio_em::text,
                ultimo_envio_ok_em::text, ultimo_erro_em::text, estado,
                estado_desde::text, alarme_enviado_em::text
           from public.sinal_de_vida order by restaurante_id`
        )
      ).rows;
      expect(sinaisDepois).toEqual(sinaisAntes);
      // Uma leitura consistente exige também impedir UPDATE do cron até a
      // comparação, inclusive depois de ROLLBACK TO efeitos_vigia.
      const escritor = await conectarBanco();
      try {
        await escritor.query("begin");
        await expect(
          escritor.query(
            "lock table public.sinal_de_vida in row exclusive mode nowait"
          )
        ).rejects.toHaveProperty("code", "55P03");
      } finally {
        await escritor.query("rollback");
        await escritor.end();
      }
    });
  });

  it("libera trava e efeitos em erro SQL limitado, preservando a transação externa", async () => {
    const cliente = banco as Client;
    const dados = fixture as Fixture;
    await expect(
      comSinaisEstaveis(cliente, async (consulta) => {
        await consulta.query(
          "insert into public.sinal_de_vida (restaurante_id) values ($1)",
          [dados.restauranteA]
        );
        await consulta.query("select pg_sleep(2)");
      })
    ).rejects.toHaveProperty("code", "57014");
    expect(
      (
        await cliente.query(
          "select 1 from public.sinal_de_vida where restaurante_id = $1",
          [dados.restauranteA]
        )
      ).rowCount
    ).toBe(0);
    const escritor = await conectarBanco();
    try {
      await escritor.query("begin");
      await escritor.query(
        "lock table public.sinal_de_vida in row exclusive mode nowait"
      );
    } finally {
      await escritor.query("rollback");
      await escritor.end();
    }
  });

  it("limita espera por escritor real e recupera savepoint após lock_timeout", async () => {
    const cliente = banco as Client;
    const escritor = await conectarBanco();
    try {
      await escritor.query("begin");
      await escritor.query(
        "lock table public.sinal_de_vida in row exclusive mode"
      );
      await expect(
        comSinaisEstaveis(cliente, async (consulta) => {
          await consulta.query("select 1");
        })
      ).rejects.toHaveProperty("code", "55P03");
      expect((await cliente.query("select 1 as vivo")).rows[0]?.vivo).toBe(1);
    } finally {
      await escritor.query("rollback");
      await escritor.end();
    }
  });

  it("encerra fase no orçamento total, libera a trava e recusa consulta tardia", async () => {
    const cliente = banco as Client;
    const dados = fixture as Fixture;
    let tentativaTardia: Promise<unknown> | undefined;
    await expect(
      comSinaisEstaveis(cliente, async (consulta) => {
        await new Promise((resolve) => setTimeout(resolve, 1700));
        tentativaTardia = consulta.query(
          "insert into public.sinal_de_vida (restaurante_id) values ($1)",
          [dados.restauranteA]
        );
        return await tentativaTardia;
      })
    ).rejects.toThrow("fase vigia excedeu 1500ms");
    const escritor = await conectarBanco();
    try {
      await escritor.query("begin");
      await escritor.query(
        "lock table public.sinal_de_vida in row exclusive mode nowait"
      );
    } finally {
      await escritor.query("rollback");
      await escritor.end();
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(tentativaTardia).toBeDefined();
    await expect(tentativaTardia).rejects.toThrow("fase vigia encerrada");
    expect(
      (
        await cliente.query(
          "select 1 from public.sinal_de_vida where restaurante_id = $1",
          [dados.restauranteA]
        )
      ).rowCount
    ).toBe(0);
  });

  it("mantém jobs ativos com comando e horários contratados", async () => {
    const cliente = banco as Client;
    const jobs = await cliente.query<{
      jobname: string;
      schedule: string;
      active: boolean;
      command: string;
    }>(
      "select jobname, schedule, active, command from cron.job where jobname in ('rf-vigia', 'rf-retencao') order by jobname"
    );
    expect(jobs.rows).toEqual([
      expect.objectContaining({
        jobname: "rf-retencao",
        schedule: "0 5 * * *",
        active: true,
      }),
      expect.objectContaining({
        jobname: "rf-vigia",
        schedule: "*/5 * * * *",
        active: true,
      }),
    ]);
    expect(jobs.rows[0]?.command).toContain("payload = null");
    expect(jobs.rows[1]?.command).toContain("public.atualizar_estados()");
  });
});
