// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validarEnvioSccV2 } from "../../lib/validators/recepcao";
import { conectarBanco, criarFixture } from "../helpers/supabase-local";
import { fixtures } from "./fixtures-v2";

describe("validação SQL do webhook SCC v2", () => {
  let banco: Client;

  beforeAll(async () => {
    banco = await conectarBanco();
  });

  afterAll(async () => {
    await banco?.end();
  });

  it("disponibiliza o validador privado", async () => {
    const { rows } = await banco.query<{ funcao: string | null }>(
      "select to_regprocedure('public.validar_pagina_scc_v2(jsonb)')::text as funcao"
    );
    expect(rows[0]?.funcao).toBe("validar_pagina_scc_v2(jsonb)");
  });

  it.each([
    "codCartaoMesa",
    "CodGarcon",
    "codOperadorHab",
    "codOperadorDesab",
    "codCliente",
    "NumeroOcupantes",
  ])("aplica a faixa integer do banco a %s no Zod e no SQL", async (campo) => {
    for (const valor of [-2147483649, 2147483648]) {
      const pagina = {
        ...fixtures[0],
        dados: [{ ...fixtures[0].dados[0], [campo]: valor }],
      };
      expect(validarEnvioSccV2(pagina).success).toBe(false);
      await expect(
        banco.query("select public.validar_pagina_scc_v2($1::jsonb)", [
          JSON.stringify(pagina),
        ])
      ).rejects.toMatchObject({ code: "PR422" });
    }
  });

  it.each([
    { ...fixtures[3], dados: null },
    { ...fixtures[3], pagina: { numero: 2, total: 1 } },
  ])("recusa dados nulos ou página além do total", async (pagina) => {
    await expect(
      banco.query("select public.validar_pagina_scc_v2($1::jsonb)", [
        JSON.stringify(pagina),
      ])
    ).rejects.toMatchObject({ code: "PR422" });
  });

  it("aceita uma página válida de comissões", async () => {
    await expect(
      banco.query("select public.validar_pagina_scc_v2($1::jsonb)", [
        JSON.stringify(fixtures[3]),
      ])
    ).resolves.toBeDefined();
  });

  it.each([fixtures[0], fixtures[1], fixtures[2], ...fixtures.slice(4)])(
    "aceita página válida de $tipo_envio",
    async (pagina) => {
      await expect(
        banco.query("select public.validar_pagina_scc_v2($1::jsonb)", [
          JSON.stringify(pagina),
        ])
      ).resolves.toBeDefined();
    }
  );

  it.each([fixtures[0], fixtures[1], fixtures[2], ...fixtures.slice(4)])(
    "recusa campo desconhecido em linha de $tipo_envio",
    async (pagina) => {
      const invalida = {
        ...pagina,
        dados: [{ ...pagina.dados[0], segredo: "não registrar" }],
      };
      await expect(
        banco.query("select public.validar_pagina_scc_v2($1::jsonb)", [
          JSON.stringify(invalida),
        ])
      ).rejects.toMatchObject({
        code: "PR422",
        message: "pagina_scc_invalida",
      });
    }
  );

  it("recusa ordinal negativo em item vendido", async () => {
    const pagina = {
      ...fixtures[2],
      dados: [{ ...fixtures[2].dados[0], ordinal: -1 }],
    };
    await expect(
      banco.query("select public.validar_pagina_scc_v2($1::jsonb)", [
        JSON.stringify(pagina),
      ])
    ).rejects.toMatchObject({ code: "PR422", message: "pagina_scc_invalida" });
  });

  it.each([
    { ...fixtures[1].dados[0], codigo_produto: "inválido!" },
    { ...fixtures[1].dados[0], ativo: "true" },
    { ...fixtures[1].dados[0], alterado_em: "2026-02-30T00:00:00Z" },
  ])("recusa cadastro com escalar inválido", async (linha) => {
    await expect(
      banco.query("select public.validar_pagina_scc_v2($1::jsonb)", [
        JSON.stringify({ ...fixtures[1], dados: [linha] }),
      ])
    ).rejects.toMatchObject({ code: "PR422", message: "pagina_scc_invalida" });
  });

  it.each([
    { ...fixtures[0].dados[0], DataSaida: "2026-11-01", HoraSaida: null },
    { ...fixtures[0].dados[0], ValorItens: "1e2" },
    { ...fixtures[0].dados[0], codEntrada: "1" },
    { ...fixtures[0].dados[0], Reabilitado: { segredo: true } },
  ])("recusa entrada inválida", async (linha) => {
    await expect(
      banco.query("select public.validar_pagina_scc_v2($1::jsonb)", [
        JSON.stringify({ ...fixtures[0], dados: [linha] }),
      ])
    ).rejects.toMatchObject({ code: "PR422", message: "pagina_scc_invalida" });
  });

  it("recusa meios financeiros com códigos duplicados", async () => {
    const meio = { codigo: "1", rotulo: "Pix", classe: "pix", valor: "1" };
    const pagina = {
      ...fixtures[7],
      dados: [{ ...fixtures[7].dados[0], meios: [meio, meio] }],
    };
    await expect(
      banco.query("select public.validar_pagina_scc_v2($1::jsonb)", [
        JSON.stringify(pagina),
      ])
    ).rejects.toMatchObject({ code: "PR422", message: "pagina_scc_invalida" });
  });

  it("aceita 200 páginas e rejeita 201", async () => {
    const base = { ...fixtures[3], total_registros: 1 };
    await expect(
      banco.query("select public.validar_pagina_scc_v2($1::jsonb)", [
        JSON.stringify({ ...base, pagina: { numero: 1, total: 200 } }),
      ])
    ).resolves.toBeDefined();
    await expect(
      banco.query("select public.validar_pagina_scc_v2($1::jsonb)", [
        JSON.stringify({ ...base, pagina: { numero: 1, total: 201 } }),
      ])
    ).rejects.toMatchObject({ code: "PR413" });
  });

  it.each([
    { ...fixtures[3], restaurante_id: "segredo" },
    { ...fixtures[3], pagina: { numero: 1, total: 1, extra: true } },
    { ...fixtures[3], sequencia: "9223372036854775808" },
    { ...fixtures[3], enviado_em: "2026-02-30T10:00:00Z" },
    { ...fixtures[3], dia_movimento: "2026-02-30" },
    { ...fixtures[3], recursos: ["pdv", "pdv"] },
    {
      ...fixtures[3],
      dados: [{ ...fixtures[3].dados[0], nome_cliente: "segredo" }],
    },
    {
      ...fixtures[3],
      dados: [{ ...fixtures[3].dados[0], vendas_elegiveis: "segredo" }],
    },
  ])("recusa envelope ou linha inválidos sem expor valores", async (pagina) => {
    await expect(
      banco.query("select public.validar_pagina_scc_v2($1::jsonb)", [
        JSON.stringify(pagina),
      ])
    ).rejects.toMatchObject({ code: "PR422", message: "pagina_scc_invalida" });
  });

  it("recusa mais de 500 linhas com código de limite", async () => {
    const pagina = {
      ...fixtures[3],
      dados: Array(501).fill(fixtures[3].dados[0]),
    };
    await expect(
      banco.query("select public.validar_pagina_scc_v2($1::jsonb)", [
        JSON.stringify(pagina),
      ])
    ).rejects.toMatchObject({ code: "PR413", message: "limite_pagina_scc" });
  });
});

