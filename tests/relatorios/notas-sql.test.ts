import {
  linhaNotaSaidaSchema,
  paginacaoSchema,
  resumoNotasSchema,
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
import type { LinhaNota } from "../../supabase/functions/_shared/relatorios/schemas";
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
    linhas: z.array(linhaNotaSaidaSchema),
    resumo: resumoNotasSchema,
    paginacao: paginacaoSchema,
  })
  .strict();
const filtros = { ...filtrosDoisDias, fim: "2026-10-24" };
const nota = (parcial: Partial<LinhaNota> = {}): LinhaNota => ({
  codigo_nota: "N1",
  codigo_entrada: "E1",
  codigo_cliente: "CL1",
  valor: "12.25",
  ...parcial,
});

describe("notas assinadas das fotografias reais do PostgreSQL local", () => {
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
  async function publicar(
    linhas: LinhaNota[],
    casa = fixture.restauranteA,
    dia = "2026-10-24",
    fonte = "historico"
  ) {
    await publicarFixture(banco, casa, {
      relatorio: "notas-assinadas",
      recursos: ["cliente"],
      linhas,
      dia,
      fonte,
    });
  }
  async function consultar(
    consulta: unknown = filtros,
    pagina = 1,
    tamanho = 50,
    casa = fixture.restauranteA
  ) {
    const { rows } = await banco.query<{ r: unknown }>(
      "select relatorios_privados.notas_assinadas($1,$2::jsonb,$3,$4) r",
      [casa, JSON.stringify(consulta), pagina, tamanho]
    );
    return resultadoSchema.parse(rows[0]?.r);
  }

  it("preserva duas notas da mesma entrada, sem multiplicar por dia, fonte ou produtos", async () => {
    await publicar([nota(), nota({ codigo_nota: "N2", valor: "7.75" })]);
    await publicar(
      [nota({ valor: "99.00" })],
      fixture.restauranteA,
      "2026-10-25"
    );
    await publicar(
      [nota({ valor: "88.00" })],
      fixture.restauranteA,
      "2026-10-24",
      "online"
    );
    await publicarFixture(banco, fixture.restauranteA, {
      linhas: [paginaProdutos().linhas[0], paginaProdutos().linhas[0]],
    });
    await identidade(banco, fixture.usuarioA);
    expect(await consultar()).toEqual({
      linhas: [
        {
          codigoNota: "N1",
          codigoEntrada: "E1",
          diaMovimento: "2026-10-24",
          codigoCliente: "CL1",
          valor: "12.25",
        },
        {
          codigoNota: "N2",
          codigoEntrada: "E1",
          diaMovimento: "2026-10-24",
          codigoCliente: "CL1",
          valor: "7.75",
        },
      ],
      resumo: { notas: 2, valor: "20.00" },
      paginacao: { pagina: 1, tamanho: 50, totalLinhas: 2 },
    });
    expect((await consultar({ ...filtros, fonte: "online" })).resumo).toEqual({
      notas: 1,
      valor: "88.00",
    });
  });

  it("calcula totais antes de paginar e mantém ocorrências idênticas legítimas", async () => {
    await publicar([
      nota(),
      nota(),
      nota({ codigo_nota: "N2", valor: "7.75" }),
    ]);
    await identidade(banco, fixture.usuarioA);
    const primeira = await consultar(filtros, 1, 1);
    expect(primeira.resumo).toEqual({ notas: 3, valor: "32.25" });
    expect(primeira.paginacao).toEqual({
      pagina: 1,
      tamanho: 1,
      totalLinhas: 3,
    });
    expect((await consultar(filtros, 2, 1)).linhas).toEqual(primeira.linhas);
    expect((await consultar(filtros, 3, 1)).linhas[0]?.codigoNota).toBe("N2");
    expect(await consultar(filtros, 2147483647, 100)).toMatchObject({
      linhas: [],
      resumo: { notas: 3, valor: "32.25" },
      paginacao: { totalLinhas: 3 },
    });
  });

  it("filtra cliente por código exato, isola casa e recusa SQL literal", async () => {
    await publicar([nota(), nota({ codigo_cliente: "CL10", valor: "1.00" })]);
    await publicar([nota({ valor: "999.00" })], fixture.restauranteB);
    await identidade(banco, fixture.usuarioA);
    expect((await consultar({ ...filtros, cliente: "CL1" })).resumo).toEqual({
      notas: 1,
      valor: "12.25",
    });
    expect(
      (await consultar({ ...filtros, cliente: "CL1_OR_true--" })).linhas
    ).toEqual([]);
    await recusarConsulta(
      banco,
      () => consultar({ ...filtros, cliente: "CL1' OR true --" }),
      "consulta_invalida"
    );
    await recusarConsulta(
      banco,
      () => consultar(filtros, 1, 50, fixture.restauranteB),
      "acesso_negado"
    );
    await identidade(banco, fixture.usuarioB);
    expect(
      (await consultar(filtros, 1, 50, fixture.restauranteB)).resumo.valor
    ).toBe("999.00");
    await identidade(banco, fixture.admin);
    expect((await consultar({ ...filtros, cliente: "CL1" })).resumo.valor).toBe(
      "12.25"
    );
  });

  it("ordena cliente, dia, entrada, nota e posição sem eliminar duplicatas", async () => {
    await publicar([
      nota({ codigo_cliente: "CL2" }),
      nota({ codigo_entrada: "E2" }),
      nota({ codigo_nota: "N2" }),
      nota({ valor: "2.00" }),
      nota({ valor: "1.00" }),
    ]);
    await publicar([nota()], fixture.restauranteA, "2026-10-25");
    await identidade(banco, fixture.usuarioA);
    expect(
      (await consultar(filtrosDoisDias)).linhas.map(
        (linha) =>
          `${linha.codigoCliente}/${linha.diaMovimento}/${linha.codigoEntrada}/${linha.codigoNota}/${linha.valor}`
      )
    ).toEqual([
      "CL1/2026-10-24/E1/N1/2.00",
      "CL1/2026-10-24/E1/N1/1.00",
      "CL1/2026-10-24/E1/N2/12.25",
      "CL1/2026-10-24/E2/N1/12.25",
      "CL1/2026-10-25/E1/N1/12.25",
      "CL2/2026-10-24/E1/N1/12.25",
    ]);
  });

  it("aceita 366 dias, arredonda só a soma e retorna vazio estável", async () => {
    await publicar(
      [nota({ valor: "0.105" })],
      fixture.restauranteA,
      "2025-10-24"
    );
    await publicar([nota({ valor: "0.105" })]);
    await identidade(banco, fixture.usuarioA);
    expect(
      (await consultar({ ...filtros, inicio: "2025-10-24" })).resumo
    ).toEqual({ notas: 2, valor: "0.21" });
    expect(
      await consultar({ ...filtros, inicio: "2026-10-25", fim: "2026-10-25" })
    ).toEqual({
      linhas: [],
      resumo: { notas: 0, valor: "0.00" },
      paginacao: { pagina: 1, tamanho: 50, totalLinhas: 0 },
    });
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

  it("helper invoker não revela linhas sem acesso e tem grants explícitos", async () => {
    await publicar([nota()]);
    await identidade(banco, fixture.usuarioSemAcesso);
    await recusarConsulta(banco, () => consultar(), "acesso_negado");
    const { rows } = await banco.query(
      `select p.prosecdef as definer, has_function_privilege('anon',p.oid,'execute') as anon, has_function_privilege('authenticated',p.oid,'execute') as authenticated, has_function_privilege('service_role',p.oid,'execute') as service from pg_proc p where p.oid = 'relatorios_privados.notas_assinadas(uuid,jsonb,integer,integer)'::regprocedure`
    );
    expect(rows).toEqual([
      { definer: false, anon: false, authenticated: true, service: false },
    ]);
  });
});
