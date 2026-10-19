import { opcoesDeCookieSeguro } from "@/lib/supabase/cookies";
import { describe, expect, it } from "vitest";

describe("opções de cookie num lugar só (dívida 37)", () => {
  it("em produção força secure e sameSite lax quando não vier", () => {
    expect(opcoesDeCookieSeguro({ path: "/" }, true)).toEqual({
      path: "/",
      secure: true,
      sameSite: "lax",
    });
  });

  it("em produção respeita um sameSite já escolhido", () => {
    expect(opcoesDeCookieSeguro({ sameSite: "strict" }, true)).toEqual({
      secure: true,
      sameSite: "strict",
    });
  });

  it("fora de produção não força secure (o login local é http)", () => {
    expect(opcoesDeCookieSeguro({ path: "/" }, false)).toEqual({ path: "/" });
  });

  it("opções indefinidas não quebram", () => {
    expect(opcoesDeCookieSeguro(undefined, true)).toEqual({
      secure: true,
      sameSite: "lax",
    });
  });
});
