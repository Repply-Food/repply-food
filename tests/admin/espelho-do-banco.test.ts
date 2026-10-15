// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cnpjValido } from "../../lib/admin/cnpj";
import { FUSOS_DO_BRASIL } from "../../lib/admin/fusos";
import { ACOES_ADMIN } from "../../lib/admin/historico";
import { type Intervalo, problemaNosIntervalos } from "../../lib/admin/horario";
import { conectarBanco } from "../helpers/supabase-local";

const ter = (abre: string, fecha: string): Intervalo => ({
  dia: 2,
  abre,
  fecha,
});

/** O formulário e o banco precisam dar a mesma resposta (desenho §2.4). */
describe("a tela e o banco conferem igual", () => {
  let banco: Client;

  beforeAll(async () => {
    banco = await conectarBanco();
  });

  afterAll(async () => {
    await banco?.end();
  });

  async function valoresDaRestricao(nome: string): Promise<string[]> {
    const { rows } = await banco.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1",
      [nome]
    );
    return [...(rows[0]?.def ?? "").matchAll(/'([^']+)'::text/g)]
      .map((m) => m[1] ?? "")
      .sort();
  }

  it.each([
    ["vazio", []],
    ["um", [ter("11:00", "15:00")]],
    ["almoço e jantar", [ter("11:00", "15:00"), ter("18:00", "02:00")]],
    ["fora de ordem", [ter("18:00", "02:00"), ter("11:00", "15:00")]],
    ["colados", [ter("00:00", "12:00"), ter("12:00", "00:00")]],
    [
      "três",
      [ter("08:00", "09:00"), ter("10:00", "11:00"), ter("12:00", "13:00")],
    ],
    ["sobreposição", [ter("11:00", "15:00"), ter("14:00", "16:00")]],
    ["primeiro cruza", [ter("01:00", "00:30"), ter("03:00", "04:00")]],
    ["mesma abertura", [ter("11:00", "12:00"), ter("11:00", "13:00")]],
    ["abre igual a fecha", [ter("11:00", "11:00")]],
    ["dia 7", [{ dia: 7, abre: "11:00", fecha: "15:00" }]],
    ["hora 25", [ter("25:00", "15:00")]],
    ["hora sem zero", [ter("9:00", "15:00")]],
  ])("horário %s", async (_, intervalos) => {
    const { rows } = await banco.query<{ valido: boolean }>(
      "select public.horario_funcionamento_valido($1::jsonb) as valido",
      [JSON.stringify(intervalos)]
    );
    expect(problemaNosIntervalos(intervalos) === null).toBe(rows[0]?.valido);
  });

  it.each([
    "12345678000195",
    "12ABC34501DE35",
    "12345678000190",
    "11111111111111",
    "1234567800019A",
    "12abc34501de35",
  ])("CNPJ %s", async (cnpj) => {
    const { rows } = await banco.query<{ valido: boolean }>(
      "select public.cnpj_valido($1) as valido",
      [cnpj]
    );
    expect(cnpjValido(cnpj)).toBe(rows[0]?.valido);
  });

  it("a lista de fusos é a mesma do banco", async () => {
    expect(await valoresDaRestricao("restaurantes_fuso_do_brasil")).toEqual(
      FUSOS_DO_BRASIL.map((f) => f.valor).sort()
    );
  });

  it("a lista de ações do histórico é a mesma do banco", async () => {
    expect(await valoresDaRestricao("registro_admin_acao_valida")).toEqual(
      [...ACOES_ADMIN].sort()
    );
  });
});
