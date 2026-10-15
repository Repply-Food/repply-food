import { describe, expect, it } from "vitest";
import {
  DIA_FECHADO,
  type DiaDoFormulario,
  type Intervalo,
  formatarHora,
  formularioDosIntervalos,
  intervalosDoFormulario,
  problemaNoDia,
  problemaNosIntervalos,
  resumoDoHorario,
} from "../../lib/admin/horario";

const ter = (abre: string, fecha: string): Intervalo => ({
  dia: 2,
  abre,
  fecha,
});

describe("horário de funcionamento (D-56)", () => {
  it.each([
    ["vazio", []],
    ["um", [ter("11:00", "15:00")]],
    ["almoço e jantar", [ter("11:00", "15:00"), ter("18:00", "02:00")]],
    ["fora de ordem", [ter("18:00", "02:00"), ter("11:00", "15:00")]],
    ["colados", [ter("00:00", "12:00"), ter("12:00", "00:00")]],
  ])("aceita %s", (_, intervalos) => {
    expect(problemaNosIntervalos(intervalos)).toBeNull();
  });

  it.each([
    [
      "três no dia",
      [ter("08:00", "09:00"), ter("10:00", "11:00"), ter("12:00", "13:00")],
      "No máximo dois horários por dia.",
    ],
    [
      "sobreposição",
      [ter("11:00", "15:00"), ter("14:00", "16:00")],
      "Os dois horários do mesmo dia não podem se sobrepor.",
    ],
    [
      "o primeiro cruza",
      [ter("01:00", "00:30"), ter("03:00", "04:00")],
      "Só o último horário do dia pode passar da meia-noite.",
    ],
    [
      "abre igual a fecha",
      [ter("11:00", "11:00")],
      "O horário de fechar não pode ser igual ao de abrir.",
    ],
    [
      "dia 7",
      [{ dia: 7, abre: "11:00", fecha: "15:00" }],
      "Dia da semana inválido.",
    ],
    ["hora sem zero", [ter("9:00", "15:00")], "Use horas no formato 00:00."],
  ])("recusa %s", (_, intervalos, mensagem) => {
    expect(problemaNosIntervalos(intervalos)).toBe(mensagem);
  });

  it("dia aberto com hora em branco pede para preencher", () => {
    expect(problemaNoDia({ ...DIA_FECHADO, modo: "um", fecha1: "" })).toBe(
      "Preencha a hora de abrir e a de fechar."
    );
    expect(problemaNoDia({ ...DIA_FECHADO, abre1: "" })).toBeNull();
  });

  it("vai do formulário para o banco e volta igual", () => {
    const dias: DiaDoFormulario[] = Array.from({ length: 7 }, () => ({
      ...DIA_FECHADO,
    }));
    dias[2] = {
      modo: "dois",
      abre1: "11:00",
      fecha1: "15:00",
      abre2: "18:00",
      fecha2: "02:00",
    };
    dias[5] = { ...DIA_FECHADO, modo: "um", abre1: "18:00", fecha1: "23:30" };
    const intervalos = intervalosDoFormulario(dias);
    expect(intervalos).toEqual([
      ter("11:00", "15:00"),
      ter("18:00", "02:00"),
      { dia: 5, abre: "18:00", fecha: "23:30" },
    ]);
    expect(formularioDosIntervalos(intervalos)).toEqual(dias);
  });

  it("o segundo horário guardado fora de ordem volta na ordem de abertura", () => {
    const dias = formularioDosIntervalos([
      ter("18:00", "02:00"),
      ter("11:00", "15:00"),
    ]);
    expect(dias[2]).toEqual({
      modo: "dois",
      abre1: "11:00",
      fecha1: "15:00",
      abre2: "18:00",
      fecha2: "02:00",
    });
  });

  it.each([
    ["05:00", "5h"],
    ["11:30", "11h30"],
    ["00:00", "0h"],
    ["23:00", "23h"],
  ])("formata %s como %s", (hora, texto) => {
    expect(formatarHora(hora)).toBe(texto);
  });

  it("resume a semana a partir da segunda, juntando os dias iguais em sequência", () => {
    const tercaADomingo = [2, 3, 4, 5, 6, 0].flatMap((dia) => [
      { dia, abre: "11:00", fecha: "15:00" },
      { dia, abre: "18:00", fecha: "02:00" },
    ]);
    expect(resumoDoHorario(tercaADomingo)).toBe("ter–dom · 11h–15h e 18h–2h");
    const semanaEFimDeSemana = [
      ...[1, 2, 3, 4, 5].map((dia) => ({ dia, abre: "11:00", fecha: "15:00" })),
      ...[6, 0].map((dia) => ({ dia, abre: "11:00", fecha: "23:00" })),
    ];
    expect(resumoDoHorario(semanaEFimDeSemana)).toBe(
      "seg–sex · 11h–15h; sáb–dom · 11h–23h"
    );
    expect(resumoDoHorario([{ dia: 5, abre: "18:00", fecha: "02:00" }])).toBe(
      "sex · 18h–2h"
    );
    expect(
      resumoDoHorario([
        { dia: 1, abre: "11:00", fecha: "15:00" },
        { dia: 3, abre: "11:00", fecha: "15:00" },
      ])
    ).toBe("seg · 11h–15h; qua · 11h–15h");
    expect(resumoDoHorario([])).toBe("sem horário cadastrado");
  });
});
