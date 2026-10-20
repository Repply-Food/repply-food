// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { exigirCasa, createClient } = vi.hoisted(() => ({
  exigirCasa: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import {
  salvarMetaAction,
  salvarTurnosAction,
} from "@/lib/painel/ajustes-actions";

const CASA = "11111111-1111-4111-8111-111111111111";

function dono() {
  exigirCasa.mockResolvedValue({
    casa: { id: CASA },
    modoAdmin: false,
    sessao: {},
  });
}
function admin() {
  exigirCasa.mockResolvedValue({
    casa: { id: CASA },
    modoAdmin: true,
    sessao: {},
  });
}

/** supabase falso com resultados controlados para upsert / delete / rpc. */
function supabaseFalso(r: { upsert?: unknown; del?: unknown; rpc?: unknown }) {
  const selectUpsert = vi.fn(() => Promise.resolve(r.upsert));
  const upsert = vi.fn(() => ({ select: selectUpsert }));
  const eq2 = vi.fn(() => Promise.resolve(r.del));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const del = vi.fn(() => ({ eq: eq1 }));
  const from = vi.fn(() => ({ upsert, delete: del }));
  const rpc = vi.fn(() => Promise.resolve(r.rpc));
  createClient.mockResolvedValue({ from, rpc });
  return { from, upsert, del, eq1, rpc };
}

beforeEach(() => vi.clearAllMocks());

describe("salvarMetaAction", () => {
  it("recusa o admin sem tocar no banco", async () => {
    admin();
    const r = await salvarMetaAction("bar", "2026-10-01", "30000.00");
    expect(r.ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("recusa payload inválido sem tocar no banco", async () => {
    dono();
    const r = await salvarMetaAction("bar", "2026-10-15", "30000.00"); // dia != 01
    expect(r.ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("grava a meta usando o restaurante_id da sessão", async () => {
    dono();
    const m = supabaseFalso({
      upsert: { data: [{ mes: "2026-10-01" }], error: null },
    });
    const r = await salvarMetaAction("bar", "2026-10-01", "30000.00");
    expect(r).toEqual({ ok: true });
    expect(m.from).toHaveBeenCalledWith("metas");
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ restaurante_id: CASA, mes: "2026-10-01" }),
      expect.anything()
    );
  });

  it("upsert com zero linhas vira erro", async () => {
    dono();
    supabaseFalso({ upsert: { data: [], error: null } });
    const r = await salvarMetaAction("bar", "2026-10-01", "30000.00");
    expect(r.ok).toBe(false);
  });

  it("valor vazio apaga a meta pelo restaurante_id da sessão", async () => {
    dono();
    const m = supabaseFalso({ del: { error: null } });
    const r = await salvarMetaAction("bar", "2026-10-01", "");
    expect(r).toEqual({ ok: true });
    expect(m.del).toHaveBeenCalled();
    expect(m.eq1).toHaveBeenCalledWith("restaurante_id", CASA);
  });
});

describe("salvarTurnosAction", () => {
  it("recusa o admin", async () => {
    admin();
    const r = await salvarTurnosAction("bar", "17:00");
    expect(r.ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("chama atualizar_turnos com o restaurante_id da sessão", async () => {
    dono();
    const m = supabaseFalso({ rpc: { error: null } });
    const r = await salvarTurnosAction("bar", "17:00");
    expect(r).toEqual({ ok: true });
    expect(m.rpc).toHaveBeenCalledWith("atualizar_turnos", {
      p_restaurante_id: CASA,
      p_turnos: { almoco_ate: "17:00" },
    });
  });

  it("erro da RPC vira frase genérica sem vazar a mensagem", async () => {
    dono();
    supabaseFalso({ rpc: { error: { message: "segredo interno" } } });
    const r = await salvarTurnosAction("bar", "17:00");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toContain("segredo");
  });
});
