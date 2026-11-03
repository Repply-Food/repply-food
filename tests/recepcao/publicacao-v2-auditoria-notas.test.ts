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

describe("publicação SCC de auditoria e notas", () => {
  let banco: Client;
  let casas: Fixture;
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

  it("publica financeiro sem depender dos tipos de auditoria e notas", async () => {
    const pagina = { ...fixtures[7], id_envio: randomUUID() };
    await banco.query("begin");
    try {
      const { rows } = await banco.query<{ recibo: { estado: string } }>(
        "select public.receber_pagina_scc_v2($1,$2::jsonb) as recibo",
        [casas.restauranteA, JSON.stringify(pagina)]
      );
      expect(rows[0]?.recibo.estado).toBe("publicada");
    } finally {
      await banco.query("rollback");
    }
  });
  it.each([5, 6])(
    "publica, repete, corrige e esvazia tipo %i isolando casa e fonte",
    async (indice) => {
      const exemplo = indice === 5 ? fixtures[5] : fixtures[6];
      const inicial = { ...exemplo, id_envio: randomUUID() };
      const receber = (casa: string, p: unknown) =>
        banco.query<{ recibo: { estado: string; repetida: boolean } }>(
          "select public.receber_pagina_scc_v2($1,$2::jsonb) as recibo",
          [casa, JSON.stringify(p)]
        );
      const recibo = (await receber(casas.restauranteA, inicial)).rows[0]
        ?.recibo;
      expect(recibo).toMatchObject({ estado: "publicada", repetida: false });
      expect(
        (await receber(casas.restauranteA, inicial)).rows[0]?.recibo
      ).toEqual({ ...recibo, repetida: true });
      await receber(casas.restauranteA, {
        ...inicial,
        id_envio: randomUUID(),
        fonte: "historico",
      });
      await receber(casas.restauranteB, { ...inicial, id_envio: randomUUID() });
      const linhas =
        indice === 5
          ? [fixtures[5].dados[0], fixtures[5].dados[0]]
          : [{ ...fixtures[6].dados[0], valor: "2.25" }];
      const correcao = {
        ...inicial,
        id_envio: randomUUID(),
        sequencia: "2",
        dados: linhas,
        total_registros: linhas.length,
      };
      await receber(casas.restauranteA, correcao);
      const tabela =
        indice === 5 ? "eventos_auditoria_scc" : "notas_assinadas_scc";
      const { rows } = await banco.query<{ posicao: number }>(
        `select posicao from public.${tabela} where restaurante_id=$1 and fonte='online' order by posicao`,
        [casas.restauranteA]
      );
      expect(rows).toEqual(
        indice === 5 ? [{ posicao: 1 }, { posicao: 2 }] : [{ posicao: 1 }]
      );
      await receber(casas.restauranteA, {
        ...inicial,
        id_envio: randomUUID(),
        sequencia: "3",
        dados: [],
        total_registros: 0,
      });
      const fotografia = await banco.query<{
        fonte: string;
        quantidade: number;
      }>(
        "select fonte,quantidade from public.fotografias_scc where restaurante_id=$1 and tipo_envio=$2 order by fonte",
        [casas.restauranteA, inicial.tipo_envio]
      );
      expect(fotografia.rows).toEqual([
        { fonte: "historico", quantidade: 1 },
        { fonte: "online", quantidade: 0 },
      ]);
      expect(
        (
          await banco.query(
            `select * from public.${tabela} where restaurante_id=$1`,
            [casas.restauranteB]
          )
        ).rows
      ).toHaveLength(1);
    }
  );

  it.each([5, 6])(
    "reverte a correção do tipo %i ao falhar a segunda gravação",
    async (indice) => {
      const fixture = await criarFixture(banco);
      const inicial = {
        ...(indice === 5 ? fixtures[5] : fixtures[6]),
        id_envio: randomUUID(),
      };
      const tabela =
        indice === 5 ? "eventos_auditoria_scc" : "notas_assinadas_scc";
      const receber = (p: unknown) =>
        banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
          fixture.restauranteA,
          JSON.stringify(p),
        ]);
      try {
        await receber(inicial);
        await banco.query("begin");
        try {
          await banco.query(`create function pg_temp.falhar_auditoria_notas() returns trigger language plpgsql as $$
          begin if new.posicao=2 then raise exception 'falha_teste'; end if; return new; end $$`);
          await banco.query(
            `create trigger falhar_auditoria_notas before insert on public.${tabela} for each row execute function pg_temp.falhar_auditoria_notas()`
          );
          const linhas =
            indice === 5
              ? [fixtures[5].dados[0], fixtures[5].dados[0]]
              : [
                  fixtures[6].dados[0],
                  { ...fixtures[6].dados[0], codigo_nota: "2" },
                ];
          await expect(
            receber({
              ...inicial,
              id_envio: randomUUID(),
              sequencia: "2",
              dados: linhas,
              total_registros: 2,
            })
          ).rejects.toMatchObject({ message: "falha_teste" });
        } finally {
          await banco.query("rollback");
        }
        const { rows } = await banco.query<{
          id_envio: string;
          n: string;
          revisao: string;
        }>(
          `select f.id_envio,r.revisao::text,(select count(*) from public.${tabela} where restaurante_id=$1) as n
         from public.fotografias_scc f join public.revisoes_scc r using(restaurante_id)
         where f.restaurante_id=$1 and f.tipo_envio=$2`,
          [fixture.restauranteA, inicial.tipo_envio]
        );
        expect(rows).toEqual([
          { id_envio: inicial.id_envio, n: "1", revisao: "1" },
        ]);
      } finally {
        await limparFixture(banco, fixture);
      }
    }
  );

  it.each([5, 6])(
    "recusa dado pessoal desconhecido no tipo %i",
    async (indice) => {
      const exemplo = indice === 5 ? fixtures[5] : fixtures[6];
      const pagina = {
        ...exemplo,
        id_envio: randomUUID(),
        dados: [{ ...exemplo.dados[0], nome_cliente: "segredo fictício" }],
      };
      await expect(
        banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
          casas.restauranteA,
          JSON.stringify(pagina),
        ])
      ).rejects.toMatchObject({ code: "PR422" });
      const { rows } = await banco.query<{ n: string }>(
        "select count(*) as n from public.cargas_scc where restaurante_id=$1 and id_envio=$2",
        [casas.restauranteA, pagina.id_envio]
      );
      expect(rows[0]?.n).toBe("0");
    }
  );
});
