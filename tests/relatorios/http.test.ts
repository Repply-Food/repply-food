// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { autenticarToken } from "../../supabase/functions/_shared/relatorios/autenticacao";
import {
  criarHandlerRelatorios,
  lerJsonLimitado,
} from "../../supabase/functions/_shared/relatorios/http";
import { paginaProdutos } from "./fixtures";

function pedido(corpo: unknown = paginaProdutos()) {
  return new Request("http://localhost/receber-relatorios", {
    method: "POST",
    headers: { authorization: "Bearer segredo-ficticio" },
    body: JSON.stringify(corpo),
  });
}
function dependencias() {
  return {
    autenticar: vi.fn(async () => "casa-do-token" as string | null),
    executarRpc: vi.fn(
      async (_nome: string, _parametros: Record<string, unknown>) => ({
        data: { ok: true, estado: "recebendo", repetida: false },
        error: null as { code: string; message?: string } | null,
      })
    ),
    permitirSimulacao: false,
  };
}
describe("leitura limitada", () => {
  it("aceita JSON no limite em bytes e UTF-8 dividido entre chunks", async () => {
    const bytes = new TextEncoder().encode('{"nome":"ação"}');
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 11));
        c.enqueue(bytes.slice(11));
        c.close();
      },
    });
    const req = new Request("http://localhost", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    await expect(lerJsonLimitado(req, bytes.length)).resolves.toEqual({
      nome: "ação",
    });
  });
  it("cancela no segundo chunk sem ler o resto, ignorando Content-Length falso", async () => {
    let lidos = 0;
    const cancelar = vi.fn();
    const body = new ReadableStream<Uint8Array>(
      {
        pull(c) {
          lidos++;
          c.enqueue(new Uint8Array(4));
        },
        cancel: cancelar,
      },
      { highWaterMark: 0 }
    );
    const req = new Request("http://localhost", {
      method: "POST",
      body,
      headers: { "content-length": "1" },
      duplex: "half",
    } as RequestInit);
    await expect(lerJsonLimitado(req, 6)).rejects.toMatchObject({
      status: 413,
      message: "envio grande demais",
    });
    expect(lidos).toBe(2);
    expect(cancelar).toHaveBeenCalledOnce();
  });
  it.each(["{segredo", "", '"texto'])(
    "JSON inválido gera erro curto",
    async (body) => {
      await expect(
        lerJsonLimitado(
          new Request("http://localhost", { method: "POST", body }),
          100
        )
      ).rejects.toMatchObject({ status: 400, message: "json inválido" });
    }
  );
});
describe("autenticação", () => {
  it("consulta somente o SHA256 do Bearer e devolve a casa do token", async () => {
    const buscar = vi.fn(async () => ({
      restaurante_id: "casa",
      revogado_em: null,
      expira_em: null,
    }));
    expect(await autenticarToken(pedido(), buscar)).toBe("casa");
    expect(buscar).toHaveBeenCalledWith(
      await crypto.subtle
        .digest("SHA-256", new TextEncoder().encode("segredo-ficticio"))
        .then((b) =>
          Array.from(new Uint8Array(b), (n) =>
            n.toString(16).padStart(2, "0")
          ).join("")
        )
    );
  });
  it("recusa ausente, revogado, expirado e inexistente", async () => {
    const buscar = vi.fn(async () => null);
    expect(
      await autenticarToken(new Request("http://localhost"), buscar)
    ).toBeNull();
    expect(buscar).not.toHaveBeenCalled();
    for (const linha of [
      null,
      { restaurante_id: "casa", revogado_em: "2026-01-01", expira_em: null },
      {
        restaurante_id: "casa",
        revogado_em: null,
        expira_em: "2000-01-01T00:00:00Z",
      },
    ]) {
      expect(await autenticarToken(pedido(), async () => linha)).toBeNull();
    }
  });
});
describe("handler unitário (sem HTTP real)", () => {
  it("limites estruturais respondem 413 sem RPC", async () => {
    const deps = dependencias();
    const pagina = paginaProdutos();
    for (const corpo of [
      {
        ...pagina,
        linhas: Array.from({ length: 501 }, () => pagina.linhas[0]),
      },
      { ...pagina, manifesto: { ...pagina.manifesto, total_paginas: 201 } },
      { ...pagina, manifesto: { ...pagina.manifesto, total_linhas: 100001 } },
    ])
      expect((await criarHandlerRelatorios(deps)(pedido(corpo))).status).toBe(
        413
      );
    expect(deps.executarRpc).not.toHaveBeenCalled();
  });
  it("limite de cargas abertas retorna 429 pelo código técnico conhecido", async () => {
    const deps = dependencias();
    deps.permitirSimulacao = true;
    deps.executarRpc.mockResolvedValue({
      data: null as never,
      error: { code: "PR413", message: "limite_cargas_abertas" },
    });
    expect((await criarHandlerRelatorios(deps)(pedido())).status).toBe(429);
  });
  it("erro de schema informa só nomes de campos, sem valores", async () => {
    const deps = dependencias();
    const pagina = paginaProdutos();
    const resposta = await criarHandlerRelatorios(deps)(
      pedido({
        ...pagina,
        linhas: [{ ...pagina.linhas[0], NomeCliente: "Pessoa fictícia" }],
      })
    );
    expect(resposta.status).toBe(422);
    const erro = await resposta.json();
    expect(erro.campos).toContain("NomeCliente");
    expect(JSON.stringify(erro)).not.toContain("Pessoa fictícia");
    expect(deps.executarRpc).not.toHaveBeenCalled();
  });
  it("GET é 405 e corpo grande é 413 antes de autenticar", async () => {
    const deps = dependencias();
    const handler = criarHandlerRelatorios(deps);
    expect((await handler(new Request("http://localhost"))).status).toBe(405);
    expect((await handler(pedido("x".repeat(1048576)))).status).toBe(413);
    expect(deps.autenticar).not.toHaveBeenCalled();
  });
  it("token errado é 401, sem RPC", async () => {
    const deps = dependencias();
    deps.autenticar.mockResolvedValue(null);
    expect((await criarHandlerRelatorios(deps)(pedido())).status).toBe(401);
    expect(deps.executarRpc).not.toHaveBeenCalled();
  });
  it("schema estrito e simulação não liberada impedem RPC", async () => {
    const deps = dependencias();
    const handler = criarHandlerRelatorios(deps);
    for (const body of [
      paginaProdutos(),
      { ...paginaProdutos(), restaurante_id: "outra-casa" },
      {
        ...paginaProdutos(),
        linhas: [
          { ...paginaProdutos().linhas[0], NomeCliente: "Pessoa fictícia" },
        ],
      },
    ]) {
      expect((await handler(pedido(body))).status).toBe(422);
    }
    expect(deps.executarRpc).not.toHaveBeenCalled();
  });
  it("recebe e repete página com a casa do token, sem limitador v1", async () => {
    const deps = dependencias();
    deps.permitirSimulacao = true;
    const handler = criarHandlerRelatorios(deps);
    for (let n = 0; n < 2; n++)
      expect((await handler(pedido())).status).toBe(200);
    expect(deps.executarRpc).toHaveBeenCalledWith("receber_pagina_relatorio", {
      p_restaurante_id: "casa-do-token",
      p_pedido: paginaProdutos(),
    });
  });
  it("aceita SCC sem liberar simulação e publica por ID na mesma casa", async () => {
    const deps = dependencias();
    const handler = criarHandlerRelatorios(deps);
    const pagina = paginaProdutos();
    expect(
      (
        await handler(
          pedido({
            ...pagina,
            manifesto: { ...pagina.manifesto, natureza: "scc" },
          })
        )
      ).status
    ).toBe(200);
    expect(
      (
        await handler(
          pedido({ acao: "publicar", carga_id: pagina.manifesto.carga_id })
        )
      ).status
    ).toBe(200);
    expect(deps.executarRpc).toHaveBeenLastCalledWith("publicar_relatorio", {
      p_restaurante_id: "casa-do-token",
      p_carga_id: pagina.manifesto.carga_id,
    });
  });
  it.each([
    ["PR409", 409],
    ["PR422", 422],
    ["PR413", 413],
    ["22023", 422],
    ["XX000", 500],
  ])("traduz %s sem expor SQL ou valores", async (code, status) => {
    const deps = dependencias();
    deps.permitirSimulacao = true;
    deps.executarRpc.mockResolvedValue({
      data: null as never,
      error: { code, message: "SQL segredo-ficticio Pessoa" },
    });
    const response = await criarHandlerRelatorios(deps)(pedido());
    expect(response.status).toBe(status);
    expect(await response.text()).not.toMatch(/SQL|segredo|Pessoa/);
  });
  it("exceção inesperada não vaza valores", async () => {
    const deps = dependencias();
    deps.autenticar.mockRejectedValue(new Error("segredo"));
    const response = await criarHandlerRelatorios(deps)(pedido());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("segredo");
  });
});
