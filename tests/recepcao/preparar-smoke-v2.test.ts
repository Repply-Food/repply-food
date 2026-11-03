// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { hashDoToken, prefixoDoToken } from "../../lib/admin/token";
import { prepararSmokeLocal } from "../../scripts/preparar-smoke-scc-local";

describe("preparador de smoke local", () => {
  it.each([
    "postgres://u:p@exemplo.com:54322/postgres",
    "postgres://u:p@localhost.exemplo.com:54322/postgres",
    "postgres://u:p@localhost/postgres?host=exemplo.com",
    "postgres://u:p@localhost/postgres#fragmento",
    "https://localhost/postgres",
    "",
  ])("recusa URL %s antes de criar cliente", async (url) => {
    const conectar = vi.fn();
    await expect(
      prepararSmokeLocal([], { RF_SMOKE_DATABASE_URL: url }, conectar)
    ).rejects.toThrow(/local|loopback/i);
    expect(conectar).not.toHaveBeenCalled();
  });
  it("recusa token ou qualquer argumento antes de criar cliente", async () => {
    const conectar = vi.fn();
    await expect(
      prepararSmokeLocal(
        ["--token", "segredo"],
        { RF_SMOKE_DATABASE_URL: "postgres://u:p@127.0.0.1:54322/postgres" },
        conectar
      )
    ).rejects.toThrow(/argumento/i);
    expect(conectar).not.toHaveBeenCalled();
  });
  it("cria casa única e token novo atomicamente, sem alterar dados existentes", async () => {
    const query = vi.fn(async (sql: string, _parametros?: string[]) =>
      sql.includes("returning id") || sql.includes("from auth.users")
        ? { rows: [{ id: "casa-nova" }], rowCount: 1 }
        : { rows: [], rowCount: 1 }
    );
    const end = vi.fn(async () => {});
    const conectar = vi.fn(async () => ({ query, end }));
    const resultado = await prepararSmokeLocal(
      [],
      { RF_SMOKE_DATABASE_URL: "postgres://u:p@localhost:54322/postgres" },
      conectar
    );
    expect(conectar).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "127.0.0.1",
        port: 54322,
        database: "postgres",
      })
    );
    const chamadas = query.mock.calls;
    expect(
      chamadas.map(([sql]) => sql.trim().split(/\s+/)[0]?.toLowerCase())
    ).toEqual([
      "begin",
      "select",
      "select",
      "select",
      "insert",
      "insert",
      "insert",
      "commit",
    ]);
    expect(chamadas[4]?.[0]).toMatch(/insert into public\.restaurantes/i);
    expect(chamadas[5]?.[0]).toMatch(/insert into public\.tokens_envio/i);
    expect(chamadas[5]?.[1]).toEqual([
      "casa-nova",
      hashDoToken(resultado.token),
      prefixoDoToken(resultado.token),
    ]);
    expect(resultado.token).toMatch(/^rf_[A-Za-z0-9]{32}$/);
    expect(chamadas[6]?.[0]).toMatch(/insert into public\.acessos/i);
    expect(chamadas[6]?.[1]).toEqual(["casa-nova", "casa-nova"]);
    expect(resultado.slug).toBe("smoke-scc-local");
    expect(resultado.donoVinculado).toBe(true);
    expect(resultado.adminDisponivel).toBe(true);
    expect(end).toHaveBeenCalledOnce();
  });
  it("interrompe sem escrita se a casa dedicada já existir", async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("from public.restaurantes")
        ? [{ id: "existente" }]
        : [],
      rowCount: 1,
    }));
    const end = vi.fn(async () => {});
    await expect(
      prepararSmokeLocal(
        [],
        { RF_SMOKE_DATABASE_URL: "postgres://u:p@localhost/postgres" },
        async () => ({ query, end })
      )
    ).rejects.toThrow(/já existe/i);
    expect(
      query.mock.calls.some(([sql]) => /insert|update|delete/i.test(sql))
    ).toBe(false);
    expect(query.mock.calls.map(([sql]) => sql)).toContain("rollback");
  });
  it("sem contas locais informa ausência sem criar usuário nem vínculo", async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("returning id") ? [{ id: "casa-nova" }] : [],
      rowCount: 1,
    }));
    const resultado = await prepararSmokeLocal(
      [],
      { RF_SMOKE_DATABASE_URL: "postgres://u:p@localhost/postgres" },
      async () => ({ query, end: async () => {} })
    );
    expect(resultado.donoVinculado).toBe(false);
    expect(resultado.adminDisponivel).toBe(false);
    expect(
      query.mock.calls.some(([sql]) =>
        /insert into (?:auth\.users|public\.acessos)/i.test(sql)
      )
    ).toBe(false);
  });
  it("recusa a disputa concorrente pelo slug sem gravar token ou acesso", async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: [],
      rowCount: sql.includes("returning id") ? 0 : 1,
    }));
    await expect(
      prepararSmokeLocal(
        [],
        { RF_SMOKE_DATABASE_URL: "postgres://u:p@localhost/postgres" },
        async () => ({ query, end: async () => {} })
      )
    ).rejects.toThrow(/já existe/i);
    expect(
      query.mock.calls.some(([sql]) =>
        /insert into public\.(tokens_envio|acessos)/i.test(sql)
      )
    ).toBe(false);
  });
  it("reverte e não retorna token em falha de inserção", async () => {
    const query = vi.fn(async (sql: string) => {
      if (/tokens_envio/.test(sql)) throw new Error("segredo do banco");
      return {
        rows: sql.includes("returning id") ? [{ id: "casa-nova" }] : [],
        rowCount: 1,
      };
    });
    const end = vi.fn(async () => {});
    await expect(
      prepararSmokeLocal(
        [],
        { RF_SMOKE_DATABASE_URL: "postgres://u:p@127.0.0.1/postgres" },
        async () => ({ query, end })
      )
    ).rejects.toThrow("Não foi possível preparar");
    expect(query.mock.calls.map(([sql]) => sql)).toContain("rollback");
    expect(end).toHaveBeenCalledOnce();
  });
});
