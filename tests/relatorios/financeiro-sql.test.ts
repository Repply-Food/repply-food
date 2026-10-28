import {
  linhaFinanceiroSaidaSchema,
  paginacaoSchema,
  resumoFinanceiroSchema,
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
import type { LinhaFinanceiro } from "../../supabase/functions/_shared/relatorios/schemas";
import { type Fixture, conectarBanco } from "../helpers/supabase-local";
import {
  identidade,
  prepararConsulta,
  publicarFixture,
} from "./consulta-sql-helpers";

const resultadoSchema = z
  .object({
    linhas: z.array(linhaFinanceiroSaidaSchema),
    resumo: resumoFinanceiroSchema,
    paginacao: paginacaoSchema,
  })
  .strict();
const filtros = { inicio: "2026-10-24", fim: "2026-10-25", fonte: "historico" };
const financeiro = (
  parcial: Partial<LinhaFinanceiro> = {}
): LinhaFinanceiro => ({
  componentes: {
    consumo: "100.00",
    servico: "8.00",
    complemento: null,
    taxas_entrada: "4.00",
    produto_embutido: null,
    flyers: "2.00",
  },
  totais_oficiais: {
    projetado: "108.00",
    recebido: "93.00",
    notas_assinadas: "10.00",
    descontos: "5.00",
  },
  entradas: { habilitados: 2, reabilitados: 1, encerrados: 0, abertos: null },
  meios: [
    { codigo: "DIN", rotulo: "Dinheiro", classe: "dinheiro", valor: "70.00" },
    { codigo: "PIX", rotulo: "Pix", classe: "pix", valor: "23.00" },
  ],
  publico: [
    { sexo: "feminino", categoria: "pagante", quantidade: 3 },
    { sexo: "masculino", categoria: "pagante", quantidade: 2 },
  ],
  ...parcial,
});

describe("financeiro nas fotografias reais do PostgreSQL local", () => {
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
      "select relatorios_privados.financeiro($1,$2::jsonb,$3,$4) r",
      [casa, JSON.stringify(consulta), pagina, tamanho]
    );
    return resultadoSchema.parse(rows[0]?.r);
  }

  async function consultarCobertura(consulta: unknown = filtros) {
    const { rows } = await banco.query<{ cobertura: unknown }>(
      "select relatorios_privados.cobertura($1,'financeiro',$2::jsonb) cobertura",
      [fixture.restauranteA, JSON.stringify(consulta)]
    );
    return z
      .object({ simulacao: z.boolean() })
      .passthrough()
      .parse(rows[0]?.cobertura);
  }

  it("mantém totais oficiais independentes e agrega meios e público sem multiplicar células", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "financeiro",
      natureza: "simulacao",
      recursos: [],
      linhas: [financeiro()],
    });
    await identidade(banco, fixture.usuarioA);
    const resultado = await consultar({ ...filtros, fim: "2026-10-24" });
    expect(resultado.linhas).toHaveLength(1);
    expect(resultado.linhas[0]?.componentes).toEqual({
      consumo: "100.00",
      servico: "8.00",
      complemento: null,
      taxasEntrada: "4.00",
      produtoEmbutido: null,
      flyers: "2.00",
    });
    expect(resultado.linhas[0]?.totaisOficiais).toEqual({
      projetado: "108.00",
      recebido: "93.00",
      notasAssinadas: "10.00",
      descontos: "5.00",
    });
    expect(resultado.resumo.totaisOficiais).toEqual({
      projetado: "108.00",
      recebido: "93.00",
      notasAssinadas: "10.00",
      descontos: "5.00",
    });
    expect(resultado.resumo.meios).toEqual([
      { codigo: "DIN", rotulo: "Dinheiro", classe: "dinheiro", valor: "70.00" },
      { codigo: "PIX", rotulo: "Pix", classe: "pix", valor: "23.00" },
    ]);
    expect(resultado.resumo.publico).toEqual([
      { sexo: "feminino", categoria: "pagante", quantidade: 3 },
      { sexo: "masculino", categoria: "pagante", quantidade: 2 },
    ]);
    expect(resultado.resumo.publico.reduce((n, c) => n + c.quantidade, 0)).toBe(
      5
    );
    expect(
      await consultarCobertura({ ...filtros, fim: "2026-10-24" })
    ).toMatchObject({
      simulacao: true,
    });
  });

  it("representa fotografia vazia recebida com zero e deixa a cobertura distinguir o dia ausente", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "financeiro",
      natureza: "simulacao",
      recursos: [],
      linhas: [],
    });
    await identidade(banco, fixture.usuarioA);
    const resultado = await consultar({ ...filtros, fim: "2026-10-24" });
    expect(resultado.linhas).toEqual([
      {
        diaMovimento: "2026-10-24",
        componentes: {
          consumo: "0.00",
          servico: "0.00",
          complemento: "0.00",
          taxasEntrada: "0.00",
          produtoEmbutido: "0.00",
          flyers: "0.00",
        },
        totaisOficiais: {
          projetado: "0.00",
          recebido: "0.00",
          notasAssinadas: "0.00",
          descontos: "0.00",
        },
        entradas: {
          habilitados: 0,
          reabilitados: 0,
          encerrados: 0,
          abertos: 0,
        },
        meios: [],
        publico: [],
      },
    ]);
    expect(resultado.resumo.componentes).toEqual({
      consumo: "0.00",
      servico: "0.00",
      complemento: "0.00",
      taxasEntrada: "0.00",
      produtoEmbutido: "0.00",
      flyers: "0.00",
    });
    expect((await consultarCobertura(filtros)).ausentes).toEqual([
      "2026-10-25",
    ]);
  });

  it("propaga null apenas no campo afetado e agrega o resumo completo antes da página", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "financeiro",
      natureza: "simulacao",
      recursos: [],
      linhas: [financeiro()],
    });
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "financeiro",
      dia: "2026-10-25",
      recursos: [],
      linhas: [
        financeiro({
          componentes: {
            consumo: "10.00",
            servico: "1.00",
            complemento: "2.00",
            taxas_entrada: "0.00",
            produto_embutido: "0.00",
            flyers: "0.00",
          },
          totais_oficiais: {
            projetado: "11.00",
            recebido: "10.00",
            notas_assinadas: "0.00",
            descontos: "0.00",
          },
        }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    const primeira = await consultar(filtros, 1, 1);
    expect(primeira.linhas).toHaveLength(1);
    expect(primeira.resumo.componentes).toEqual({
      consumo: "110.00",
      servico: "9.00",
      complemento: null,
      taxasEntrada: "4.00",
      produtoEmbutido: null,
      flyers: "2.00",
    });
    expect(primeira.resumo.totaisOficiais).toEqual({
      projetado: "119.00",
      recebido: "103.00",
      notasAssinadas: "10.00",
      descontos: "5.00",
    });
    expect(primeira.paginacao.totalLinhas).toBe(2);
    expect((await consultar(filtros, 2, 1)).resumo).toEqual(primeira.resumo);
  });
});
