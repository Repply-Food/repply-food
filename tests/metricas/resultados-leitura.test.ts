// @vitest-environment node
import { createClient as criarCliente } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    criarCliente<Database>(URL_LOCAL, chaveLocal("service_role"), {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
}));

import { obterResultados } from "@/lib/metricas/resultados";
import type { FiltrosResultados } from "@/lib/metricas/resultados/filtros";

const restauranteId = "00000000-0000-0000-0000-000000000000";
const filtros: FiltrosResultados = {
  aba: "vendas",
  comparacao: "anterior",
  atalho: "7d",
  inicio: "2026-10-01",
  fim: "2026-10-07",
  quantidadeDias: 7,
  rotuloPeriodo: "1 de outubro a 7 de outubro de 2026",
  query: new URLSearchParams(),
};

describe("obterResultados", () => {
  it("falha ao faltar a linha agregada", async () => {
    await expect(obterResultados(restauranteId, filtros)).rejects.toThrow(
      "falha_leitura_resultados"
    );
  });
});
