// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { atualizarSessao } = vi.hoisted(() => ({ atualizarSessao: vi.fn() }));
vi.mock("@/lib/supabase/proxy", () => ({ atualizarSessao }));

import { proxy } from "@/proxy";

// O Next 16.4 troca 127.0.0.1 por localhost em request.url. Num servidor de
// verdade, o adaptador do Next devolve o redirecionamento do proxy ao navegador
// como RELATIVO (medido num next dev, em 127.0.0.1 e em localhost); aqui, sem
// o adaptador, vemos o endereço absoluto que o proxy entrega a ele.
const ORIGEM = "http://127.0.0.1:3000";
const ORIGEM_DO_PEDIDO = new URL(new NextRequest(ORIGEM).url).origin;

/** O destino do Location, que tem de ser do mesmo site do pedido. */
function destinoDe(resposta: Response): string {
  const alvo = new URL(resposta.headers.get("location") ?? "");
  expect(alvo.origin).toBe(ORIGEM_DO_PEDIDO);
  return `${alvo.pathname}${alvo.search}`;
}

/** Resposta como a do `atualizarSessao`: segue adiante e renova o cookie. */
function respostaComSessaoRenovada() {
  const resposta = NextResponse.next();
  resposta.cookies.set("sb-local-auth-token", "sessao-renovada", {
    path: "/",
    maxAge: 400,
  });
  resposta.headers.set(
    "cache-control",
    "private, no-cache, no-store, max-age=0, must-revalidate"
  );
  resposta.headers.set("expires", "0");
  resposta.headers.set("pragma", "no-cache");
  return resposta;
}

function comUsuario(appMetadata: Record<string, unknown>) {
  return { id: "u1", app_metadata: appMetadata };
}

function pedir(caminho: string) {
  return proxy(new NextRequest(`${ORIGEM}${caminho}`));
}

beforeEach(() => {
  atualizarSessao.mockReset();
});

describe("o porteiro", () => {
  it("arquivo estático segue sem consultar o login", async () => {
    const r = await pedir("/marca/simbolo.svg");
    expect(atualizarSessao).not.toHaveBeenCalled();
    expect(r.status).toBe(200);
    expect(r.headers.get("location")).toBeNull();
  });

  it("sem usuário numa rota protegida: 307 para /entrar?next=, no mesmo site do pedido", async () => {
    atualizarSessao.mockResolvedValue({
      resposta: respostaComSessaoRenovada(),
      usuario: null,
    });
    const r = await pedir("/r/casa-x/hoje?aba=vendas");
    expect(r.status).toBe(307);
    expect(destinoDe(r)).toBe(
      "/entrar?next=%2Fr%2Fcasa-x%2Fhoje%3Faba%3Dvendas"
    );
  });

  it("o Location do proxy é ABSOLUTO: o Next dá erro 500 com relativo vindo do proxy e ele mesmo o entrega relativo ao navegador", async () => {
    atualizarSessao.mockResolvedValue({
      resposta: respostaComSessaoRenovada(),
      usuario: null,
    });
    const r = await pedir("/r/casa-x/hoje");
    // `new URL` sem base lança com endereço relativo: foi o erro "Invalid URL"
    // medido num next dev quando o proxy devolveu `Location: /entrar`.
    expect(() => new URL(r.headers.get("location") ?? "")).not.toThrow();
  });

  it("os cookies renovados e os cabeçalhos de cache seguem no redirecionamento", async () => {
    atualizarSessao.mockResolvedValue({
      resposta: respostaComSessaoRenovada(),
      usuario: null,
    });
    const r = await pedir("/r/casa-x/hoje");
    expect(r.cookies.get("sb-local-auth-token")?.value).toBe("sessao-renovada");
    expect(r.headers.get("cache-control")).toBe(
      "private, no-cache, no-store, max-age=0, must-revalidate"
    );
    expect(r.headers.get("expires")).toBe("0");
    expect(r.headers.get("pragma")).toBe("no-cache");
    // Cabeçalho interno de "seguir adiante" não pode vazar para o redirecionamento.
    expect(r.headers.get("x-middleware-next")).toBeNull();
  });

  it("rota pública sem usuário segue com a resposta do login (cookie renovado incluso)", async () => {
    const resposta = respostaComSessaoRenovada();
    atualizarSessao.mockResolvedValue({ resposta, usuario: null });
    const r = await pedir("/entrar");
    expect(r).toBe(resposta);
    expect(r.headers.get("location")).toBeNull();
  });

  it("troca de senha pendente leva para /trocar-senha", async () => {
    atualizarSessao.mockResolvedValue({
      resposta: respostaComSessaoRenovada(),
      usuario: comUsuario({ precisa_trocar_senha: true }),
    });
    const r = await pedir("/r/casa-x/hoje");
    expect(r.status).toBe(307);
    expect(destinoDe(r)).toBe("/trocar-senha");
    expect(r.cookies.get("sb-local-auth-token")?.value).toBe("sessao-renovada");
  });

  it("a própria tela de trocar a senha segue, mesmo com a troca pendente", async () => {
    const resposta = respostaComSessaoRenovada();
    atualizarSessao.mockResolvedValue({
      resposta,
      usuario: comUsuario({ precisa_trocar_senha: true }),
    });
    expect(await pedir("/trocar-senha")).toBe(resposta);
  });

  it("só o aviso de verdade (true) obriga a trocar: texto 'true' não vale", async () => {
    const resposta = respostaComSessaoRenovada();
    atualizarSessao.mockResolvedValue({
      resposta,
      usuario: comUsuario({ precisa_trocar_senha: "true" }),
    });
    expect(await pedir("/r/casa-x/hoje")).toBe(resposta);
  });
});
