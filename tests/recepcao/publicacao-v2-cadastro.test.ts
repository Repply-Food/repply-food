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

describe("publicação incremental de cadastro SCC", () => {
  let banco: Client;
  let casa: Fixture;
  beforeAll(async () => {
    banco = await conectarBanco();
    casa = await criarFixture(banco);
  });
  afterAll(async () => {
    try {
      if (casa) await limparFixture(banco, casa);
    } finally {
      await banco?.end();
    }
  });

  it("rejeita páginas adulteradas antes de alterar produtos ou cursor", async () => {
    await banco.query("begin");
    try {
      const id = randomUUID();
      const primeira = {
        ...fixtures[1],
        id_envio: id,
        pagina: { numero: 1, total: 2 },
        total_registros: 2,
      };
      await banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
        casa.restauranteA,
        JSON.stringify(primeira),
      ]);
      const segunda = {
        ...primeira,
        pagina: { numero: 2, total: 2 },
        dados: [{ ...primeira.dados[0], codigo_produto: "002" }],
      };
      await banco.query(
        `insert into public.paginas_scc(restaurante_id,id_envio,numero,hash,quantidade,bytes,dados)
        values($1,$2,2,repeat('a',64),1,octet_length(convert_to(($3::jsonb)::text,'UTF8')),$3::jsonb->'dados')`,
        [casa.restauranteA, id, JSON.stringify(segunda)]
      );
      await banco.query(
        "update public.cargas_scc c set bytes_recebidos=(select sum(p.bytes) from public.paginas_scc p where p.restaurante_id=c.restaurante_id and p.id_envio=c.id_envio) where c.restaurante_id=$1 and c.id_envio=$2",
        [casa.restauranteA, id]
      );
      await expect(
        banco.query("select public.publicar_carga_scc_v2($1,$2)", [
          casa.restauranteA,
          id,
        ])
      ).rejects.toMatchObject({ code: "PR422", message: "carga_scc_invalida" });
    } finally {
      await banco.query("rollback");
    }
    const { rows } = await banco.query<{ produtos: string; cursores: string }>(
      "select (select count(*) from public.produtos_scc where restaurante_id=$1) as produtos, (select count(*) from public.cursores_scc where restaurante_id=$1) as cursores",
      [casa.restauranteA]
    );
    expect(rows[0]).toEqual({ produtos: "0", cursores: "0" });
  });

  it("publica carga íntegra em staging e grava cursor", async () => {
    await banco.query("begin");
    try {
      const id = randomUUID();
      const primeira = {
        ...fixtures[1],
        id_envio: id,
        pagina: { numero: 1, total: 2 },
        total_registros: 2,
      };
      await banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
        casa.restauranteA,
        JSON.stringify(primeira),
      ]);
      const segunda = {
        ...primeira,
        pagina: { numero: 2, total: 2 },
        dados: [{ ...primeira.dados[0], codigo_produto: "002" }],
      };
      await banco.query(
        `insert into public.paginas_scc(restaurante_id,id_envio,numero,hash,quantidade,bytes,dados)
        values($1,$2,2,encode(extensions.digest(convert_to(($3::jsonb->'dados')::text,'UTF8'),'sha256'),'hex'),1,
        octet_length(convert_to(($3::jsonb)::text,'UTF8')),$3::jsonb->'dados')`,
        [casa.restauranteA, id, JSON.stringify(segunda)]
      );
      await banco.query(
        "update public.cargas_scc c set bytes_recebidos=(select sum(p.bytes) from public.paginas_scc p where p.restaurante_id=c.restaurante_id and p.id_envio=c.id_envio) where c.restaurante_id=$1 and c.id_envio=$2",
        [casa.restauranteA, id]
      );
      const { rows } = await banco.query<{ recibo: { estado: string } }>(
        "select public.publicar_carga_scc_v2($1,$2) as recibo",
        [casa.restauranteA, id]
      );
      expect(rows[0]?.recibo.estado).toBe("publicada");
      const resultado = await banco.query<{
        produtos: string;
        sequencia: string;
      }>(
        "select (select count(*) from public.produtos_scc where restaurante_id=$1) as produtos,(select sequencia::text from public.cursores_scc where restaurante_id=$1 and tipo_envio='cadastro_produtos') as sequencia",
        [casa.restauranteA]
      );
      expect(resultado.rows[0]).toEqual({ produtos: "2", sequencia: "1" });
    } finally {
      await banco.query("rollback");
    }
  });

  it("serializa dois publicadores para a mesma carga", async () => {
    const id = randomUUID();
    const primeira = {
      ...fixtures[1],
      id_envio: id,
      pagina: { numero: 1, total: 2 },
      total_registros: 2,
    };
    await banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
      casa.restauranteB,
      JSON.stringify(primeira),
    ]);
    const segunda = {
      ...primeira,
      pagina: { numero: 2, total: 2 },
      dados: [{ ...primeira.dados[0], codigo_produto: "002" }],
    };
    await banco.query(
      `insert into public.paginas_scc(restaurante_id,id_envio,numero,hash,quantidade,bytes,dados)
      values($1,$2,2,encode(extensions.digest(convert_to(($3::jsonb->'dados')::text,'UTF8'),'sha256'),'hex'),1,
      octet_length(convert_to(($3::jsonb)::text,'UTF8')),$3::jsonb->'dados')`,
      [casa.restauranteB, id, JSON.stringify(segunda)]
    );
    await banco.query(
      "update public.cargas_scc c set bytes_recebidos=(select sum(p.bytes) from public.paginas_scc p where p.restaurante_id=c.restaurante_id and p.id_envio=c.id_envio) where c.restaurante_id=$1 and c.id_envio=$2",
      [casa.restauranteB, id]
    );
    const a = await conectarBanco();
    const b = await conectarBanco();
    try {
      const resultados = await Promise.allSettled(
        [a, b].map((cliente) =>
          cliente.query("select public.publicar_carga_scc_v2($1,$2)", [
            casa.restauranteB,
            id,
          ])
        )
      );
      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(
        1
      );
      const erro = resultados.find((r) => r.status === "rejected");
      if (erro?.status === "rejected")
        expect(erro.reason).toMatchObject({ code: "PR422" });
      else throw new Error("publicação concorrente não recusada");
      const { rows } = await banco.query<{ n: string }>(
        "select count(*) as n from public.produtos_scc where restaurante_id=$1",
        [casa.restauranteB]
      );
      expect(rows[0]?.n).toBe("2");
    } finally {
      await Promise.all([a.end(), b.end()]);
    }
  });

  it("reverte atualizações parciais quando a segunda gravação falha", async () => {
    const fixture = await criarFixture(banco);
    const receber = (pagina: unknown) =>
      banco.query("select public.receber_pagina_scc_v2($1,$2::jsonb)", [
        fixture.restauranteA,
        JSON.stringify(pagina),
      ]);
    try {
      await receber({ ...fixtures[1], id_envio: randomUUID() });
      await banco.query("begin");
      try {
        await banco.query(`create function pg_temp.falhar_produto_teste() returns trigger language plpgsql as $$
          begin if new.codigo_produto='999' then raise exception 'falha_teste'; end if; return new; end $$`);
        await banco.query(
          "create trigger falhar_produto_teste before insert or update on public.produtos_scc for each row execute function pg_temp.falhar_produto_teste()"
        );
        const primeira = {
          ...fixtures[1],
          id_envio: randomUUID(),
          sequencia: "2",
          pagina: { numero: 1, total: 2 },
          total_registros: 2,
          dados: [{ ...fixtures[1].dados[0], produto: "Alterado" }],
        };
        await receber(primeira);
        await expect(
          receber({
            ...primeira,
            pagina: { numero: 2, total: 2 },
            dados: [{ ...primeira.dados[0], codigo_produto: "999" }],
          })
        ).rejects.toMatchObject({ message: "falha_teste" });
      } finally {
        await banco.query("rollback");
      }
      const { rows } = await banco.query<{
        produto: string;
        sequencia: string;
      }>(
        `select p.produto,c.sequencia::text from public.produtos_scc p join public.cursores_scc c on c.restaurante_id=p.restaurante_id
         where p.restaurante_id=$1 and p.codigo_produto='001' and c.tipo_envio='cadastro_produtos'`,
        [fixture.restauranteA]
      );
      expect(rows).toEqual([{ produto: "Água", sequencia: "1" }]);
    } finally {
      await limparFixture(banco, fixture);
    }
  });

  it("publica duas páginas automaticamente e mantém cadastro ausente ao desativar", async () => {
    const id = randomUUID();
    const produto = fixtures[1].dados[0];
    const primeira = {
      ...fixtures[1],
      id_envio: id,
      pagina: { numero: 1, total: 2 },
      total_registros: 2,
    };
    const segunda = {
      ...primeira,
      pagina: { numero: 2, total: 2 },
      dados: [{ ...produto, codigo_produto: "002", produto: "Café" }],
    };
    const receber = (p: unknown) =>
      banco.query<{ recibo: { estado: string; repetida: boolean } }>(
        "select public.receber_pagina_scc_v2($1,$2::jsonb) as recibo",
        [casa.restauranteA, JSON.stringify(p)]
      );
    expect((await receber(primeira)).rows[0]?.recibo.estado).toBe("recebendo");
    expect(
      (
        await banco.query(
          "select * from public.produtos_scc where restaurante_id=$1",
          [casa.restauranteA]
        )
      ).rows
    ).toHaveLength(0);
    const recibo = (await receber(segunda)).rows[0]?.recibo;
    expect(recibo).toMatchObject({ estado: "publicada", repetida: false });
    expect((await receber(segunda)).rows[0]?.recibo).toEqual({
      ...recibo,
      repetida: true,
    });
    const nova = {
      ...fixtures[1],
      id_envio: randomUUID(),
      sequencia: "2",
      dados: [{ ...produto, ativo: false, produto: "Água sem gás" }],
    };
    expect((await receber(nova)).rows[0]?.recibo.estado).toBe("publicada");
    const { rows } = await banco.query(
      "select codigo_produto,produto,ativo from public.produtos_scc where restaurante_id=$1 order by codigo_produto",
      [casa.restauranteA]
    );
    expect(rows).toEqual([
      { codigo_produto: "001", produto: "Água sem gás", ativo: false },
      { codigo_produto: "002", produto: "Café", ativo: true },
    ]);
    await expect(
      receber({ ...nova, id_envio: randomUUID(), sequencia: "1" })
    ).rejects.toMatchObject({ code: "PR409" });
  });
});
