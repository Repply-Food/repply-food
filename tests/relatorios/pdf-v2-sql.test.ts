import { resultadoSchemas } from "@/lib/relatorios/schemas-saida";
import type { ConsultaRelatorio } from "@/lib/relatorios/tipos";
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
  vi,
} from "vitest";
import { type Fixture, conectarBanco } from "../helpers/supabase-local";
import {
  identidade,
  prepararConsulta,
  publicarFixture,
} from "./consulta-sql-helpers";

const leitura = vi.hoisted(() => ({ obter: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/relatorios/leitura", () => ({ obterRelatorio: leitura.obter }));

import { carregarDadosPdf } from "@/lib/relatorios/pdf-dados";

describe("PDF de notas com fotografias v2", () => {
  let banco: Client;
  let fixture: Fixture;
  beforeAll(async () => {
    banco = await conectarBanco();
  });
  afterAll(async () => {
    await banco.end();
  });
  beforeEach(async () => {
    fixture = await prepararConsulta(banco);
    leitura.obter.mockReset();
  });
  afterEach(async () => {
    await banco.query("rollback");
  });

  it("reúne notas repetidas filtradas da casa sem incluir outra casa ou outro cliente", async () => {
    const nota = {
      codigo_nota: "N1",
      codigo_entrada: "E1",
      codigo_cliente: "C1",
      valor: "1.25",
    };
    await publicarFixture(banco, fixture.restauranteA, {
      relatorio: "notas-assinadas",
      recursos: ["cliente"],
      linhas: [
        ...Array.from({ length: 101 }, () => nota),
        { ...nota, codigo_cliente: "C2", valor: "8.00" },
      ],
    });
    await publicarFixture(banco, fixture.restauranteB, {
      relatorio: "notas-assinadas",
      recursos: ["cliente"],
      linhas: [{ ...nota, valor: "999.00" }],
    });
    await identidade(banco, fixture.usuarioA);
    leitura.obter.mockImplementation(
      async (
        casa: string,
        relatorio: string,
        consulta: ConsultaRelatorio,
        tamanho: number
      ) => {
        const { rows } = await banco.query(
          "select public.consultar_relatorio($1,$2,$3::jsonb,$4,$5,$6) r",
          [
            casa,
            relatorio,
            JSON.stringify(consulta.filtros),
            consulta.pagina,
            tamanho,
            consulta.revisao ?? null,
          ]
        );
        return resultadoSchemas["notas-assinadas"].parse(rows[0].r);
      }
    );
    const consulta = {
      filtros: {
        inicio: "2026-10-24",
        fim: "2026-10-24",
        fonte: "historico" as const,
        cliente: "C1",
      },
      pagina: 1,
    };
    const pdf = await carregarDadosPdf(
      fixture.restauranteA,
      "notas-assinadas",
      consulta
    );
    expect(pdf.linhas).toHaveLength(101);
    expect(
      pdf.linhas.every(
        (linha) => linha.codigoCliente === "C1" && linha.valor === "1.25"
      )
    ).toBe(true);
    expect(pdf.resumo).toEqual({ notas: 101, valor: "126.25" });
    expect(leitura.obter).toHaveBeenCalledTimes(2);
    await expect(
      carregarDadosPdf(fixture.restauranteB, "notas-assinadas", consulta)
    ).rejects.toMatchObject({ message: "acesso_negado" });
  });
});
