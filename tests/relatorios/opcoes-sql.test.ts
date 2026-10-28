// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Fixture, conectarBanco } from "../helpers/supabase-local";
import {
  filtrosDoisDias,
  identidade,
  prepararConsulta,
  publicarFixture,
  recusarConsulta,
} from "./consulta-sql-helpers";
import { linhasRelatorios } from "./fixtures";

describe("opções reais isoladas por restaurante no PostgreSQL local", () => {
  let banco: Client;
  let fixture: Fixture;
  const filtros = { ...filtrosDoisDias, fim: "2026-10-24" };
  const opcoes = async (
    dimensao = "grupo",
    busca: string | null = "",
    pagina: number | null = 1,
    consulta: unknown = filtros,
    casa = fixture.restauranteA,
    relatorio = "produtos"
  ) =>
    (
      await banco.query(
        "select public.opcoes_relatorio($1,$2,$3::jsonb,$4,$5,$6) r",
        [casa, relatorio, JSON.stringify(consulta), dimensao, busca, pagina]
      )
    ).rows[0].r;
  const produto = (grupo: string, rotulo: string, pdv = "P1") => ({
    ...linhasRelatorios.produtos,
    codigo_grupo: grupo,
    grupo: rotulo,
    codigo_pdv: pdv,
    pdv: `PDV ${pdv}`,
    codigo_garcom: "G1",
    garcom: "Garçom fictício",
    mesa: 5,
  });

  beforeEach(async () => {
    banco = await conectarBanco();
    fixture = await prepararConsulta(banco);
  });
  afterEach(async () => {
    if (!banco) return;
    await banco.query("rollback");
    await banco.end();
  });

  it("isola os mesmos códigos A/B e respeita período, fonte e todos os filtros", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      recursos: ["pdv", "grupo", "garcom", "mesa"],
      linhas: [produto("1", "Grupo A"), produto("2", "Outro", "P2")],
    });
    await publicarFixture(banco, fixture.restauranteB, {
      linhas: [produto("1", "Grupo B")],
    });
    await publicarFixture(banco, fixture.restauranteA, {
      fonte: "online",
      linhas: [produto("1", "Online")],
    });
    await publicarFixture(banco, fixture.restauranteA, {
      dia: "2026-10-25",
      linhas: [produto("3", "Fora do dia")],
    });
    await identidade(banco, fixture.usuarioA);
    expect(
      await opcoes("grupo", "", 1, {
        ...filtros,
        pdv: "P1",
        garcom: "G1",
        mesaDe: 5,
        mesaAte: 5,
      })
    ).toEqual({ opcoes: [{ codigo: "1", rotulo: "Grupo A" }], mais: false });
    expect(await opcoes("grupo", "", 1, { ...filtros, grupo: "2" })).toEqual({
      opcoes: [{ codigo: "2", rotulo: "Outro" }],
      mais: false,
    });
    expect(
      await opcoes("grupo", "", 1, { ...filtros, fonte: "online" })
    ).toEqual({ opcoes: [{ codigo: "1", rotulo: "Online" }], mais: false });
    await recusarConsulta(
      banco,
      () => opcoes("grupo", "", 1, filtros, fixture.restauranteB),
      "acesso_negado"
    );
    await recusarConsulta(
      banco,
      () => opcoes("grupo", "", 1, null, randomUUID()),
      "acesso_negado"
    );
    await identidade(banco, fixture.usuarioB);
    expect(await opcoes("grupo", "", 1, filtros, fixture.restauranteB)).toEqual(
      { opcoes: [{ codigo: "1", rotulo: "Grupo B" }], mais: false }
    );
    await identidade(banco, fixture.admin);
    expect(await opcoes()).toMatchObject({
      opcoes: [
        { codigo: "1", rotulo: "Grupo A" },
        { codigo: "2", rotulo: "Outro" },
      ],
    });
  });

  it("busca literalmente %, _ e barra, sem tratar texto como padrão SQL", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      linhas: [produto("1", "A%_\\B"), produto("2", "A qualquer B")],
    });
    await identidade(banco, fixture.usuarioA);
    for (const termo of ["%", "_", "\\", "a%_\\b"])
      expect(await opcoes("grupo", termo)).toEqual({
        opcoes: [{ codigo: "1", rotulo: "A%_\\B" }],
        mais: false,
      });
    expect(await opcoes("grupo", "' OR true --")).toEqual({
      opcoes: [],
      mais: false,
    });
  });

  it("deduplica código/rótulo e pagina em 25 opções com mais booleano", async () => {
    const linhas = Array.from({ length: 26 }, (_, i) =>
      produto(String(i).padStart(2, "0"), `Grupo ${String(i).padStart(2, "0")}`)
    );
    await publicarFixture(banco, fixture.restauranteA, {
      linhas: [...linhas, produto("00", "Grupo 00")],
    });
    await identidade(banco, fixture.usuarioA);
    const primeira = await opcoes();
    expect(primeira).toEqual({
      opcoes: linhas
        .slice(0, 25)
        .map((l) => ({ codigo: l.codigo_grupo, rotulo: l.grupo })),
      mais: true,
    });
    expect(await opcoes("grupo", "", 2)).toEqual({
      opcoes: [{ codigo: "25", rotulo: "Grupo 25" }],
      mais: false,
    });
    expect(await opcoes("grupo", "", 3)).toEqual({ opcoes: [], mais: false });
    expect(await opcoes("grupo", "", 2147483647)).toEqual({
      opcoes: [],
      mais: false,
    });
  });

  it("dimensão não suportada, recurso ausente ou nenhum dia recebido dão filtro_indisponivel", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      linhas: [produto("1", "A")],
    });
    await publicarFixture(banco, fixture.restauranteA, {
      dia: "2026-10-25",
      recursos: ["pdv"],
      linhas: [produto("2", "B")],
    });
    await identidade(banco, fixture.usuarioA);
    for (const dimensao of ["operador", "qualquer", "mesaDe"])
      await recusarConsulta(
        banco,
        () => opcoes(dimensao),
        "filtro_indisponivel"
      );
    await recusarConsulta(
      banco,
      () => opcoes("grupo", "", 1, filtrosDoisDias),
      "filtro_indisponivel"
    );
    await recusarConsulta(
      banco,
      () =>
        opcoes("grupo", "", 1, {
          ...filtros,
          inicio: "2026-10-26",
          fim: "2026-10-26",
        }),
      "filtro_indisponivel"
    );
    expect(await opcoes("grupo", "nenhum")).toEqual({
      opcoes: [],
      mais: false,
    });
    await recusarConsulta(
      banco,
      () =>
        opcoes("cliente", "", 1, filtros, fixture.restauranteA, "financeiro"),
      "filtro_indisponivel"
    );
  });

  it("categoria combina tipo+código e aplica tipo, categoria e operador", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "caixa",
      recursos: ["operador", "tipo", "categoria"],
      linhas: [
        {
          ...linhasRelatorios.caixa,
          codigo_operador: "O1",
          operador: "Operador fictício",
          tipo: "credito",
          codigo_categoria: "C1",
          categoria: "Entrada",
        },
        {
          ...linhasRelatorios.caixa,
          codigo_operador: "O1",
          operador: "Operador fictício",
          tipo: "debito",
          codigo_categoria: "C1",
          categoria: "Saída",
        },
      ],
    });
    await identidade(banco, fixture.usuarioA);
    expect(
      await opcoes("categoria", "", 1, filtros, fixture.restauranteA, "caixa")
    ).toEqual({
      opcoes: [
        { codigo: "credito:C1", rotulo: "Entrada" },
        { codigo: "debito:C1", rotulo: "Saída" },
      ],
      mais: false,
    });
    expect(
      await opcoes(
        "categoria",
        "",
        1,
        { ...filtros, operador: "O1", tipo: "credito" },
        fixture.restauranteA,
        "caixa"
      )
    ).toEqual({
      opcoes: [{ codigo: "credito:C1", rotulo: "Entrada" }],
      mais: false,
    });
    expect(
      await opcoes(
        "tipo",
        "",
        1,
        { ...filtros, categoria: "debito:C1" },
        fixture.restauranteA,
        "caixa"
      )
    ).toEqual({
      opcoes: [{ codigo: "debito", rotulo: "debito" }],
      mais: false,
    });
    await recusarConsulta(
      banco,
      () =>
        opcoes(
          "categoria",
          "",
          1,
          { ...filtros, categoria: "C1" },
          fixture.restauranteA,
          "caixa"
        ),
      "consulta_invalida"
    );
    await recusarConsulta(
      banco,
      () =>
        opcoes(
          "categoria",
          "",
          1,
          { ...filtros, categoria: "credito:C1", tipo: "debito" },
          fixture.restauranteA,
          "caixa"
        ),
      "consulta_invalida"
    );
    await recusarConsulta(
      banco,
      () =>
        opcoes(
          "tipo",
          "",
          1,
          { ...filtros, tipo: "cancelamento_produto" },
          fixture.restauranteA,
          "caixa"
        ),
      "consulta_invalida"
    );
  });

  it("opções de cliente só exibem Cliente <código> e filtro usa código exato", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "notas-assinadas",
      recursos: ["cliente"],
      linhas: [
        { ...linhasRelatorios["notas-assinadas"], codigo_cliente: "C1" },
        { ...linhasRelatorios["notas-assinadas"], codigo_cliente: "C2" },
      ],
    });
    await identidade(banco, fixture.usuarioA);
    expect(
      await opcoes(
        "cliente",
        "",
        1,
        { ...filtros, cliente: "C2" },
        fixture.restauranteA,
        "notas-assinadas"
      )
    ).toEqual({
      opcoes: [{ codigo: "C2", rotulo: "Cliente C2" }],
      mais: false,
    });
  });

  it("operador nulo tem rótulo pelo código e tipo de auditoria é validado", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "comissao",
      recursos: ["operador"],
      linhas: [
        { ...linhasRelatorios.comissao, codigo_operador: "O1", operador: null },
      ],
    });
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "auditoria",
      recursos: ["operador", "tipo"],
      linhas: [
        {
          ...linhasRelatorios.auditoria,
          codigo_operador: "O2",
          operador: "Operador 2",
          tipo: "cancelamento_produto",
        },
      ],
    });
    await identidade(banco, fixture.usuarioA);
    expect(
      await opcoes("operador", "", 1, filtros, fixture.restauranteA, "comissao")
    ).toEqual({ opcoes: [{ codigo: "O1", rotulo: "O1" }], mais: false });
    expect(
      await opcoes(
        "operador",
        "",
        1,
        { ...filtros, tipo: "cancelamento_produto" },
        fixture.restauranteA,
        "auditoria"
      )
    ).toEqual({
      opcoes: [{ codigo: "O2", rotulo: "Operador 2" }],
      mais: false,
    });
    await recusarConsulta(
      banco,
      () =>
        opcoes(
          "tipo",
          "",
          1,
          { ...filtros, tipo: "credito" },
          fixture.restauranteA,
          "auditoria"
        ),
      "consulta_invalida"
    );
  });

  it("valida datas, recurso, busca e página antes de devolver opções", async () => {
    await identidade(banco, fixture.usuarioA);
    for (const [busca, pagina] of [
      ["x".repeat(81), 1],
      [null, 1],
      ["", 0],
      ["", null],
    ] as const)
      await recusarConsulta(
        banco,
        () => opcoes("grupo", busca, pagina),
        "consulta_invalida"
      );
    await recusarConsulta(
      banco,
      () => opcoes("grupo", "", 1, { ...filtros, fim: "2026-02-30" }),
      "periodo_invalido"
    );
    await recusarConsulta(
      banco,
      () => opcoes("grupo", "", 1, { ...filtros, pdv: "P1" }),
      "filtro_indisponivel"
    );
    await banco.query("set local role anon");
    await recusarConsulta(
      banco,
      () => opcoes(),
      "permission denied for function opcoes_relatorio"
    );
  });
});
