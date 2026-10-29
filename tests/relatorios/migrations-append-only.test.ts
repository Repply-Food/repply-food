import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationAnterior = join(
  process.cwd(),
  "supabase/migrations/20261028134000_relatorios_caixa_auditoria.sql"
);
const migrationSeguinte = join(
  process.cwd(),
  "supabase/migrations/20261028135000_relatorios_limites_civis_caixa.sql"
);

describe("migrations append-only de Caixa e Auditoria", () => {
  it("preserva integralmente a migration já commitada antes do ajuste", () => {
    const hash = createHash("sha256")
      .update(readFileSync(migrationAnterior))
      .digest("hex");
    expect(hash).toBe(
      "055c12fae96515315d44731468aef28eff1bfc60d0670b73e56d6cd74698d0ab"
    );
  });

  it("aplica os limites novos por uma migration posterior", () => {
    const sql = readFileSync(migrationSeguinte, "utf8");
    expect(sql).toContain(
      "create or replace function public.validar_linha_relatorio"
    );
    expect(sql).toContain(
      "substring(texto from 1 for 4)::int not between 2 and 9998"
    );
    expect(sql).toContain(
      "create or replace function relatorios_privados.caixa"
    );
    expect(sql).toContain(
      "create function relatorios_privados.dia_civil_caixa"
    );
    expect(sql).toContain("dia_movimento");
    expect(sql).toContain(
      "extract(year from resultado) not between 1 and 9999"
    );
  });
});
