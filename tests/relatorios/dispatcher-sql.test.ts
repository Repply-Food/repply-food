import { resultadoSchemas } from "@/lib/relatorios/schemas-saida";
import type { Relatorio } from "@/lib/validators/relatorios";
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
import { type Fixture, conectarBanco } from "../helpers/supabase-local";
import {
  identidade,
  prepararConsulta,
  publicarFixture,
} from "./consulta-sql-helpers";
import { linhasRelatorios } from "./fixtures";

const relatorios: Relatorio[] = [
  "produtos",
  "comissao",
  "caixa",
  "auditoria",
  "notas-assinadas",
  "financeiro",
];
const filtros = {
  inicio: "2026-10-24",
  fim: "2026-10-24",
  fonte: "historico",
};
const recursos: Record<Relatorio, string[]> = {
  produtos: ["pdv", "grupo", "garcom", "mesa"],
  comissao: ["operador"],
  caixa: ["operador", "tipo", "categoria"],
  auditoria: ["operador", "tipo"],
  "notas-assinadas": ["cliente"],
  financeiro: [],
};

describe("dispatcher real de relatórios no PostgreSQL local", () => {
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
    relatorio: Relatorio,
    consulta: unknown = filtros,
    pagina = 1,
    tamanho = 50,
    revisao: string | null = null,
    casa = fixture.restauranteA
  ) {
    const { rows } = await banco.query<{ resultado: unknown }>(
      "select public.consultar_relatorio($1,$2,$3::jsonb,$4,$5,$6) resultado",
      [casa, relatorio, JSON.stringify(consulta), pagina, tamanho, revisao]
    );
    return rows[0]?.resultado;
  }

  it.each(relatorios)(
    "entrega resultado fechado para %s",
    async (relatorio) => {
      await publicarFixture(banco, fixture.restauranteA, {
        relatorio,
        recursos: recursos[relatorio],
        linhas: [linhasRelatorios[relatorio]],
      });
      await identidade(banco, fixture.usuarioA);
      const resultado = consultar(relatorio);
      await expect(resultado).resolves.toMatchObject({
        situacao: "completo",
        revisao: "0",
        cobertura: {
          esperados: 1,
          recebidos: 1,
          ausentes: [],
          simulacao: false,
        },
      });
      const validado = await resultadoSchemas[relatorio].parseAsync(
        await resultado
      );
      expect(validado.linhas).toHaveLength(1);
      expect(validado.paginacao).toEqual({
        pagina: 1,
        tamanho: 50,
        totalLinhas: 1,
      });
    }
  );

  it("rejeita página obsoleta antes de juntar linhas de uma nova publicação", async () => {
    const filtrosDoisDias = { ...filtros, fim: "2026-10-25" };
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "produtos",
      dia: "2026-10-24",
      recursos: recursos.produtos,
      linhas: [{ ...linhasRelatorios.produtos, codigo_produto: "P1" }],
    });
    await banco.query(
      "insert into public.relatorio_versoes(restaurante_id,revisao) values ($1,1)",
      [fixture.restauranteA]
    );
    await identidade(banco, fixture.usuarioA);
    const primeira = await consultar("produtos", filtrosDoisDias, 1, 1);
    expect(primeira).toMatchObject({
      revisao: "1",
      paginacao: { totalLinhas: 1 },
    });

    await banco.query("reset role");
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "produtos",
      dia: "2026-10-25",
      recursos: recursos.produtos,
      linhas: [{ ...linhasRelatorios.produtos, codigo_produto: "P2" }],
    });
    await banco.query(
      "update public.relatorio_versoes set revisao = revisao + 1 where restaurante_id = $1",
      [fixture.restauranteA]
    );
    await identidade(banco, fixture.usuarioA);
    await expect(
      consultar("produtos", filtrosDoisDias, 2, 1, "1")
    ).rejects.toMatchObject({ message: "dados_alterados" });
  });

  it("isola a revisão por casa e totais pela fonte selecionada", async () => {
    await publicarFixture(banco, fixture.restauranteA, {
      recursos: recursos.produtos,
      linhas: [linhasRelatorios.produtos],
    });
    await publicarFixture(banco, fixture.restauranteA, {
      fonte: "online",
      recursos: recursos.produtos,
      linhas: [{ ...linhasRelatorios.produtos, codigo_produto: "P2" }],
    });
    await banco.query(
      "insert into public.relatorio_versoes(restaurante_id,revisao) values ($1,9)",
      [fixture.restauranteB]
    );
    await identidade(banco, fixture.usuarioA);
    await expect(consultar("produtos")).resolves.toMatchObject({
      revisao: "0",
      paginacao: { totalLinhas: 1 },
    });
  });

  it("expõe dispatcher autenticado e helpers sem execução pública ou de service_role", async () => {
    const { rows } = await banco.query(
      `select has_function_privilege('anon', 'public.consultar_relatorio(uuid,text,jsonb,integer,integer,text)', 'execute') anon,
              has_function_privilege('authenticated', 'public.consultar_relatorio(uuid,text,jsonb,integer,integer,text)', 'execute') authenticated,
              has_function_privilege('service_role', 'public.consultar_relatorio(uuid,text,jsonb,integer,integer,text)', 'execute') service,
              has_function_privilege('authenticated', 'relatorios_privados.financeiro(uuid,jsonb,integer,integer)', 'execute') financeiro,
              has_function_privilege('service_role', 'relatorios_privados.financeiro(uuid,jsonb,integer,integer)', 'execute') servico_financeiro`
    );
    expect(rows[0]).toEqual({
      anon: false,
      authenticated: true,
      service: false,
      financeiro: true,
      servico_financeiro: false,
    });
  });
});
