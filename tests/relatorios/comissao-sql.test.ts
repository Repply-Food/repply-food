import {
  linhaComissaoSaidaSchema,
  paginacaoSchema,
  resumoComissaoSchema,
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
import type { LinhaComissao } from "../../supabase/functions/_shared/relatorios/schemas";
import { type Fixture, conectarBanco } from "../helpers/supabase-local";
import {
  identidade,
  prepararConsulta,
  publicarFixture,
} from "./consulta-sql-helpers";

const resultadoSchema = z
  .object({
    linhas: z.array(linhaComissaoSaidaSchema),
    resumo: resumoComissaoSchema,
    paginacao: paginacaoSchema,
  })
  .strict();
const filtros = { inicio: "2026-10-24", fim: "2026-10-25", fonte: "historico" };
const linha = (parcial: Partial<LinhaComissao> = {}): LinhaComissao => ({
  codigo_operador: "O1",
  operador: "Operador fictício",
  funcao: "Garçom",
  vendas_elegiveis: "80.00",
  comissao_oficial: "6.40",
  ...parcial,
});

describe("comissão nas fotografias reais do PostgreSQL local", () => {
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
      "select relatorios_privados.comissao($1,$2::jsonb,$3,$4) r",
      [casa, JSON.stringify(consulta), pagina, tamanho]
    );
    return resultadoSchema.parse(rows[0]?.r);
  }

  it("preserva comissão oficial parcial e soma vendas elegíveis sem derivar taxa", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "comissao",
      recursos: ["operador"],
      linhas: [
        linha(),
        linha({
          codigo_operador: "O2",
          operador: "Operador fictício B",
          funcao: null,
          vendas_elegiveis: "20.00",
          comissao_oficial: null,
        }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    expect(await consultar()).toMatchObject({
      linhas: [
        {
          codigoOperador: "O1",
          vendasElegiveis: "80.00",
          comissaoOficial: "6.40",
        },
        {
          codigoOperador: "O2",
          vendasElegiveis: "20.00",
          comissaoOficial: null,
        },
      ],
      resumo: {
        vendasElegiveis: "100.00",
        comissaoOficial: null,
        operadoresSemComissao: 1,
      },
      paginacao: { totalLinhas: 2 },
    });
    expect((await consultar({ ...filtros, operador: "O1" })).resumo).toEqual({
      vendasElegiveis: "80.00",
      comissaoOficial: "6.40",
      operadoresSemComissao: 0,
    });
  });

  it("agrega o operador entre dias, propaga nulos e calcula resumo antes da página", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "comissao",
      recursos: ["operador"],
      linhas: [linha()],
    });
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "comissao",
      dia: "2026-10-25",
      recursos: ["operador"],
      linhas: [
        linha({
          operador: "Outro rótulo",
          funcao: "Outra função",
          vendas_elegiveis: "20.00",
          comissao_oficial: null,
        }),
      ],
    });
    await identidade(banco, fixture.usuarioA);
    const primeira = await consultar(filtros, 1, 1);
    expect(primeira.linhas).toHaveLength(1);
    expect(primeira.resumo).toEqual({
      vendasElegiveis: "100.00",
      comissaoOficial: null,
      operadoresSemComissao: 1,
    });
    expect(primeira.paginacao.totalLinhas).toBe(1);
    expect((await consultar(filtros, 2, 1)).resumo).toEqual(primeira.resumo);
  });
});
