// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conectarBanco } from "../helpers/supabase-local";

// America/Fortaleza é UTC-3 o ano todo. 09/10/2026 é uma sexta (dia 5).
const fuso = "America/Fortaleza";
const sextaAteSabado = [{ dia: 5, abre: "11:00", fecha: "02:00" }];
const doisTurnosColados = [
  { dia: 5, abre: "11:00", fecha: "17:00" },
  { dia: 5, abre: "17:00", fecha: "23:00" },
];
const doisTurnosComIntervalo = [
  { dia: 5, abre: "11:00", fecha: "15:00" },
  { dia: 5, abre: "18:00", fecha: "23:00" },
];
const sempreAberto = Array.from({ length: 7 }, (_, dia) => ({
  dia,
  abre: "00:00",
  fecha: "00:00",
}));
// Terça 13/10/2026 (dia 2): almoço e jantar, o jantar passando da meia-noite
// (D-56). Conferido em 15/10: o vigia já trata, sem mudar a função.
const almocoEJantar = [
  { dia: 2, abre: "11:00", fecha: "15:00" },
  { dia: 2, abre: "18:00", fecha: "02:00" },
];
// "24 horas" no formato que o banco aceita desde a etapa 3 (abre ≠ fecha).
const sempreAbertoValido = Array.from({ length: 7 }, (_, dia) => [
  { dia, abre: "00:00", fecha: "12:00" },
  { dia, abre: "12:00", fecha: "00:00" },
]).flat();

describe("desde quando a casa está aberta", () => {
  let banco: Client;

  beforeAll(async () => {
    banco = await conectarBanco();
  });

  afterAll(async () => {
    await banco?.end();
  });

  async function abertoDesde(
    horario: unknown,
    agora: string
  ): Promise<string | null> {
    const resultado = await banco.query<{ desde: string | null }>(
      `select to_char(
                public.aberto_desde($1::jsonb, $2, $3::timestamptz) at time zone 'UTC',
                'YYYY-MM-DD"T"HH24:MI"Z"'
              ) as desde`,
      [JSON.stringify(horario), fuso, agora]
    );
    return resultado.rows[0]?.desde ?? null;
  }

  it.each([
    [
      "sexta 21h40, casa aberta desde as 11h",
      sextaAteSabado,
      "2026-10-10T00:40:00Z",
      "2026-10-09T14:00Z",
    ],
    [
      "sábado 1h30, ainda o expediente de sexta",
      sextaAteSabado,
      "2026-10-10T04:30:00Z",
      "2026-10-09T14:00Z",
    ],
    [
      "sábado 2h em ponto, já fechou",
      sextaAteSabado,
      "2026-10-10T05:00:00Z",
      null,
    ],
    [
      "sexta 10h59, ainda não abriu",
      sextaAteSabado,
      "2026-10-09T13:59:00Z",
      null,
    ],
    [
      "dois turnos colados contam como uma abertura só",
      doisTurnosColados,
      "2026-10-09T21:00:00Z",
      "2026-10-09T14:00Z",
    ],
    [
      "dois turnos com intervalo: vale a abertura do segundo",
      doisTurnosComIntervalo,
      "2026-10-09T21:30:00Z",
      "2026-10-09T21:00Z",
    ],
    [
      "no intervalo entre os turnos, fechado",
      doisTurnosComIntervalo,
      "2026-10-09T19:00:00Z",
      null,
    ],
    [
      "almoço e jantar: terça 12h, aberta desde as 11h",
      almocoEJantar,
      "2026-10-13T15:00:00Z",
      "2026-10-13T14:00Z",
    ],
    [
      "almoço e jantar: terça 16h30, fechada entre os dois",
      almocoEJantar,
      "2026-10-13T19:30:00Z",
      null,
    ],
    [
      "almoço e jantar: terça 20h, aberta desde as 18h",
      almocoEJantar,
      "2026-10-13T23:00:00Z",
      "2026-10-13T21:00Z",
    ],
    [
      "almoço e jantar: quarta 1h59, ainda o jantar de terça",
      almocoEJantar,
      "2026-10-14T04:59:00Z",
      "2026-10-13T21:00Z",
    ],
    [
      "almoço e jantar: quarta 2h em ponto, fechou",
      almocoEJantar,
      "2026-10-14T05:00:00Z",
      null,
    ],
  ])("%s", async (_, horario, agora, esperado) => {
    expect(await abertoDesde(horario, agora)).toBe(esperado);
  });

  it("casa 24 horas não ganha uma 'abertura' nova a cada meia-noite", async () => {
    const resultado = await banco.query<{ antiga: boolean }>(
      `select public.aberto_desde($1::jsonb, $2, $3::timestamptz)
                <= $3::timestamptz - interval '7 days' as antiga`,
      [JSON.stringify(sempreAberto), fuso, "2026-10-10T03:05:00Z"]
    );
    expect(resultado.rows[0]?.antiga).toBe(true);
  });

  it("o '24 horas' que o banco aceita (dois colados por dia) também conta como uma abertura só", async () => {
    const resultado = await banco.query<{ antiga: boolean }>(
      `select public.aberto_desde($1::jsonb, $2, $3::timestamptz)
                <= $3::timestamptz - interval '3 days' as antiga`,
      [JSON.stringify(sempreAbertoValido), fuso, "2026-10-10T03:05:00Z"]
    );
    expect(resultado.rows[0]?.antiga).toBe(true);
  });

  it.each([
    ["lista vazia", "[]"],
    ["nulo", "null"],
    ["texto no lugar da lista", '"sempre"'],
  ])("sem horário configurado (%s) nunca é 'fechado'", async (_, horario) => {
    const resultado = await banco.query<{ sem_inicio: boolean }>(
      `select public.aberto_desde($1::jsonb, $2, now()) = '-infinity'::timestamptz as sem_inicio`,
      [horario, fuso]
    );
    expect(resultado.rows[0]?.sem_inicio).toBe(true);
  });
});
