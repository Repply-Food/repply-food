import { describe, expect, it } from "vitest";
import { DIA_FECHADO } from "../../lib/admin/horario";
import {
  type RestauranteInput,
  VALORES_INICIAIS,
  emailSchema,
  formularioDoRestaurante,
  paraOBanco,
  problemaNoReenvio,
  restauranteSchema,
} from "../../lib/admin/schemas";

function valido(): RestauranteInput {
  const dias = Array.from({ length: 7 }, () => ({ ...DIA_FECHADO }));
  dias[2] = {
    modo: "dois",
    abre1: "11:00",
    fecha1: "15:00",
    abre2: "18:00",
    fecha2: "02:00",
  };
  return {
    nome: " Bar do Zé ",
    cnpj: "12.345.678/0001-95",
    fuso: "America/Fortaleza",
    horaVirada: "5",
    dias,
  };
}

function caminhos(entrada: RestauranteInput): string[] {
  const resultado = restauranteSchema.safeParse(entrada);
  return resultado.success
    ? []
    : resultado.error.issues.map((i) => i.path.join("."));
}

describe("formulário do restaurante", () => {
  it("o cadastro válido passa e vai para o banco como o banco grava", () => {
    const resultado = restauranteSchema.safeParse(valido());
    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(paraOBanco(resultado.data)).toEqual({
      nome: "Bar do Zé",
      cnpj: "12345678000195",
      fuso: "America/Fortaleza",
      hora_virada: "05:00",
      horario_funcionamento: [
        { dia: 2, abre: "11:00", fecha: "15:00" },
        { dia: 2, abre: "18:00", fecha: "02:00" },
      ],
    });
  });

  it("CNPJ em branco vira nulo", () => {
    const resultado = restauranteSchema.safeParse({ ...valido(), cnpj: "" });
    expect(resultado.success && paraOBanco(resultado.data).cnpj).toBeNull();
  });

  it("os valores iniciais pedem pelo menos um dia aberto", () => {
    expect(caminhos({ ...VALORES_INICIAIS, nome: "Casa nova" })).toEqual([
      "dias",
    ]);
  });

  it.each([
    ["CNPJ errado", { cnpj: "12.345.678/0001-90" }, "cnpj"],
    ["fuso de fora", { fuso: "America/New_York" }, "fuso"],
    ["virada inválida", { horaVirada: "24" }, "horaVirada"],
    ["nome curto", { nome: "A" }, "nome"],
  ] as const)("%s aponta o campo", (_, mudanca, campo) => {
    expect(caminhos({ ...valido(), ...mudanca })).toEqual([campo]);
  });

  it("dia com horários que se sobrepõem aponta o dia", () => {
    const entrada = valido();
    entrada.dias[4] = {
      modo: "dois",
      abre1: "11:00",
      fecha1: "15:00",
      abre2: "14:00",
      fecha2: "16:00",
    };
    expect(caminhos(entrada)).toEqual(["dias.4"]);
  });

  it("volta do banco para o formulário", () => {
    expect(
      formularioDoRestaurante({
        nome: "Bar do Zé",
        cnpj: "12345678000195",
        fuso: "America/Fortaleza",
        hora_virada: "05:00:00",
        horario_funcionamento: [
          { dia: 2, abre: "18:00", fecha: "02:00" },
          { dia: 2, abre: "11:00", fecha: "15:00" },
        ],
      })
    ).toEqual({ ...valido(), nome: "Bar do Zé" });
  });

  it("horário ilegível do banco vira semana fechada no formulário", () => {
    const valores = formularioDoRestaurante({
      nome: "X",
      cnpj: null,
      fuso: "America/Fortaleza",
      hora_virada: "05:00:00",
      horario_funcionamento: { quebrado: true },
    });
    expect(valores.dias.every((d) => d.modo === "fechado")).toBe(true);
    expect(valores.cnpj).toBe("");
  });

  it("e-mail limpo e minúsculo", () => {
    expect(emailSchema.parse({ email: "  Dono@Bar.COM " }).email).toBe(
      "dono@bar.com"
    );
    expect(emailSchema.safeParse({ email: "dono" }).success).toBe(false);
  });
});

describe("pedido de reenvio (desenho §1.1, cartão 5)", () => {
  const hoje = "2026-10-14";
  it.each([
    ["2026-10-14", null],
    ["2026-06-16", null],
    ["2026-10-15", "A data não pode ser no futuro."],
    ["2026-06-15", "A data não pode ser anterior a 120 dias."],
    ["2026-02-30", "Escolha uma data válida."],
    ["", "Escolha uma data válida."],
  ])("%j → %j", (desde, problema) => {
    expect(problemaNoReenvio(desde, hoje)).toBe(problema);
  });
});
