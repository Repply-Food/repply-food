// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  comoAutenticado,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";
import {
  casosLinhasInvalidas,
  casosLinhasValidas,
  linhasRelatorios,
} from "../relatorios/fixtures";

const tecnicas = ["relatorio_cargas", "relatorio_paginas"];
const cache = [
  "relatorio_linhas",
  "relatorio_publicacoes",
  "relatorio_versoes",
];

describe("cache privado de relatórios", () => {
  let banco: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
    for (const casa of fixture.idsRestaurantes) {
      const carga = randomUUID();
      await banco.query(
        `insert into public.relatorio_cargas
         (restaurante_id,id,relatorio,dia_movimento,fonte,sequencia,capturado_em,
          natureza,recursos,total_paginas,total_linhas,estado)
         values ($1,$2,'produtos','2026-02-14','historico',1,now(),
                 'simulacao','{}',1,1,'publicada')`,
        [casa, carga]
      );
      await banco.query(
        `insert into public.relatorio_publicacoes
         (restaurante_id,relatorio,dia_movimento,fonte,carga_id,sequencia,
          capturado_em,natureza,recursos,quantidade)
         values ($1,'produtos','2026-02-14','historico',$2,1,now(),'simulacao','{}',1)`,
        [casa, carga]
      );
      await banco.query(
        `insert into public.relatorio_linhas
         (restaurante_id,relatorio,dia_movimento,fonte,posicao,dados)
         values ($1,'produtos','2026-02-14','historico',1,$2::jsonb)`,
        [casa, JSON.stringify(linhasRelatorios.produtos)]
      );
      const vazia = randomUUID();
      await banco.query(
        `insert into public.relatorio_cargas
         (restaurante_id,id,relatorio,dia_movimento,fonte,sequencia,capturado_em,
          natureza,recursos,total_paginas,total_linhas,estado)
         values ($1,$2,'comissao','2026-02-14','historico',1,now(),'simulacao','{}',1,0,'publicada')`,
        [casa, vazia]
      );
      await banco.query(
        `insert into public.relatorio_publicacoes
         (restaurante_id,relatorio,dia_movimento,fonte,carga_id,sequencia,
          capturado_em,natureza,recursos,quantidade)
         values ($1,'comissao','2026-02-14','historico',$2,1,now(),'simulacao','{}',0)`,
        [casa, vazia]
      );
      await banco.query(
        "insert into public.relatorio_versoes (restaurante_id) values ($1)",
        [casa]
      );
    }
  });

  afterAll(async () => {
    if (!banco) return;
    try {
      if (fixture) {
        for (const tabela of [
          ...cache,
          "relatorio_paginas",
          "relatorio_cargas",
        ]) {
          await banco.query(
            `delete from public.${tabela} where restaurante_id = any($1::uuid[])`,
            [fixture.idsRestaurantes]
          );
        }
        await limparFixture(banco, fixture);
      }
    } finally {
      await banco.end();
    }
  });

  it("A só lê A, B só lê B e admin lê ambas as publicações vazias", async () => {
    for (const [usuario, casas] of [
      [fixture.usuarioA, [fixture.restauranteA]],
      [fixture.usuarioB, [fixture.restauranteB]],
      [fixture.usuarioSemAcesso, []],
      [fixture.admin, fixture.idsRestaurantes],
    ] as const) {
      const resultado = await comoAutenticado(banco, usuario, () =>
        banco.query(
          "select restaurante_id,quantidade from public.relatorio_publicacoes where relatorio = 'comissao' and restaurante_id = any($1::uuid[])",
          [fixture.idsRestaurantes]
        )
      );
      expect(resultado.rows.map((r) => r.restaurante_id).sort()).toEqual(
        [...casas].sort()
      );
      expect(resultado.rows.every((r) => r.quantidade === 0)).toBe(true);
      for (const tabela of ["relatorio_linhas", "relatorio_versoes"]) {
        const { rows } = await comoAutenticado(banco, usuario, () =>
          banco.query(
            `select restaurante_id from public.${tabela} where restaurante_id = any($1::uuid[])`,
            [fixture.idsRestaurantes]
          )
        );
        expect(rows.map((r) => r.restaurante_id).sort()).toEqual(
          [...casas].sort()
        );
      }
    }
  });

  it("nenhum cliente ou admin lê staging ou escreve cache", async () => {
    for (const usuario of [
      fixture.usuarioA,
      fixture.usuarioB,
      fixture.usuarioSemAcesso,
      fixture.admin,
    ]) {
      for (const tabela of tecnicas) {
        await expect(
          comoAutenticado(banco, usuario, () =>
            banco.query(`select * from public.${tabela}`)
          )
        ).rejects.toMatchObject({ code: "42501" });
      }
      for (const tabela of [...cache, ...tecnicas]) {
        await expect(
          comoAutenticado(banco, usuario, () =>
            banco.query(
              `insert into public.${tabela} (restaurante_id) values ($1)`,
              [fixture.restauranteA]
            )
          )
        ).rejects.toMatchObject({ code: "42501" });
        for (const sql of [
          `update public.${tabela} set restaurante_id = $2 where restaurante_id = $1`,
          `delete from public.${tabela} where restaurante_id = $1 and $2::uuid is not null`,
        ]) {
          await expect(
            comoAutenticado(banco, usuario, () =>
              banco.query(sql, [fixture.restauranteA, fixture.restauranteB])
            )
          ).rejects.toMatchObject({ code: "42501" });
        }
      }
    }
  });

  it("anônimo não lê nenhuma tabela", async () => {
    for (const tabela of [...tecnicas, ...cache]) {
      await banco.query("begin");
      try {
        await banco.query("set local role anon");
        await expect(
          banco.query(`select * from public.${tabela}`)
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await banco.query("rollback");
      }
    }
  });

  it("anônimo não escreve cache nem staging", async () => {
    for (const tabela of [...tecnicas, ...cache]) {
      for (const sql of [
        `insert into public.${tabela} (restaurante_id) values ($1)`,
        `update public.${tabela} set restaurante_id = $1`,
        `delete from public.${tabela} where restaurante_id = $1`,
      ]) {
        await banco.query("begin");
        try {
          await banco.query("set local role anon");
          await expect(
            banco.query(sql, [fixture.restauranteA])
          ).rejects.toMatchObject({ code: "42501" });
        } finally {
          await banco.query("rollback");
        }
      }
    }
  });

  it("o gatilho impede mudar a casa inclusive por acesso privilegiado", async () => {
    await expect(
      banco.query(
        "update public.relatorio_versoes set restaurante_id = $2 where restaurante_id = $1",
        [fixture.restauranteA, randomUUID()]
      )
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("a chave composta impede anexar página à carga de outra casa", async () => {
    const { rows } = await banco.query(
      "select id from public.relatorio_cargas where restaurante_id = $1 limit 1",
      [fixture.restauranteA]
    );
    await expect(
      banco.query(
        `insert into public.relatorio_paginas (restaurante_id,carga_id,numero,dados,hash,quantidade,bytes)
       values ($1,$2,1,'[]','ficticio',0,2)`,
        [fixture.restauranteB, rows[0].id]
      )
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejeita metadados e limites inválidos antes da ingestão", async () => {
    for (const alteracao of [
      "recursos = array['operador']",
      "recursos = array['pdv','pdv']",
      "recursos = array[null]::text[]",
      "bytes_recebidos = 33554433",
      "total_paginas = 201",
      "total_linhas = -1",
      "sequencia = 0",
      "natureza = 'outra'",
      "fonte = 'outra'",
      "relatorio = 'outro'",
    ]) {
      await expect(
        banco.query(
          `update public.relatorio_cargas set ${alteracao} where restaurante_id = $1 and relatorio = 'produtos'`,
          [fixture.restauranteA]
        )
      ).rejects.toMatchObject({ code: "23514" });
    }
    for (const alteracao of [
      "quantidade = -1",
      "fonte = 'outra'",
      "natureza = 'outra'",
      "recursos = array['cliente']",
    ]) {
      await expect(
        banco.query(
          `update public.relatorio_publicacoes set ${alteracao} where restaurante_id = $1 and relatorio = 'produtos'`,
          [fixture.restauranteA]
        )
      ).rejects.toMatchObject({ code: "23514" });
    }
    const { rows } = await banco.query(
      "select id from public.relatorio_cargas where restaurante_id = $1 limit 1",
      [fixture.restauranteA]
    );
    for (const [quantidade, bytes] of [
      [501, 2],
      [0, 1048577],
      [0, -1],
      [-1, 2],
    ]) {
      await expect(
        banco.query(
          `insert into public.relatorio_paginas (restaurante_id,carga_id,numero,dados,hash,quantidade,bytes)
         values ($1,$2,1,null,'ficticio',$3,$4)`,
          [fixture.restauranteA, rows[0].id, quantidade, bytes]
        )
      ).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("service_role usa RPCs e não recebe privilégios diretos nas tabelas", async () => {
    for (const tabela of [...tecnicas, ...cache]) {
      const { rows } = await banco.query(
        `select has_table_privilege('service_role',$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as permitido`,
        [`public.${tabela}`]
      );
      expect(rows[0].permitido).toBe(false);
    }
  });

  it.each(casosLinhasValidas)(
    "aceita a linha canônica %s",
    async (relatorio, linha) => {
      await expect(
        banco.query("select public.validar_linha_relatorio($1,$2::jsonb)", [
          relatorio,
          JSON.stringify(linha),
        ])
      ).resolves.toBeDefined();
    }
  );

  it.each(Object.entries(linhasRelatorios))(
    "recusa campo pessoal e obrigatório ausente em %s",
    async (relatorio, linha) => {
      for (const invalida of [
        { ...linha, NomeCliente: "Pessoa fictícia" },
        {},
      ]) {
        await expect(
          banco.query("select public.validar_linha_relatorio($1,$2::jsonb)", [
            relatorio,
            JSON.stringify(invalida),
          ])
        ).rejects.toMatchObject({
          code: "22023",
          message: "linha_relatorio_invalida",
        });
      }
    }
  );

  it("recusa decimal impreciso, tipos falsos, subobjetos extras e público repetido", async () => {
    for (const [relatorio, linha] of casosLinhasInvalidas) {
      await expect(
        banco.query("select public.validar_linha_relatorio($1,$2::jsonb)", [
          relatorio,
          JSON.stringify(linha),
        ])
      ).rejects.toMatchObject({
        code: "22023",
        message: "linha_relatorio_invalida",
      });
    }
  });
});