describe("limpeza das cargas SCC v2", () => {
  let banco: Client;

  beforeAll(async () => {
    banco = await conectarBanco();
    await banco.query("begin");
  });

  afterAll(async () => {
    await banco?.query("rollback");
    await banco?.end();
  });

  it("expira cargas antigas e preserva os recibos e hashes publicados", async () => {
    const { restauranteA } = await criarFixture(banco, {
      transacaoExterna: true,
    });
    const antiga = "123e4567-e89b-42d3-a456-426614174001";
    const publicada = "123e4567-e89b-42d3-a456-426614174002";
    const recente = "123e4567-e89b-42d3-a456-426614174003";
    await banco.query(
      `insert into public.cargas_scc
       (restaurante_id,id_envio,tipo_envio,modo,sequencia,natureza,versao_scc,enviado_em,total_paginas,total_registros,estado,criada_em,recibo)
       values ($1,$2,'cadastro_produtos','incremental',1,'scc','1',now(),1,0,'recebendo',now()-interval '25 hours',null),
              ($1,$3,'cadastro_produtos','incremental',2,'scc','1',now(),1,0,'publicada',now(),'{"ok":true}'),
              ($1,$4,'cadastro_produtos','incremental',3,'scc','1',now(),1,0,'recebendo',now(),null)`,
      [restauranteA, antiga, publicada, recente]
    );
    await banco.query(
      `insert into public.paginas_scc (restaurante_id,id_envio,numero,hash,quantidade,bytes,dados)
       values ($1,$2,1,repeat('a',64),0,2,'[]'),($1,$3,1,repeat('b',64),0,2,'[]')`,
      [restauranteA, antiga, publicada]
    );
    await banco.query("select public.limpar_cargas_scc_v2()");
    const { rows } = await banco.query(
      `select c.id_envio,c.estado,c.recibo,p.hash,p.dados from public.cargas_scc c
       left join public.paginas_scc p using (restaurante_id,id_envio)
       where c.restaurante_id=$1 order by c.id_envio`,
      [restauranteA]
    );
    expect(rows).toEqual([
      {
        id_envio: antiga,
        estado: "expirada",
        recibo: null,
        hash: "a".repeat(64),
        dados: [],
      },
      {
        id_envio: publicada,
        estado: "publicada",
        recibo: { ok: true },
        hash: "b".repeat(64),
        dados: null,
      },
      {
        id_envio: recente,
        estado: "recebendo",
        recibo: null,
        hash: null,
        dados: null,
      },
    ]);
  });

  it("agenda uma rotina própria sem alterar a rotina legada", async () => {
    const { rows } = await banco.query<{ jobname: string; command: string }>(
      `select jobname, command from cron.job
       where jobname in ('rf-limpa-cargas-scc-v2', 'rf-limpa-cargas-relatorios')
       order by jobname`
    );
    expect(rows).toEqual([
      {
        jobname: "rf-limpa-cargas-relatorios",
        command: "select public.limpar_cargas_relatorio()",
      },
      {
        jobname: "rf-limpa-cargas-scc-v2",
        command: "select public.limpar_cargas_scc_v2()",
      },
    ]);
  });
});
