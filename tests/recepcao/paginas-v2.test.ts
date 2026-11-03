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
import { fixtures } from "./fixtures-v2";

describe("staging do webhook SCC v2", () => {
  let banco: Client;
  let casas: Fixture;
  const id = randomUUID();
  const pagina = {
    ...fixtures[5],
    id_envio: id,
    pagina: { numero: 1, total: 2 },
    total_registros: 2,
  };
  const receber = (casa: string, corpo: unknown) =>
    banco.query<{ recibo: { estado: string; repetida: boolean } }>(
      "select public.receber_pagina_scc_v2($1,$2::jsonb) as recibo",
      [casa, JSON.stringify(corpo)]
    );

  beforeAll(async () => {
    banco = await conectarBanco();
    casas = await criarFixture(banco);
  });

  afterAll(async () => {
    try {
      if (casas) await limparFixture(banco, casas);
    } finally {
      await banco?.end();
    }
  });

  it("guarda página incompleta sem publicar e reconhece repetição", async () => {
    const primeiro = await receber(casas.restauranteA, pagina);
    expect(primeiro.rows[0]?.recibo).toMatchObject({
      estado: "recebendo",
      repetida: false,
    });
    const repetido = await receber(casas.restauranteA, pagina);
    expect(repetido.rows[0]?.recibo).toMatchObject({
      estado: "recebendo",
      repetida: true,
    });
    const { rows } = await banco.query<{
      paginas: string;
      fotografias: string;
    }>(
      `select (select count(*) from public.paginas_scc where restaurante_id=$1 and id_envio=$2) as paginas,
              (select count(*) from public.fotografias_scc where restaurante_id=$1) as fotografias`,
      [casas.restauranteA, id]
    );
    expect(rows[0]).toEqual({ paginas: "1", fotografias: "0" });
  });

  it("recusa alteração da mesma página ou do manifesto", async () => {
    const alterada = {
      ...pagina,
      dados: [{ ...pagina.dados[0], quantidade: "2" }],
    };
    await expect(receber(casas.restauranteA, alterada)).rejects.toMatchObject({
      code: "PR409",
    });
    await expect(
      receber(casas.restauranteA, { ...pagina, fonte: "historico" })
    ).rejects.toMatchObject({ code: "PR409" });
  });

  it("recusa retentativa se os dados de página ainda aberta foram apagados", async () => {
    await banco.query("begin");
    try {
      await banco.query(
        "update public.paginas_scc set dados=null where restaurante_id=$1 and id_envio=$2 and numero=1",
        [casas.restauranteA, id]
      );
      await expect(receber(casas.restauranteA, pagina)).rejects.toMatchObject({
        code: "PR409",
      });
    } finally {
      await banco.query("rollback");
    }
  });

  it("isola o mesmo identificador entre casas", async () => {
    const recibo = await receber(casas.restauranteB, pagina);
    expect(recibo.rows[0]?.recibo).toMatchObject({
      estado: "recebendo",
      repetida: false,
    });
  });

  it("publica automaticamente quando chega a última página", async () => {
    await banco.query("begin");
    try {
      const segunda = { ...pagina, pagina: { numero: 2, total: 2 } };
      expect(
        (await receber(casas.restauranteA, segunda)).rows[0]?.recibo.estado
      ).toBe("publicada");
    } finally {
      await banco.query("rollback");
    }
  });

  it("recusa página maior que o máximo e casa inexistente", async () => {
    await expect(
      receber(casas.restauranteA, {
        ...pagina,
        pagina: { numero: 1, total: 201 },
      })
    ).rejects.toMatchObject({ code: "PR413" });
    await expect(receber(randomUUID(), pagina)).rejects.toMatchObject({
      code: "PR422",
    });
    await expect(
      receber(casas.restauranteA, {
        ...pagina,
        versao_scc: "x".repeat(1048576),
      })
    ).rejects.toMatchObject({ code: "PR413" });
  });

  it("recusa nova carga com mesma sequência no mesmo escopo", async () => {
    await expect(
      receber(casas.restauranteA, { ...pagina, id_envio: randomUUID() })
    ).rejects.toMatchObject({ code: "PR409", message: "sequencia_obsoleta" });
    const outroEscopo = {
      ...pagina,
      id_envio: randomUUID(),
      fonte: "historico",
    };
    const recibo = await receber(casas.restauranteA, outroEscopo);
    expect(recibo.rows[0]?.recibo.estado).toBe("recebendo");
  });

  it("limita o tamanho acumulado antes de gravar outra página", async () => {
    await banco.query("begin");
    try {
      await banco.query(
        "update public.cargas_scc set bytes_recebidos=33554432 where restaurante_id=$1 and id_envio=$2",
        [casas.restauranteA, id]
      );
      await expect(
        receber(casas.restauranteA, {
          ...pagina,
          pagina: { numero: 2, total: 2 },
        })
      ).rejects.toMatchObject({ code: "PR413", message: "limite_bytes_carga" });
    } finally {
      await banco.query("rollback");
    }
  });

  it("aceita página fora de ordem sem publicar dados parciais", async () => {
    await banco.query("begin");
    try {
      const foraDeOrdem = {
        ...pagina,
        id_envio: randomUUID(),
        sequencia: "7",
        pagina: { numero: 2, total: 2 },
      };
      const recibo = await receber(casas.restauranteA, foraDeOrdem);
      expect(recibo.rows[0]?.recibo).toMatchObject({ estado: "recebendo" });
      const concluida = await receber(casas.restauranteA, {
        ...foraDeOrdem,
        pagina: { numero: 1, total: 2 },
      });
      expect(concluida.rows[0]?.recibo.estado).toBe("publicada");
    } finally {
      await banco.query("rollback");
    }
  });

  it("limita a dez cargas abertas por casa", async () => {
    await banco.query("begin");
    try {
      const { rows } = await banco.query<{ total: string }>(
        "select count(*) as total from public.cargas_scc where restaurante_id=$1 and estado='recebendo'",
        [casas.restauranteA]
      );
      const existentes = Number(rows[0]?.total);
      for (let i = existentes; i < 10; i++) {
        await receber(casas.restauranteA, {
          ...pagina,
          id_envio: randomUUID(),
          sequencia: String(100 + i),
        });
      }
      await expect(
        receber(casas.restauranteA, {
          ...pagina,
          id_envio: randomUUID(),
          sequencia: "1000",
        })
      ).rejects.toMatchObject({
        code: "PR429",
        message: "limite_cargas_abertas",
      });
    } finally {
      await banco.query("rollback");
    }
  });
});
