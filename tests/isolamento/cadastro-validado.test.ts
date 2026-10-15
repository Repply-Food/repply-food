// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  comoAutenticado,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";

const FUSOS_DO_BRASIL = [
  "America/Noronha",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Araguaina",
  "America/Maceio",
  "America/Bahia",
  "America/Sao_Paulo",
  "America/Santarem",
  "America/Campo_Grande",
  "America/Cuiaba",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Manaus",
  "America/Eirunepe",
  "America/Rio_Branco",
];

const ter = (abre: string, fecha: string) => ({ dia: 2, abre, fecha });
const DESFAZER = "desfazer";

describe("o banco confere o cadastro do restaurante (pendência 9, D-56, D-60)", () => {
  let banco: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
  });

  afterAll(async () => {
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      await banco?.end();
    }
  });

  /**
   * Grava pelo login do admin, como o painel faz, e desfaz sempre. Devolve
   * "aceito" ou o código do erro do Postgres.
   */
  async function tentar(sql: string, parametros: unknown[]): Promise<string> {
    try {
      await comoAutenticado(banco, fixture.admin, async () => {
        const resultado = await banco.query(sql, parametros);
        if (resultado.rowCount !== 1)
          throw new Error(`linhas: ${resultado.rowCount}`);
        throw new Error(DESFAZER);
      });
      return "inesperado";
    } catch (erro) {
      if (erro instanceof Error && erro.message === DESFAZER) return "aceito";
      return (erro as { code?: string }).code ?? String(erro);
    }
  }

  const horario = (valor: unknown) =>
    tentar(
      "update public.restaurantes set horario_funcionamento = $2::jsonb where id = $1",
      [fixture.restauranteA, JSON.stringify(valor)]
    );
  const fuso = (valor: string) =>
    tentar("update public.restaurantes set fuso = $2 where id = $1", [
      fixture.restauranteA,
      valor,
    ]);
  const cnpj = (valor: string | null) =>
    tentar("update public.restaurantes set cnpj = $2 where id = $1", [
      fixture.restauranteA,
      valor,
    ]);

  it.each([
    ["lista vazia (sempre aberta, cadastro antigo)", []],
    ["um horário", [ter("11:00", "15:00")]],
    [
      "almoço e jantar, o jantar passando da meia-noite",
      [ter("11:00", "15:00"), ter("18:00", "02:00")],
    ],
    ["os dois fora de ordem", [ter("18:00", "02:00"), ter("11:00", "15:00")]],
    ["dois colados (24 horas)", [ter("00:00", "12:00"), ter("12:00", "00:00")]],
    [
      "a semana inteira",
      Array.from({ length: 7 }, (_, dia) => ({
        dia,
        abre: "11:00",
        fecha: "23:00",
      })),
    ],
  ])("horário aceito: %s", async (_, valor) => {
    expect(await horario(valor)).toBe("aceito");
  });

  it.each([
    [
      "três horários no mesmo dia",
      [ter("08:00", "09:00"), ter("10:00", "11:00"), ter("12:00", "13:00")],
    ],
    ["dois que se sobrepõem", [ter("11:00", "15:00"), ter("14:00", "16:00")]],
    [
      "o primeiro passa da meia-noite",
      [ter("01:00", "00:30"), ter("03:00", "04:00")],
    ],
    ["abre igual a fecha", [ter("11:00", "11:00")]],
    ["dia 7", [{ dia: 7, abre: "11:00", fecha: "15:00" }]],
    ["dia como texto", [{ dia: "2", abre: "11:00", fecha: "15:00" }]],
    ["hora 25:00", [ter("25:00", "15:00")]],
    ["hora sem zero à esquerda", [ter("9:00", "15:00")]],
    ["chave a mais", [{ dia: 2, abre: "11:00", fecha: "15:00", x: 1 }]],
    ["sem o fecha", [{ dia: 2, abre: "11:00" }]],
    ["objeto no lugar da lista", { dia: 2 }],
    ["número no lugar do horário", [1]],
    ["null do JSON", null],
    ["o malformado do vigia", [{ dia: "sexta", abre: "25:99", fecha: "oi" }]],
  ])("horário recusado: %s", async (_, valor) => {
    expect(await horario(valor)).toBe("23514");
  });

  it.each(FUSOS_DO_BRASIL)("fuso %s é aceito", async (valor) => {
    expect(await fuso(valor)).toBe("aceito");
  });

  it.each(["Marte/Olimpo", "America/New_York", "UTC", ""])(
    "fuso '%s' é recusado",
    async (valor) => {
      expect(await fuso(valor)).toBe("23514");
    }
  );

  it.each([null, "12345678000195", "98765432000198", "12ABC34501DE35"])(
    "CNPJ %s é aceito",
    async (valor) => {
      expect(await cnpj(valor)).toBe("aceito");
    }
  );

  it.each([
    "12345678000190",
    "11111111111111",
    "00000000000000",
    "12.345.678/0001-95",
    "1234567800019",
    "1234567800019A",
    "12abc34501de35",
  ])("CNPJ %s é recusado", async (valor) => {
    expect(await cnpj(valor)).toBe("23514");
  });

  it("o mesmo CNPJ não entra em duas casas", async () => {
    await expect(
      comoAutenticado(banco, fixture.admin, async () => {
        await banco.query(
          "update public.restaurantes set cnpj = $2 where id = $1",
          [fixture.restauranteA, "12345678000195"]
        );
        await banco.query(
          "update public.restaurantes set cnpj = $2 where id = $1",
          [fixture.restauranteB, "12345678000195"]
        );
      })
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("o admin cadastra uma casa nova com horário, fuso e CNPJ válidos", async () => {
    expect(
      await tentar(
        `insert into public.restaurantes (slug, nome, fuso, cnpj, horario_funcionamento)
         values ($1, 'Casa nova', 'America/Manaus', '98765432000198', $2::jsonb)`,
        [`casa-nova-${randomUUID()}`, JSON.stringify([ter("11:00", "15:00")])]
      )
    ).toBe("aceito");
  });
});
