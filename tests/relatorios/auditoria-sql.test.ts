import {
  linhaAuditoriaSaidaSchema,
  paginacaoSchema,
  resumoAuditoriaSchema,
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
import type { LinhaAuditoria } from "../../supabase/functions/_shared/relatorios/schemas";
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
    linhas: z.array(linhaAuditoriaSaidaSchema),
    resumo: resumoAuditoriaSchema,
    paginacao: paginacaoSchema,
  })
  .strict();
const filtros = { ...filtrosDoisDias, fim: "2026-10-24" };
const evento = (parcial: Partial<LinhaAuditoria> = {}): LinhaAuditoria => ({
  tipo: "cancelamento_produto",
  momento: "2026-10-24T12:00:00-03:00",
  codigo_operador: "O1",
  operador: "Operador fictício",
  cartao_anterior: null,
  cartao_novo: null,
  codigo_produto: "P1",
  produto: "Produto fictício",
  quantidade: "2.000",
  valor_unitario: "5.00",
  total: "10.00",
  limite_minimo_anterior: null,
  limite_minimo_novo: null,
  limite_maximo_anterior: null,
  limite_maximo_novo: null,
  ...parcial,
});

describe("auditoria nas fotografias reais do PostgreSQL local", () => {
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
      "select relatorios_privados.auditoria($1,$2::jsonb,$3,$4) r",
      [casa, JSON.stringify(consulta), pagina, tamanho]
    );
    return resultadoSchema.parse(rows[0]?.r);
  }

  it("preserva os cinco tipos e ocorrências canceladas idênticas", async () => {
    const cancelamento = evento();
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "auditoria",
      recursos: ["operador", "tipo"],
      linhas: [
        cancelamento,
        cancelamento,
        evento({
          tipo: "perda_cartao",
          codigo_produto: null,
          produto: null,
          quantidade: null,
          valor_unitario: null,
          total: null,
        }),
        evento({
          tipo: "alteracao_limites",
          codigo_produto: null,
          produto: null,
          quantidade: null,
          valor_unitario: null,
          total: null,
          limite_minimo_anterior: "1.00",
        }),
        evento({
          tipo: "exclusao_taxa_servico",
          codigo_produto: null,
          produto: null,
          quantidade: null,
          valor_unitario: null,
          total: null,
        }),
        evento({
          tipo: "transferencia_produtos",
          codigo_produto: null,
          produto: null,
          quantidade: null,
          valor_unitario: null,
          total: null,
          cartao_anterior: "M1",
          cartao_novo: "M2",
        }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    const resultado = await consultar();
    expect(resultado.linhas).toHaveLength(6);
    expect(
      resultado.linhas.filter(
        (linha) =>
          linha.tipo === "cancelamento_produto" &&
          linha.momento === cancelamento.momento &&
          linha.total === cancelamento.total
      )
    ).toHaveLength(2);
    expect(resultado.resumo).toEqual({
      ocorrencias: 6,
      porTipo: [
        {
          tipo: "alteracao_limites",
          ocorrencias: 1,
          quantidade: null,
          total: null,
        },
        {
          tipo: "cancelamento_produto",
          ocorrencias: 2,
          quantidade: "4.000000",
          total: "20.00",
        },
        {
          tipo: "exclusao_taxa_servico",
          ocorrencias: 1,
          quantidade: null,
          total: null,
        },
        { tipo: "perda_cartao", ocorrencias: 1, quantidade: null, total: null },
        {
          tipo: "transferencia_produtos",
          ocorrencias: 1,
          quantidade: null,
          total: null,
        },
      ],
    });
    expect(Object.keys(resultado.linhas[0] ?? {})).not.toContain("nomeCliente");
  });

  it("não soma campos cancelados desconhecidos e não infere perda financeira", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "auditoria",
      recursos: ["operador", "tipo"],
      linhas: [
        evento({ quantidade: null }),
        evento({ tipo: "perda_cartao", quantidade: null, total: null }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    expect((await consultar()).resumo).toEqual({
      ocorrencias: 2,
      porTipo: [
        {
          tipo: "cancelamento_produto",
          ocorrencias: 1,
          quantidade: null,
          total: "10.00",
        },
        { tipo: "perda_cartao", ocorrencias: 1, quantidade: null, total: null },
      ],
    });
  });

  it("ordena tipo, instante, operador e posição sem deduplicar e pagina após resumir", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "auditoria",
      recursos: ["operador", "tipo"],
      linhas: [
        evento({ momento: "2026-10-24T20:00:00-03:00", codigo_operador: "O2" }),
        evento({ momento: "2026-10-24T19:00:00-03:00", codigo_operador: "O1" }),
        evento({ momento: "2026-10-24T19:00:00-03:00", codigo_operador: "O1" }),
        evento({
          tipo: "perda_cartao",
          quantidade: null,
          valor_unitario: null,
          total: null,
        }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    const primeira = await consultar(filtros, 1, 1);
    const segunda = await consultar(filtros, 2, 1);
    expect(primeira.linhas[0]?.tipo).toBe("cancelamento_produto");
    expect(primeira.linhas[0]?.momento).toBe("2026-10-24T19:00:00-03:00");
    expect(segunda.linhas[0]).toEqual(primeira.linhas[0]);
    expect(primeira.resumo).toEqual(segunda.resumo);
    expect(primeira.paginacao.totalLinhas).toBe(4);
  });

  it("filtra tipo e operador, isola a casa e valida recurso e datas", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "auditoria",
      recursos: ["operador", "tipo"],
      linhas: [
        evento(),
        evento({
          tipo: "perda_cartao",
          quantidade: null,
          valor_unitario: null,
          total: null,
        }),
      ],
    });
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "auditoria",
      dia: "2026-10-25",
      recursos: ["tipo"],
      linhas: [evento({ total: "2.00" })],
    });
    await publicarFixture(banco, fixture.restauranteB, {
      relatorio: "auditoria",
      recursos: ["operador", "tipo"],
      linhas: [evento({ total: "999.00" })],
    });
    await identidade(banco, fixture.usuarioA);
    expect(
      (await consultar({ ...filtros, tipo: "perda_cartao" })).resumo.ocorrencias
    ).toBe(1);
    expect(
      (await consultar({ ...filtros, operador: "O1" })).resumo.ocorrencias
    ).toBe(2);
    await recusarConsulta(
      banco,
      () => consultar(filtros, 1, 50, fixture.restauranteB),
      "acesso_negado"
    );
    await identidade(banco, fixture.usuarioB);
    expect(
      (await consultar(filtros, 1, 50, fixture.restauranteB)).resumo.ocorrencias
    ).toBe(1);
    await identidade(banco, fixture.usuarioA);
    await recusarConsulta(
      banco,
      () => consultar({ ...filtros, inicio: "2026-02-30" }),
      "periodo_invalido"
    );
    await recusarConsulta(
      banco,
      () =>
        consultar({ ...filtrosDoisDias, inicio: "2026-10-25", operador: "O1" }),
      "filtro_indisponivel"
    );
  });

  it("aplica o limite de timestamp ao instante da auditoria antes do cast", async () => {
    await recusarConsulta(
      banco,
      () =>
        banco.query(
          "select public.validar_linha_relatorio('auditoria',$1::jsonb)",
          [JSON.stringify(evento({ momento: "2026-02-14T12:00:00-16:00" }))]
        ),
      "linha_relatorio_invalida"
    );
    await banco.query(
      "select public.validar_linha_relatorio('auditoria',$1::jsonb)",
      [JSON.stringify(evento({ momento: "9999-12-31T23:59:59-15:59" }))]
    );
  });
});
