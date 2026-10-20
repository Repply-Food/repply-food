import { metaSchema, turnosSchema } from "@/lib/painel/ajustes-schemas";
import { describe, expect, it } from "vitest";

describe("metaSchema", () => {
  it("aceita mês (dia 1) e valor > 0 ou vazio", () => {
    expect(
      metaSchema.safeParse({ mes: "2026-10-01", valor: "30000.00" }).success
    ).toBe(true);
    expect(metaSchema.safeParse({ mes: "2026-10-01", valor: "" }).success).toBe(
      true
    );
  });
  it("recusa mês que não é dia 1", () => {
    expect(
      metaSchema.safeParse({ mes: "2026-10-15", valor: "1" }).success
    ).toBe(false);
  });
  it("recusa valor <= 0", () => {
    expect(
      metaSchema.safeParse({ mes: "2026-10-01", valor: "0" }).success
    ).toBe(false);
    expect(
      metaSchema.safeParse({ mes: "2026-10-01", valor: "-5" }).success
    ).toBe(false);
  });
  it("aceita o teto do numeric(12,2) e recusa acima dele", () => {
    expect(
      metaSchema.safeParse({ mes: "2026-10-01", valor: "9999999999.99" })
        .success
    ).toBe(true);
    expect(
      metaSchema.safeParse({ mes: "2026-10-01", valor: "10000000000.00" })
        .success
    ).toBe(false);
  });
  it("recusa mais de 2 casas e zero", () => {
    expect(
      metaSchema.safeParse({ mes: "2026-10-01", valor: "1.234" }).success
    ).toBe(false);
    expect(
      metaSchema.safeParse({ mes: "2026-10-01", valor: "0.00" }).success
    ).toBe(false);
  });
  it("recusa mês impossível", () => {
    expect(
      metaSchema.safeParse({ mes: "2026-13-01", valor: "1" }).success
    ).toBe(false);
  });
});

describe("turnosSchema", () => {
  it("aceita HH:MM", () => {
    expect(turnosSchema.safeParse({ almocoAte: "17:00" }).success).toBe(true);
  });
  it("recusa hora inválida", () => {
    expect(turnosSchema.safeParse({ almocoAte: "25:00" }).success).toBe(false);
    expect(turnosSchema.safeParse({ almocoAte: "17h" }).success).toBe(false);
  });
});
