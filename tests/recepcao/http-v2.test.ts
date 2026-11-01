import { describe, expect, it } from "vitest";
import { autenticarToken } from "../../supabase/functions/_shared/scc/autenticacao";
import {
  criarHandlerSccV2,
  lerJsonLimitado,
} from "../../supabase/functions/_shared/scc/http";
import { fixtures } from "./fixtures-v2";

const req = (body: unknown) =>
  new Request("http://local", { method: "POST", body: JSON.stringify(body) });
const ok = { data: { ok: true }, error: null };
const deps = () => ({
  autenticar: async (_req: Request): Promise<string | null> => "casa",
  consumirLimite: async (_casa: string) => ok,
  receberPagina: async (_casa: string, _pedido: unknown) => ok,
  permitirSimulacao: false,
});

describe("HTTP v2", () => {
  it("autentica por hash e rejeita revogado ou expirado", async () => {
    const r = new Request("http://local", {
      headers: { authorization: "Bearer segredo" },
    });
    let hash = "";
    const buscar = async (h: string) => {
      hash = h;
      return { restaurante_id: "casa", revogado_em: null, expira_em: null };
    };
    expect(await autenticarToken(r, buscar)).toBe("casa");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await autenticarToken(r, async () => ({
        restaurante_id: "casa",
        revogado_em: "2026-01-01",
        expira_em: null,
      }))
    ).toBeNull();
    expect(
      await autenticarToken(
        r,
        async () => ({
          restaurante_id: "casa",
          revogado_em: null,
          expira_em: "2026-01-01",
        }),
        "2026-01-02"
      )
    ).toBeNull();
  });
  it("rejeita método e token antes de ler stream", async () => {
    const d = deps();
    d.autenticar = async () => null;
    const handler = criarHandlerSccV2(d);
    const stream = new ReadableStream(
      {
        pull() {
          throw new Error("leitura indevida");
        },
      },
      { highWaterMark: 0 }
    );
    const r = new Request("http://local", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect((await handler(r)).status).toBe(401);
    expect(r.bodyUsed).toBe(false);
    expect((await handler(new Request("http://local"))).status).toBe(405);
  });
  it("decodifica UTF-8 dividido e ignora Content-Length falso", async () => {
    const bytes = new TextEncoder().encode('{"nome":"Água"}');
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(bytes.slice(0, 10));
        c.enqueue(bytes.slice(10));
        c.close();
      },
    });
    const r = new Request("http://local", {
      method: "POST",
      headers: { "content-length": "1" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(await lerJsonLimitado(r, 100)).toEqual({ nome: "Água" });
  });
  it("cancela stream acima de 1 MiB mesmo com Content-Length falso", async () => {
    let cancelado = false;
    const stream = new ReadableStream({
      pull(c) {
        c.enqueue(new Uint8Array(1048577));
      },
      cancel() {
        cancelado = true;
      },
    });
    const r = new Request("http://local", {
      method: "POST",
      headers: { "content-length": "1" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect((await criarHandlerSccV2(deps())(r)).status).toBe(413);
    expect(cancelado).toBe(true);
  });
  it("rejeita JSON inválido", async () => {
    expect(
      (
        await criarHandlerSccV2(deps())(
          new Request("http://local", { method: "POST", body: "{" })
        )
      ).status
    ).toBe(400);
  });
  it("limita antes de validar e envia somente dados sanitizados da casa autenticada", async () => {
    const ordem: string[] = [];
    const d = deps();
    d.autenticar = async () => {
      ordem.push("auth");
      return "casa";
    };
    d.consumirLimite = async (casa) => {
      ordem.push(`limite:${casa}`);
      return ok;
    };
    d.receberPagina = async (casa, pedido) => {
      ordem.push(`pagina:${casa}`);
      expect(JSON.stringify(pedido)).not.toContain("NomeCliente");
      return ok;
    };
    const entrada = {
      ...fixtures[0],
      dados: [{ ...fixtures[0].dados[0], NomeCliente: "segredo" }],
    };
    expect((await criarHandlerSccV2(d)(req(entrada))).status).toBe(200);
    expect(ordem).toEqual(["auth", "limite:casa", "pagina:casa"]);
  });
  it("bloqueia simulação somente quando desabilitada, sem receber página", async () => {
    const d = deps();
    let chamadas = 0;
    d.receberPagina = async () => {
      chamadas++;
      return ok;
    };
    const handler = criarHandlerSccV2(d);
    expect(
      (await handler(req({ ...fixtures[0], natureza: "simulacao" }))).status
    ).toBe(422);
    expect(chamadas).toBe(0);
    expect((await handler(req(fixtures[0]))).status).toBe(200);
    d.permitirSimulacao = true;
    expect(
      (await handler(req({ ...fixtures[0], natureza: "simulacao" }))).status
    ).toBe(200);
  });
  it.each([
    ["PR409", 409],
    ["PR413", 413],
    ["PR422", 422],
    ["22023", 422],
    ["PR429", 429],
    ["outro", 500],
  ] as const)("traduz %s sem expor detalhes", async (code, status) => {
    const d = deps();
    d.receberPagina = async () =>
      ({ data: null, error: { code, message: "segredo SQL" } }) as never;
    const r = await criarHandlerSccV2(d)(req(fixtures[0]));
    expect(r.status).toBe(status);
    expect(await r.text()).not.toContain("segredo");
  });
  it("não expõe chaves arbitrárias nem valores na resposta de schema", async () => {
    const extras = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`segredo${i}`, "valor_privado"])
    );
    const r = await criarHandlerSccV2(deps())(
      req({ ...fixtures[0], ...extras })
    );
    expect(r.status).toBe(422);
    const corpo = await r.json();
    expect(corpo.campos.length).toBeLessThanOrEqual(20);
    expect(JSON.stringify(corpo)).not.toMatch(/segredo|valor_privado/);
  });
  it("recusa quota antes de ler o corpo", async () => {
    const d = deps();
    d.consumirLimite = async () =>
      ({ data: null, error: { code: "PR429", message: "segredo" } }) as never;
    const r = req(fixtures[0]);
    const resposta = await criarHandlerSccV2(d)(r);
    expect(resposta.status).toBe(429);
    expect(r.bodyUsed).toBe(false);
    expect(await resposta.text()).not.toContain("segredo");
  });
  it("reconhece o identificador fixo de cargas abertas sem revelar mensagens", async () => {
    const d = deps();
    d.receberPagina = async () =>
      ({
        data: null,
        error: { code: "PR413", message: "limite_cargas_abertas" },
      }) as never;
    const resposta = await criarHandlerSccV2(d)(req(fixtures[0]));
    expect(resposta.status).toBe(429);
    expect(await resposta.text()).not.toContain("limite_cargas_abertas");
  });
});
