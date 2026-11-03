// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("definição explícita da recepção SCC v2", () => {
  it("restaura a função sem reconstruir SQL pelo catálogo", () => {
    const arquivo =
      "supabase/migrations/20261101130000_webhook_v2_receber_explicito.sql";
    expect(() => readFileSync(arquivo, "utf8")).not.toThrow();
    const sql = readFileSync(arquivo, "utf8");
    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.receber_pagina_scc_v2/i
    );
    expect(sql).not.toMatch(/pg_get_functiondef/i);
  });
});
