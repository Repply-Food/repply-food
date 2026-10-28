import {
  linhaProdutosSaidaSchema,
  paginacaoSchema,
  resumoProdutosSchema,
} from "@/lib/relatorios/schemas-saida";
// @vitest-environment node
import type { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { z } from "zod";
import type { LinhaProdutos } from "../../supabase/functions/_shared/relatorios/schemas";
import { type Fixture, conectarBanco } from "../helpers/supabase-local";
import {
  filtrosDoisDias,
  identidade,
  prepararConsulta,
  publicarFixture,
  recusarConsulta,
} from "./consulta-sql-helpers";
import { paginaProdutos } from "./fixtures";

const resultadoSchema = z
  .object({
    linhas: z.array(linhaProdutosSaidaSchema),
    resumo: resumoProdutosSchema,
    paginacao: paginacaoSchema,
  })
  .strict();
const filtros = { ...filtrosDoisDias, fim: "2026-10-24" };
const produto = (parcial: Partial<LinhaProdutos> = {}): LinhaProdutos => ({
  ...paginaProdutos().linhas[0],
  ...parcial,
});

describe("produtos agregados nas fotografias reais do PostgreSQL local", () => {
  let banco: Client;
  let fixture: Fixture;
  beforeAll(async () => {
    banco = await conectarBanco();
  });
  afterAll(async () => {
    await banco?.end();
  });
  beforeEach(async () => {
    fixture = await prepararConsulta(banco);
  });
  afterEach(async () => {
    if (banco) await banco.query("rollback");
  });

  async function consultar(
    consulta: unknown = filtros,
    pagina = 1,
    tamanho = 50,
    casa = fixture.restauranteA
  ) {
    const { rows } = await banco.query<{ r: unknown }>(
      "select relatorios_privados.produtos($1,$2::jsonb,$3,$4) r",
      [casa, JSON.stringify(consulta), pagina, tamanho]
    );
    return resultadoSchema.parse(rows[0]?.r);
  }

  it("soma antes da página e propaga custo ausente ao resumo", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      linhas: [
        produto(),
        produto({
          codigo_produto: "P2",
          produto: "Segundo",
          vendas: "5.00",
          custos: null,
          quantidade: "0.750",
        }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    const primeira = await consultar(filtros, 1, 1);
    expect(primeira).toEqual({
      linhas: [
        {
          codigoProduto: "P1",
          produto: "Produto fictício",
          codigoPdv: "D1",
          pdv: "PDV fictício",
          codigoGrupo: "G1",
          grupo: "Grupo fictício",
          quantidade: "1.250000",
          vendas: "16.25",
          custos: "4.00",
          diferenca: "12.25",
        },
      ],
      resumo: {
        quantidade: "2.000000",
        vendas: "21.25",
        custos: null,
        diferenca: null,
      },
      paginacao: { pagina: 1, tamanho: 1, totalLinhas: 2 },
    });
    const segunda = await consultar(filtros, 2, 1);
    expect(segunda.linhas[0]).toMatchObject({
      codigoProduto: "P2",
      custos: null,
      diferenca: null,
    });
    expect(segunda.resumo).toEqual(primeira.resumo);
    expect(await consultar(filtros, 2147483647, 100)).toMatchObject({
      linhas: [],
      resumo: primeira.resumo,
      paginacao: { totalLinhas: 2 },
    });
  });

  it("filtra casa, dia, fonte e dimensões da linha antes de agregar", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      recursos: ["pdv", "grupo", "garcom", "mesa"],
      linhas: [
        produto(),
        produto({ codigo_grupo: "G2", grupo: "Outro" }),
        produto({ codigo_pdv: "D2" }),
        produto({ codigo_garcom: "O2" }),
        produto({ mesa: 8 }),
      ],
    });
    await publicarFixture(banco, fixture.restauranteB, {
      linhas: [produto({ vendas: "999.00" })],
    });
    await publicarFixture(banco, fixture.restauranteA, {
      dia: "2026-10-25",
      linhas: [produto({ vendas: "888.00" })],
    });
    await publicarFixture(banco, fixture.restauranteA, {
      fonte: "online",
      linhas: [produto({ vendas: "777.00" })],
    });
    await identidade(banco, fixture.usuarioA);
    expect(
      await consultar({
        ...filtros,
        pdv: "D1",
        grupo: "G1",
        garcom: "O1",
        mesaDe: 7,
        mesaAte: 7,
      })
    ).toMatchObject({
      linhas: [{ codigoGrupo: "G1", vendas: "16.25" }],
      resumo: { vendas: "16.25" },
      paginacao: { totalLinhas: 1 },
    });
    expect((await consultar({ ...filtros, grupo: "G2" })).linhas).toHaveLength(
      1
    );
    expect(
      (await consultar({ ...filtros, fonte: "online" })).resumo.vendas
    ).toBe("777.00");
    await recusarConsulta(
      banco,
      () => consultar(filtros, 1, 50, fixture.restauranteB),
      "acesso_negado"
    );
    await identidade(banco, fixture.usuarioB);
    expect(
      (await consultar(filtros, 1, 50, fixture.restauranteB)).resumo.vendas
    ).toBe("999.00");
    await identidade(banco, fixture.admin);
    expect((await consultar({ ...filtros, grupo: "G2" })).resumo.vendas).toBe(
      "16.25"
    );
  });

  it("agrega por códigos sem dividir por mesa/garçom e escolhe rótulos lexicalmente", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      linhas: [
        produto({
          produto: "A",
          pdv: "A",
          grupo: "A",
          custos: "0.00",
          vendas: "0.105",
          quantidade: "0.125",
        }),
        produto({
          produto: "Z",
          pdv: "Z",
          grupo: "Z",
          garcom: "Outro",
          codigo_garcom: "O2",
          mesa: 99,
          custos: "0.00",
          vendas: "0.105",
          quantidade: "0.375",
        }),
        produto({
          codigo_produto: "P2",
          produto: "Z",
          pdv: "Z",
          grupo: "Z",
          custos: "0",
          vendas: "1",
          quantidade: "1",
        }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    const resultado = await consultar();
    expect(resultado.linhas).toEqual([
      {
        codigoProduto: "P1",
        produto: "Z",
        codigoPdv: "D1",
        pdv: "Z",
        codigoGrupo: "G1",
        grupo: "Z",
        quantidade: "0.500000",
        vendas: "0.21",
        custos: "0.00",
        diferenca: "0.21",
      },
      {
        codigoProduto: "P2",
        produto: "Z",
        codigoPdv: "D1",
        pdv: "Z",
        codigoGrupo: "G1",
        grupo: "Z",
        quantidade: "1.000000",
        vendas: "1.00",
        custos: "0.00",
        diferenca: "1.00",
      },
    ]);
    expect(resultado.resumo).toEqual({
      quantidade: "1.500000",
      vendas: "1.21",
      custos: "0.00",
      diferenca: "1.21",
    });
  });

  it("mantém produto, PDV e grupo distintos por código mesmo com rótulos iguais", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      linhas: [
        produto(),
        produto({ codigo_pdv: "D2" }),
        produto({ codigo_grupo: "G2" }),
        produto({ codigo_produto: "P2" }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    const resultado = await consultar();
    expect(resultado.paginacao.totalLinhas).toBe(4);
    expect(resultado.resumo.vendas).toBe("65.00");
    expect(
      resultado.linhas.map((linha) => [
        linha.codigoProduto,
        linha.codigoPdv,
        linha.codigoGrupo,
      ])
    ).toEqual([
      ["P1", "D1", "G1"],
      ["P1", "D1", "G2"],
      ["P1", "D2", "G1"],
      ["P2", "D1", "G1"],
    ]);
  });

  it("custo nulo contamina o próprio grupo, sem subtrair vendas recebidas", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      linhas: [
        produto(),
        produto({ custos: null, vendas: "-1.25", quantidade: "-0.250" }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    expect(await consultar()).toMatchObject({
      linhas: [
        {
          quantidade: "1.000000",
          vendas: "15.00",
          custos: null,
          diferenca: null,
        },
      ],
      resumo: {
        quantidade: "1.000000",
        vendas: "15.00",
        custos: null,
        diferenca: null,
      },
      paginacao: { totalLinhas: 1 },
    });
  });

  it("ordena PDV, grupo, produto e desempata por códigos, deixando nulos no fim", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      linhas: [
        produto({
          codigo_produto: "P3",
          codigo_pdv: null,
          pdv: null,
          codigo_grupo: null,
          grupo: null,
        }),
        produto({
          codigo_produto: "P2",
          codigo_pdv: "D2",
          pdv: "A",
          grupo: "A",
          produto: "A",
        }),
        produto({
          codigo_produto: "P1",
          codigo_pdv: "D1",
          pdv: "A",
          grupo: "A",
          produto: "A",
        }),
        produto({ codigo_produto: "P4", pdv: "A", grupo: "B", produto: "A" }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    expect(
      (await consultar()).linhas.map((linha) => linha.codigoProduto)
    ).toEqual(["P1", "P2", "P4", "P3"]);
  });

  it("aceita 366 dias, retorna vazio estável e rejeita filtros como SQL literal", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      dia: "2025-10-24",
      linhas: [produto()],
    });
    await publicarFixture(banco, fixture.restauranteA, { linhas: [produto()] });
    await identidade(banco, fixture.usuarioA);
    expect(
      (await consultar({ ...filtros, inicio: "2025-10-24" })).resumo.vendas
    ).toBe("32.50");
    expect(
      await consultar({ ...filtros, inicio: "2026-10-25", fim: "2026-10-25" })
    ).toEqual({
      linhas: [],
      resumo: {
        quantidade: "0",
        vendas: "0.00",
        custos: "0.00",
        diferenca: "0.00",
      },
      paginacao: { pagina: 1, tamanho: 50, totalLinhas: 0 },
    });
    await recusarConsulta(
      banco,
      () => consultar({ ...filtros, grupo: "G1' OR true --" }),
      "consulta_invalida"
    );
    expect(
      (await consultar({ ...filtros, grupo: "G1_OR_true--" })).linhas
    ).toEqual([]);
    await recusarConsulta(
      banco,
      () => consultar({ ...filtros, inicio: "2025-10-23" }),
      "periodo_invalido"
    );
    await recusarConsulta(
      banco,
      () => consultar(filtros, 0),
      "consulta_invalida"
    );
    await recusarConsulta(
      banco,
      () => consultar(filtros, 1, 101),
      "consulta_invalida"
    );
  });

  it("helper invoker não revela linhas a usuário sem acesso e tem grants explícitos", async () => {
    await publicarFixture(banco, fixture.restauranteA, { linhas: [produto()] });
    await identidade(banco, fixture.usuarioSemAcesso);
    await recusarConsulta(banco, () => consultar(), "acesso_negado");
    const { rows } = await banco.query(
      `select p.prosecdef as definer, has_function_privilege('anon',p.oid,'execute') as anon, has_function_privilege('authenticated',p.oid,'execute') as authenticated, has_function_privilege('service_role',p.oid,'execute') as service from pg_proc p where p.oid = 'relatorios_privados.produtos(uuid,jsonb,integer,integer)'::regprocedure`
    );
    expect(rows).toEqual([
      { definer: false, anon: false, authenticated: true, service: false },
    ]);
  });
});
