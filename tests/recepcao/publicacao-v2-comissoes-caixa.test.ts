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

describe("publicação de comissões e caixa SCC", () => {
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

  it.each([3, 4])(
    "publica, corrige e esvazia tipo %i sem atingir outra fonte ou casa",
    async (indice) => {
      const exemplo = indice === 3 ? fixtures[3] : fixtures[4];
      const inicial = { ...exemplo, id_envio: randomUUID() };
      const receber = (casa: string, p: unknown) =>
        banco.query<{ recibo: { estado: string } }>(
          "select public.receber_pagina_scc_v2($1,$2::jsonb) as recibo",
          [casa, JSON.stringify(p)]
        );
      const antes = await banco.query<{ revisao: string }>(
        "select coalesce((select revisao from public.revisoes_scc where restaurante_id=$1),0)::text as revisao",
        [casas.restauranteA]
      );
      expect(
        (await receber(casas.restauranteA, inicial)).rows[0]?.recibo.estado
      ).toBe("publicada");
      await receber(casas.restauranteA, {
        ...inicial,
        id_envio: randomUUID(),
        fonte: "historico",
      });
      await receber(casas.restauranteB, { ...inicial, id_envio: randomUUID() });
      const tabela = indice === 3 ? "comissoes_scc" : "movimentos_caixa_scc";
      const campo = indice === 3 ? "comissao_oficial" : "valor";
      const anterior = await banco.query<{ valor: string | null }>(
        `select ${campo}::text as valor from public.${tabela} where restaurante_id=$1 and fonte='online'`,
        [casas.restauranteA]
      );
      expect(anterior.rows[0]?.valor).toBe(indice === 3 ? null : "1.000000");
      const alterado =
        indice === 3
          ? { ...fixtures[3].dados[0], comissao_oficial: "12.25" }
          : { ...fixtures[4].dados[0], valor: "10.50" };
      const correcao = {
        ...inicial,
        id_envio: randomUUID(),
        sequencia: "2",
        dados: [alterado],
      };
      expect(
        (await receber(casas.restauranteA, correcao)).rows[0]?.recibo.estado
      ).toBe("publicada");
      await receber(casas.restauranteA, correcao);
      const corrigido = await banco.query<{ valor: string }>(
        `select ${campo}::text as valor from public.${tabela} where restaurante_id=$1 and fonte='online'`,
        [casas.restauranteA]
      );
      expect(corrigido.rows[0]?.valor).toBe(
        indice === 3 ? "12.250000" : "10.500000"
      );
      await receber(casas.restauranteA, {
        ...inicial,
        id_envio: randomUUID(),
        sequencia: "3",
        dados: [],
        total_registros: 0,
      });
      const { rows } = await banco.query<{ fonte: string; quantidade: number }>(
        "select fonte,quantidade from public.fotografias_scc where restaurante_id=$1 and tipo_envio=$2 order by fonte",
        [casas.restauranteA, inicial.tipo_envio]
      );
      expect(rows).toEqual([
        { fonte: "historico", quantidade: 1 },
        { fonte: "online", quantidade: 0 },
      ]);
      const depois = await banco.query<{ revisao: string }>(
        "select revisao::text from public.revisoes_scc where restaurante_id=$1",
        [casas.restauranteA]
      );
      expect(Number(depois.rows[0]?.revisao)).toBe(
        Number(antes.rows[0]?.revisao) + 4
      );
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

  it.each([3, 4])(
    "reverte a substituição do tipo %i quando falha a segunda linha",
    async (indice) => {
      const fixture = await criarFixture(banco);
      const inicial = {
        ...(indice === 3 ? fixtures[3] : fixtures[4]),
        id_envio: randomUUID(),
      };
      const tabela = indice === 3 ? "comissoes_scc" : "movimentos_caixa_scc";
      const receber = (p: unknown) =>
        banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
          fixture.restauranteA,
          JSON.stringify(p),
        ]);
      try {
        await receber(inicial);
        await banco.query("begin");
        try {
          await banco.query(`create function pg_temp.falhar_scc_teste() returns trigger language plpgsql as $$
          begin if new.posicao=2 then raise exception 'falha_scc_teste'; end if; return new; end $$`);
          await banco.query(
            `create trigger falhar_scc_teste before insert on public.${tabela} for each row execute function pg_temp.falhar_scc_teste()`
          );
          const linhas =
            indice === 3
              ? [
                  fixtures[3].dados[0],
                  { ...fixtures[3].dados[0], codigo_operador: "2" },
                ]
              : [
                  fixtures[4].dados[0],
                  { ...fixtures[4].dados[0], codigo_lancamento: "2" },
                ];
          const correcao = {
            ...inicial,
            id_envio: randomUUID(),
            sequencia: "2",
            dados: linhas,
            total_registros: 2,
          };
          await expect(receber(correcao)).rejects.toMatchObject({
            message: "falha_scc_teste",
          });
        } finally {
          await banco.query("rollback");
        }
        const { rows } = await banco.query<{
          id_envio: string;
          quantidade: number;
          revisao: string;
          sequencia: string;
          n: string;
        }>(
          `select f.id_envio,f.quantidade,r.revisao::text,c.sequencia::text,
          (select count(*) from public.${tabela} where restaurante_id=$1) as n
         from public.fotografias_scc f join public.revisoes_scc r using(restaurante_id)
         join public.cursores_scc c on c.restaurante_id=f.restaurante_id and c.tipo_envio=f.tipo_envio
         where f.restaurante_id=$1 and f.tipo_envio=$2`,
          [fixture.restauranteA, inicial.tipo_envio]
        );
        expect(rows).toEqual([
          {
            id_envio: inicial.id_envio,
            quantidade: 1,
            revisao: "1",
            sequencia: "1",
            n: "1",
          },
        ]);
      } finally {
        await limparFixture(banco, fixture);
      }
    }
  );
});
