// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  conferirCookieRecuperacao,
  criarCookieRecuperacao,
} from "../../lib/auth/cookie-recuperacao";

beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "segredo-de-teste-para-o-hmac");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("cookie assinado da recuperação de senha", () => {
  it("vale para o mesmo usuário", () => {
    expect(conferirCookieRecuperacao(criarCookieRecuperacao("u1"), "u1")).toBe(
      true
    );
  });
  it("não vale para outro usuário", () => {
    expect(conferirCookieRecuperacao(criarCookieRecuperacao("u1"), "u2")).toBe(
      false
    );
  });
  it("não vale depois de 10 minutos", () => {
    vi.useFakeTimers();
    const valor = criarCookieRecuperacao("u1");
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(conferirCookieRecuperacao(valor, "u1")).toBe(false);
  });
  it.each(["", "u1.123", "u1.9999999999999.abc", "u1.9999999999999.zz"])(
    "valor adulterado (%s) não vale",
    (valor) => {
      expect(conferirCookieRecuperacao(valor, "u1")).toBe(false);
    }
  );
  it("sem a chave de serviço, falha alto", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => criarCookieRecuperacao("u1")).toThrow();
  });
});
