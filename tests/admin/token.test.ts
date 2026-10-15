// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gerarToken, hashDoToken, prefixoDoToken } from "../../lib/admin/token";
import { sha256Hex } from "../../supabase/functions/_shared/token";
import {
  type Fixture,
  conectarBanco,
  criarFixture,
  envelope,
  enviar,
  limparFixture,
} from "../helpers/supabase-local";

describe("token de envio (D-03, D-38)", () => {
  it("é rf_ seguido de 32 caracteres em base62", () => {
    for (let i = 0; i < 200; i++) {
      expect(gerarToken()).toMatch(/^rf_[0-9A-Za-z]{32}$/);
    }
  });

  it("não se repete", () => {
    expect(new Set(Array.from({ length: 500 }, () => gerarToken())).size).toBe(
      500
    );
  });

  it("o prefixo guardado é rf_ + 4 caracteres", () => {
    const token = gerarToken();
    expect(prefixoDoToken(token)).toBe(token.slice(0, 7));
    expect(prefixoDoToken(token)).toMatch(/^rf_[0-9A-Za-z]{4}$/);
  });

  it.each(["rf_abc", "rf_ÁÇãõ€", "", "rf_8f3kQ2abcdefghijABCDEFGHIJ0123"])(
    "o hash do admin é o mesmo da recepção para %j",
    async (token) => {
      expect(hashDoToken(token)).toBe(await sha256Hex(token));
      expect(hashDoToken(token)).toMatch(/^[0-9a-f]{64}$/);
    }
  );
});

describe("token gerado pelo admin entra na recepção de verdade", () => {
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

  it("receber-envio aceita o token pelo hash que o admin gravou", async () => {
    const token = gerarToken();
    await banco.query(
      "insert into public.tokens_envio (restaurante_id, hash, prefixo) values ($1, $2, $3)",
      [fixture.restauranteA, hashDoToken(token), prefixoDoToken(token)]
    );
    const resposta = await enviar(token, envelope([]));
    expect(resposta.status).toBe(200);
  });
});
