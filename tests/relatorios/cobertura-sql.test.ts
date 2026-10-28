// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { coberturaSchema } from "../../lib/relatorios/schemas-saida";
import { type Fixture, conectarBanco } from "../helpers/supabase-local";
import {
  filtrosDoisDias,
  identidade,
  prepararConsulta,
  publicarFixture,
  recusarConsulta,
} from "./consulta-sql-helpers";

describe("cobertura e autorização reais no PostgreSQL local", () => {
  let banco: Client;
  let fixture: Fixture;
  const consultar = async (
    filtros: unknown = filtrosDoisDias,
    casa = fixture.restauranteA,
    relatorio = "produtos"
  ) =>
    (
      await banco.query(
        "select relatorios_privados.cobertura($1,$2,$3::jsonb) r",
        [casa, relatorio, JSON.stringify(filtros)]
      )
    ).rows[0].r;

  beforeEach(async () => {
    banco = await conectarBanco();
    fixture = await prepararConsulta(banco);
  });
  afterEach(async () => {
    if (!banco) return;
    await banco.query("rollback");
    await banco.end();
  });

  it("conta dia publicado vazio e mantém o dia ausente explícito (parcial)", async () => {
    await publicarFixture(banco, fixture.restauranteA);
    await identidade(banco, fixture.usuarioA);
    const cobertura = await consultar();
    expect(coberturaSchema.parse(cobertura)).toEqual({
      esperados: 2,
      recebidos: 1,
      ausentes: ["2026-10-25"],
      capturadoEm: "2026-10-25T12:00:00.000000+00:00",
      simulacao: false,
      recursos: ["grupo", "pdv"],
    });
    expect(
      await consultar({ ...filtrosDoisDias, fim: "2026-10-24" })
    ).toMatchObject({
      esperados: 1,
      recebidos: 1,
      ausentes: [],
    });
  });

  it("todos ausentes não viram zeros e fonte/relatório opostos não contam", async () => {
    await publicarFixture(banco, fixture.restauranteA, { fonte: "online" });
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "comissao",
      recursos: ["operador"],
    });
    await identidade(banco, fixture.usuarioA);
    expect(await consultar()).toEqual({
      esperados: 2,
      recebidos: 0,
      ausentes: ["2026-10-24", "2026-10-25"],
      capturadoEm: null,
      simulacao: false,
      recursos: [],
    });
  });

  it("intersecta recursos, usa a captura mínima e propaga qualquer simulação", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      natureza: "simulacao",
      recursos: ["pdv", "grupo", "garcom"],
      capturadoEm: "2026-10-24T09:00:00Z",
    });
    await publicarFixture(banco, fixture.restauranteA, {
      dia: "2026-10-25",
      recursos: ["grupo", "pdv"],
      capturadoEm: "2026-10-26T18:00:00Z",
    });
    await identidade(banco, fixture.usuarioA);
    expect(await consultar()).toEqual({
      esperados: 2,
      recebidos: 2,
      ausentes: [],
      capturadoEm: "2026-10-24T09:00:00.000000+00:00",
      simulacao: true,
      recursos: ["grupo", "pdv"],
    });
    await recusarConsulta(
      banco,
      () => consultar({ ...filtrosDoisDias, garcom: "G1" }),
      "filtro_indisponivel"
    );
  });

  it("gera dias civis no SQL inclusive em bissexto e mudança de fuso da sessão", async () => {
    await identidade(banco, fixture.usuarioA);
    await banco.query("set local timezone = 'America/New_York'");
    const bissexto = {
      inicio: "2024-02-28",
      fim: "2024-03-01",
      fonte: "historico",
    };
    expect(await consultar(bissexto)).toMatchObject({
      esperados: 3,
      ausentes: ["2024-02-28", "2024-02-29", "2024-03-01"],
    });
    expect(
      await consultar({
        inicio: "2026-03-07",
        fim: "2026-03-09",
        fonte: "historico",
      })
    ).toMatchObject({
      esperados: 3,
      ausentes: ["2026-03-07", "2026-03-08", "2026-03-09"],
    });
  });

  it("recusa casa B e inexistente com o mesmo erro curto antes de validar filtros", async () => {
    await publicarFixture(banco, fixture.restauranteB, {
      natureza: "simulacao",
    });
    await identidade(banco, fixture.usuarioA);
    for (const casa of [fixture.restauranteB, randomUUID()]) {
      await recusarConsulta(
        banco,
        () => consultar(null, casa),
        "acesso_negado"
      );
      await recusarConsulta(
        banco,
        () =>
          banco.query(
            "select relatorios_privados.validar_consulta($1,'produtos','{}',1,50)",
            [casa]
          ),
        "acesso_negado"
      );
    }
    expect(
      (
        await banco.query(
          "select * from public.relatorio_publicacoes where restaurante_id=$1",
          [fixture.restauranteB]
        )
      ).rows
    ).toEqual([]);
  });

  it("permite ao admin consultar B e recusa usuário sem acesso até na casa vazia", async () => {
    await publicarFixture(banco, fixture.restauranteB);
    await identidade(banco, fixture.admin);
    expect(
      await consultar(filtrosDoisDias, fixture.restauranteB)
    ).toMatchObject({ recebidos: 1 });
    await identidade(banco, fixture.usuarioSemAcesso);
    await recusarConsulta(banco, () => consultar(), "acesso_negado");
  });

  it("valida relatório, chaves, JSON, tipos, datas, fonte e limites em chamadas diretas", async () => {
    await identidade(banco, fixture.usuarioA);
    for (const filtros of [
      null,
      [],
      {},
      { ...filtrosDoisDias, extra: "x" },
      { ...filtrosDoisDias, pdv: null },
      { ...filtrosDoisDias, pdv: 1 },
      { ...filtrosDoisDias, pdv: "%" },
      { ...filtrosDoisDias, grupo: "x".repeat(81) },
      { ...filtrosDoisDias, fonte: "outra" },
    ])
      await recusarConsulta(
        banco,
        () => consultar(filtros),
        "consulta_invalida"
      );
    for (const filtros of [
      { ...filtrosDoisDias, inicio: "2026-02-30" },
      { ...filtrosDoisDias, inicio: "2026-1-01" },
      { ...filtrosDoisDias, inicio: "0000-01-01" },
      { ...filtrosDoisDias, fim: "2026-10-23" },
      { inicio: "2024-01-01", fim: "2025-01-01", fonte: "historico" },
      { ...filtrosDoisDias, fonte: "online" },
    ])
      await recusarConsulta(
        banco,
        () => consultar(filtros),
        "periodo_invalido"
      );
    await recusarConsulta(
      banco,
      () => consultar(filtrosDoisDias, fixture.restauranteA, "desconhecido"),
      "consulta_invalida"
    );
    for (const [pagina, tamanho] of [
      [0, 50],
      [null, 50],
      [1, 0],
      [1, 101],
      [1, null],
    ])
      await recusarConsulta(
        banco,
        () =>
          banco.query(
            "select relatorios_privados.validar_consulta($1,'produtos',$2, $3,$4)",
            [
              fixture.restauranteA,
              JSON.stringify(filtrosDoisDias),
              pagina,
              tamanho,
            ]
          ),
        "consulta_invalida"
      );
    for (const filtro of [
      { mesaDe: -1 },
      { mesaAte: 2147483648 },
      { mesaDe: 2.5 },
      { mesaDe: "2" },
      { mesaDe: 4, mesaAte: 3 },
    ])
      await recusarConsulta(
        banco,
        () => consultar({ ...filtrosDoisDias, ...filtro }),
        "mesa_invalida"
      );
    expect(
      await consultar({
        inicio: "2024-01-01",
        fim: "2024-12-31",
        fonte: "historico",
      })
    ).toMatchObject({ esperados: 366 });
  });

  it("grants privados são deliberados, invoker/STABLE e anônimo não executa", async () => {
    for (const assinatura of [
      "relatorios_privados.validar_consulta(uuid,text,jsonb,integer,integer)",
      "relatorios_privados.cobertura(uuid,text,jsonb)",
      "public.opcoes_relatorio(uuid,text,jsonb,text,text,integer)",
    ]) {
      const { rows } = await banco.query(
        `select p.prosecdef,p.provolatile,p.proconfig,
                has_function_privilege('anon',p.oid,'execute') anon,
                has_function_privilege('authenticated',p.oid,'execute') authenticated
           from pg_proc p where p.oid=$1::regprocedure`,
        [assinatura]
      );
      expect(rows).toEqual([
        {
          prosecdef: false,
          provolatile: "s",
          proconfig: ["search_path=pg_catalog, public, relatorios_privados"],
          anon: false,
          authenticated: true,
        },
      ]);
    }
    expect(
      (
        await banco.query(
          "select has_schema_privilege('anon','relatorios_privados','usage') anon, has_schema_privilege('authenticated','relatorios_privados','usage') authenticated"
        )
      ).rows
    ).toEqual([{ anon: false, authenticated: true }]);
    await banco.query("set local role anon");
    await recusarConsulta(
      banco,
      () => consultar(),
      "permission denied for schema relatorios_privados"
    );
  });
});
