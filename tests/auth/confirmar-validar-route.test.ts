// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, verifyOtp, createClient } = vi.hoisted(() => {
  const getUser = vi.fn();
  const verifyOtp = vi.fn();
  return {
    getUser,
    verifyOtp,
    createClient: vi.fn(async () => ({ auth: { getUser, verifyOtp } })),
  };
});
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { POST } from "@/app/auth/confirmar/validar/route";

const ORIGEM = "http://127.0.0.1:3000";

function postar(campos: Record<string, string>) {
  const corpo = new URLSearchParams(campos);
  return POST(
    new NextRequest(`${ORIGEM}/auth/confirmar/validar`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: corpo.toString(),
    })
  );
}

beforeEach(() => {
  createClient.mockClear();
  getUser.mockReset();
  verifyOtp.mockReset();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "segredo-de-teste");
  verifyOtp.mockResolvedValue({ error: null });
  // 1ª chamada: ninguém logado; 2ª (depois do link): o usuário do link.
  getUser
    .mockResolvedValueOnce({ data: { user: null } })
    .mockResolvedValue({ data: { user: { id: "u1" } } });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /auth/confirmar/validar", () => {
  it("recovery válido gasta o token, entrega o cookie e vai para /nova-senha", async () => {
    const r = await postar({
      token_hash: "abc",
      type: "recovery",
      next: "/nova-senha",
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "abc",
    });
    // 303 (não 307): o navegador faz GET na página /nova-senha. Um 307
    // reenviaria o POST e daria 405 numa página sem route handler.
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/nova-senha");
    // Resposta com cookie de sessão nunca fica guardada por CDN nem proxy.
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    const cookie = r.cookies.get("recuperacao_senha");
    expect(cookie?.value.startsWith("u1.")).toBe(true);
    const bruto = r.headers
      .getSetCookie()
      .find((c) => c.startsWith("recuperacao_senha="));
    expect(bruto).toMatch(/HttpOnly/i);
    expect(bruto).toMatch(/Path=\/nova-senha/);
    expect(bruto).toMatch(/Max-Age=600/);
  });

  it("convite válido gasta o token e segue para o destino, sem cookie de recuperação", async () => {
    const r = await postar({
      token_hash: "abc",
      type: "invite",
      next: "/r/casa/hoje",
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      type: "invite",
      token_hash: "abc",
    });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/r/casa/hoje");
    expect(r.cookies.get("recuperacao_senha")).toBeUndefined();
  });

  it.each(["signup", "email", "magiclink", "email_change", "qualquer", ""])(
    "tipo fora da lista (%s) é recusado e não gasta o token",
    async (type) => {
      const r = await postar({ token_hash: "abc", type, next: "/nova-senha" });
      expect(verifyOtp).not.toHaveBeenCalled();
      expect(createClient).not.toHaveBeenCalled();
      expect(r.status).toBe(303);
      expect(r.headers.get("location")).toBe("/entrar?erro=link_invalido");
    }
  );

  it("sem token_hash é link inválido e nem fala com o login", async () => {
    const r = await postar({ type: "recovery", next: "/nova-senha" });
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/entrar?erro=link_invalido");
  });

  it("não aceita o ramo `code`: só token_hash vale", async () => {
    const r = await postar({
      code: "xyz",
      type: "recovery",
      next: "/nova-senha",
    });
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(r.headers.get("location")).toBe("/entrar?erro=link_invalido");
  });

  it("token recusado pelo login não entrega cookie", async () => {
    verifyOtp.mockResolvedValue({ error: { code: "otp_expired" } });
    const r = await postar({
      token_hash: "abc",
      type: "recovery",
      next: "/nova-senha",
    });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/entrar?erro=link_invalido");
    expect(r.cookies.get("recuperacao_senha")).toBeUndefined();
  });

  it("com sessão já aberta não troca a sessão (fixação de sessão)", async () => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "outra-pessoa" } } });
    const r = await postar({
      token_hash: "abc",
      type: "recovery",
      next: "/nova-senha",
    });
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/entrar?erro=sessao_aberta");
  });

  it.each([
    "https://site-malicioso.com",
    "//site-malicioso.com",
    "/.//site-malicioso.com",
    "/\\x",
    "javascript:alert(1)",
  ])(
    "destino malicioso (%s) cai na raiz, nunca em outro site",
    async (next) => {
      const r = await postar({ token_hash: "abc", type: "recovery", next });
      expect(r.headers.get("location")).toBe("/");
    }
  );
});
