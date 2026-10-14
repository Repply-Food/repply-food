// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, exchangeCodeForSession, verifyOtp, createClient } = vi.hoisted(
  () => {
    const getUser = vi.fn();
    const exchangeCodeForSession = vi.fn();
    const verifyOtp = vi.fn();
    return {
      getUser,
      exchangeCodeForSession,
      verifyOtp,
      createClient: vi.fn(async () => ({
        auth: { getUser, exchangeCodeForSession, verifyOtp },
      })),
    };
  }
);

vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { GET } from "@/app/auth/confirmar/route";

const ORIGEM = "http://127.0.0.1:3000";

function pedir(consulta: string) {
  return GET(new NextRequest(`${ORIGEM}/auth/confirmar?${consulta}`));
}

beforeEach(() => {
  createClient.mockClear();
  getUser.mockReset();
  exchangeCodeForSession.mockReset();
  verifyOtp.mockReset();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "segredo-de-teste");
  exchangeCodeForSession.mockResolvedValue({ error: null });
  verifyOtp.mockResolvedValue({ error: null });
  // 1ª chamada: ninguém logado; 2ª (depois do link): o usuário do link.
  getUser
    .mockResolvedValueOnce({ data: { user: null } })
    .mockResolvedValue({ data: { user: { id: "u1" } } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("volta do link do e-mail", () => {
  it("sem código nem token, o link é inválido e nem fala com o login", async () => {
    const r = await pedir("next=/nova-senha");
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("/entrar?erro=link_invalido");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("link de recuperação válido abre a sessão e entrega o cookie assinado só para /nova-senha", async () => {
    const r = await pedir("token_hash=abc&type=recovery&next=/nova-senha");
    expect(verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "abc",
    });
    expect(r.status).toBe(307);
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

  it("o redirecionamento é relativo: fica no mesmo endereço (127.0.0.1 ou localhost)", async () => {
    const r = await pedir("code=xyz&next=/r/casa/hoje");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("xyz");
    expect(r.headers.get("location")).toBe("/r/casa/hoje");
    expect(r.cookies.get("recuperacao_senha")).toBeUndefined();
  });

  it("tipo de link desconhecido é recusado", async () => {
    const r = await pedir("token_hash=abc&type=qualquer&next=/nova-senha");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(r.headers.get("location")).toBe("/entrar?erro=link_invalido");
  });

  it("token recusado pelo login não entrega cookie nenhum", async () => {
    verifyOtp.mockResolvedValue({ error: { code: "otp_expired" } });
    const r = await pedir("token_hash=abc&type=recovery&next=/nova-senha");
    expect(r.headers.get("location")).toBe("/entrar?erro=link_invalido");
    expect(r.cookies.get("recuperacao_senha")).toBeUndefined();
  });

  it("com sessão já aberta, o link não troca a sessão (fixação de sessão)", async () => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "outra-pessoa" } } });
    const r = await pedir("token_hash=abc&type=recovery&next=/nova-senha");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(r.headers.get("location")).toBe("/entrar?erro=sessao_aberta");
  });

  it.each([
    "https://site-malicioso.com",
    "//site-malicioso.com",
    "/.//site-malicioso.com",
    "/\\site-malicioso.com",
    "javascript:alert(1)",
  ])(
    "destino malicioso (%s) cai na raiz, nunca em outro site",
    async (next) => {
      const r = await pedir(
        `token_hash=abc&type=recovery&next=${encodeURIComponent(next)}`
      );
      expect(r.headers.get("location")).toBe("/");
    }
  );
});
