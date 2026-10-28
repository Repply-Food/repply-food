import {
  linhaCaixaSaidaSchema,
  paginacaoSchema,
  resumoCaixaSchema,
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
import type { LinhaCaixa } from "../../supabase/functions/_shared/relatorios/schemas";
import { type Fixture, conectarBanco } from "../helpers/supabase-local";
import {
  filtrosDoisDias,
  identidade,
  prepararConsulta,
  publicarFixture,
  recusarConsulta,
} from "./consulta-sql-helpers";

const resultadoSchema = z
  .object({
    linhas: z.array(linhaCaixaSaidaSchema),
    resumo: resumoCaixaSchema,
    paginacao: paginacaoSchema,
  })
  .strict();
const filtros = { ...filtrosDoisDias, fim: "2026-10-24" };
const lancamento = (parcial: Partial<LinhaCaixa> = {}): LinhaCaixa => ({
  codigo_lancamento: "L1",
  momento: "2026-10-24T12:00:00-03:00",
  codigo_operador: "O1",
  operador: "Operador fictício",
  tipo: "credito",
  codigo_categoria: "1",
  categoria: "Categoria fictícia",
  valor: "25.00",
  ...parcial,
});

describe("caixa nas fotografias reais do PostgreSQL local", () => {
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
      "select relatorios_privados.caixa($1,$2::jsonb,$3,$4) r",
      [casa, JSON.stringify(consulta), pagina, tamanho]
    );
    return resultadoSchema.parse(rows[0]?.r);
  }

  it("soma entradas e saídas com sinais e categoria do tipo correto", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "caixa",
      recursos: ["operador", "tipo", "categoria"],
      linhas: [
        lancamento(),
        lancamento({ codigo_lancamento: "L2", valor: "25.00" }),
        lancamento({
          codigo_lancamento: "L3",
          tipo: "debito",
          categoria: "Outra categoria fictícia",
          valor: "12.50",
        }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    const resultado = await consultar();
    expect(resultado.resumo).toEqual({
      creditos: "50.00",
      debitos: "12.50",
      saldo: "37.50",
      grupos: [
        {
          codigoOperador: "O1",
          diaCivil: "2026-10-24",
          creditos: "50.00",
          debitos: "12.50",
          saldo: "37.50",
        },
      ],
    });
    expect(
      (await consultar({ ...filtros, categoria: "credito:1" })).resumo
    ).toEqual({
      creditos: "50.00",
      debitos: "0.00",
      saldo: "50.00",
    });
    expect(
      (await consultar({ ...filtros, categoria: "debito:1" })).resumo
    ).toEqual({
      creditos: "0.00",
      debitos: "12.50",
      saldo: "-12.50",
    });
  });

  it("filtra pelo dia de movimento e calcula o dia civil no fuso da casa", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "caixa",
      dia: "2026-02-14",
      recursos: ["operador", "tipo", "categoria"],
      linhas: [
        lancamento({
          momento: "2026-02-15T01:00:00-03:00",
          valor: "50.00",
        }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    await expect(
      consultar({
        inicio: "2026-02-14",
        fim: "2026-02-14",
        fonte: "historico",
      })
    ).resolves.toMatchObject({
      linhas: [
        {
          diaMovimento: "2026-02-14",
          diaCivil: "2026-02-15",
          momento: "2026-02-15T01:00:00-03:00",
        },
      ],
      resumo: { creditos: "50.00" },
    });
    expect(
      (
        await consultar({
          inicio: "2026-02-15",
          fim: "2026-02-15",
          fonte: "historico",
        })
      ).linhas
    ).toEqual([]);
  });

  it("calcula totais completos de operador/dia antes de paginar", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "caixa",
      recursos: ["operador", "tipo", "categoria"],
      linhas: [
        lancamento({ codigo_lancamento: "L1", valor: "10.00" }),
        lancamento({ codigo_lancamento: "L2", tipo: "debito", valor: "3.00" }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    const primeira = await consultar(filtros, 1, 1);
    const segunda = await consultar(filtros, 2, 1);
    expect(primeira.linhas).toHaveLength(1);
    expect(segunda.linhas).toHaveLength(1);
    expect(primeira.resumo.grupos).toEqual([
      {
        codigoOperador: "O1",
        diaCivil: "2026-10-24",
        creditos: "10.00",
        debitos: "3.00",
        saldo: "7.00",
      },
    ]);
    expect(segunda.resumo.grupos).toEqual(primeira.resumo.grupos);
  });

  it("ordena operadores, dia civil e instantes reais, mantendo totais entre páginas", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "caixa",
      recursos: ["operador", "tipo", "categoria"],
      linhas: [
        lancamento({
          codigo_lancamento: "L3",
          momento: "2026-10-24T23:00:00-03:00",
          valor: "1.00",
        }),
        lancamento({
          codigo_lancamento: "L2",
          momento: "2026-10-25T01:00:00+02:00",
          valor: "2.00",
        }),
        lancamento({
          codigo_lancamento: "L4",
          codigo_operador: null,
          operador: null,
          valor: "3.00",
        }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    const primeira = await consultar(filtros, 1, 1);
    const segunda = await consultar(filtros, 2, 1);
    expect(primeira.linhas.map((linha) => linha.codigoLancamento)).toEqual([
      "L2",
    ]);
    expect(segunda.linhas.map((linha) => linha.codigoLancamento)).toEqual([
      "L3",
    ]);
    expect(primeira.paginacao.totalLinhas).toBe(3);
    expect(segunda.resumo).toEqual(primeira.resumo);
    expect(
      (await consultar(filtros, 1, 50)).linhas[2]?.codigoOperador
    ).toBeNull();
  });

  it("desempata entre dias de movimento depois de todas as demais chaves", async () => {
    const empate = lancamento({ codigo_lancamento: "L-EMPATE" });
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "caixa",
      dia: "2026-10-24",
      recursos: ["operador", "tipo", "categoria"],
      linhas: [empate],
    });
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "caixa",
      dia: "2026-10-25",
      recursos: ["operador", "tipo", "categoria"],
      linhas: [empate],
    });
    await identidade(banco, fixture.usuarioA);
    const resultado = await consultar(filtrosDoisDias);
    expect(resultado.linhas.map((linha) => linha.diaMovimento)).toEqual([
      "2026-10-24",
      "2026-10-25",
    ]);
  });

  it("isola usuários e casas e exige os recursos publicados", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "caixa",
      recursos: ["operador", "tipo", "categoria"],
      linhas: [lancamento()],
    });
    await publicarFixture(banco, fixture.restauranteB, {
      relatorio: "caixa",
      recursos: ["operador", "tipo", "categoria"],
      linhas: [lancamento({ valor: "999.00" })],
    });
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "caixa",
      dia: "2026-10-25",
      recursos: ["operador", "tipo"],
      linhas: [lancamento()],
    });
    await identidade(banco, fixture.usuarioA);
    expect((await consultar()).resumo.creditos).toBe("25.00");
    await recusarConsulta(
      banco,
      () => consultar(filtros, 1, 50, fixture.restauranteB),
      "acesso_negado"
    );
    await identidade(banco, fixture.usuarioB);
    expect(
      (await consultar(filtros, 1, 50, fixture.restauranteB)).resumo.creditos
    ).toBe("999.00");
    await identidade(banco, fixture.usuarioA);
    await recusarConsulta(
      banco,
      () => consultar({ ...filtrosDoisDias, categoria: "credito:1" }),
      "filtro_indisponivel"
    );
  });

  it("rejeita timestamps fora dos limites do cast PostgreSQL", async () => {
    await recusarConsulta(
      banco,
      () =>
        banco.query(
          "select public.validar_linha_relatorio('caixa',$1::jsonb)",
          [JSON.stringify(lancamento({ momento: "0000-02-29T12:00:00Z" }))]
        ),
      "linha_relatorio_invalida"
    );
    await recusarConsulta(
      banco,
      () =>
        banco.query(
          "select public.validar_linha_relatorio('caixa',$1::jsonb)",
          [JSON.stringify(lancamento({ momento: "0001-01-01T00:00:00+15:59" }))]
        ),
      "linha_relatorio_invalida"
    );
    await recusarConsulta(
      banco,
      () =>
        banco.query(
          "select public.validar_linha_relatorio('caixa',$1::jsonb)",
          [JSON.stringify(lancamento({ momento: "9999-12-31T23:59:59-15:59" }))]
        ),
      "linha_relatorio_invalida"
    );
    await recusarConsulta(
      banco,
      () =>
        banco.query(
          "select public.validar_linha_relatorio('caixa',$1::jsonb)",
          [JSON.stringify(lancamento({ momento: "2026-02-14T12:00:00+16:00" }))]
        ),
      "linha_relatorio_invalida"
    );
    await banco.query(
      "select public.validar_linha_relatorio('caixa',$1::jsonb)",
      [JSON.stringify(lancamento({ momento: "0002-01-01T00:00:00+15:59" }))]
    );
    await banco.query(
      "select public.validar_linha_relatorio('caixa',$1::jsonb)",
      [JSON.stringify(lancamento({ momento: "9998-12-31T23:59:59-15:59" }))]
    );
  });

  it("calcula dia civil nas viradas de ano extremas dentro da faixa segura", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "caixa",
      dia: "0002-01-01",
      recursos: ["operador", "tipo", "categoria"],
      linhas: [
        lancamento({ momento: "0002-01-01T00:00:00+15:59", valor: "1.00" }),
      ],
    });
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "caixa",
      dia: "9998-12-31",
      recursos: ["operador", "tipo", "categoria"],
      linhas: [
        lancamento({
          momento: "9998-12-31T23:59:59-15:59",
          valor: "2.00",
        }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    const inferior = await consultar({
      inicio: "0002-01-01",
      fim: "0002-01-01",
      fonte: "historico",
    });
    const superior = await consultar({
      inicio: "9998-12-31",
      fim: "9998-12-31",
      fonte: "historico",
    });
    expect(inferior.linhas[0]?.diaCivil).toBe("0001-12-31");
    expect(superior.linhas[0]?.diaCivil).toBe("9999-01-01");
  });

  it("recusa dia civil PostgreSQL fora do ano 0001..9999", async () => {
    await recusarConsulta(
      banco,
      () =>
        banco.query(
          "select relatorios_privados.dia_civil_caixa('9999-12-31T23:59:59-15:59'::timestamptz,'Etc/GMT+3')"
        ),
      "dia_civil_invalido"
    );
  });

  it("valida filtros e mantém resumo vazio estável", async () => {
    await identidade(banco, fixture.usuarioA);
    expect(
      await consultar({ ...filtros, inicio: "2026-10-25", fim: "2026-10-25" })
    ).toEqual({
      linhas: [],
      resumo: {
        creditos: "0.00",
        debitos: "0.00",
        saldo: "0.00",
        grupos: [],
      },
      paginacao: { pagina: 1, tamanho: 50, totalLinhas: 0 },
    });
    await recusarConsulta(
      banco,
      () => consultar({ ...filtros, inicio: "2026-02-30" }),
      "periodo_invalido"
    );
    await recusarConsulta(
      banco,
      () => consultar(filtros, 0),
      "consulta_invalida"
    );
  });
});
