// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// A leitura da cartilha ativa para o editor do admin, com dublê. A RLS da tabela
// (só o admin lê) é testada no banco em tests/mentor/cartilha-uso.test.ts; aqui
// vale o que o código decide: a trava do admin, qual linha vale e a falha
// fechada (erro de leitura NUNCA vira "sem cartilha").

const { exigirAdmin, createClient } = vi.hoisted(() => ({
  exigirAdmin: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirAdmin }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { cartilhaAtiva } from "@/lib/mentor/cartilha";

/** from().select().eq().order().order().limit().maybeSingle() */
function leituraFalsa(resposta: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn(() => Promise.resolve(resposta));
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ order, limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  createClient.mockResolvedValue({ from });
  return { from, select, eq, order, limit };
}

beforeEach(() => {
  vi.clearAllMocks();
  exigirAdmin.mockResolvedValue({ userId: "u", ehAdmin: true });
});

describe("cartilhaAtiva", () => {
  it("recusa quem não é admin sem tocar no banco", async () => {
    exigirAdmin.mockRejectedValue(new Error("REDIRECT:/r/casa-x/hoje"));

    await expect(cartilhaAtiva()).rejects.toThrow("REDIRECT");

    expect(createClient).not.toHaveBeenCalled();
  });

  it("devolve a ativa mais recente (desempate pelo id, como a função do cérebro)", async () => {
    const banco = leituraFalsa({
      data: {
        id: "c1",
        texto: "Seja breve.",
        criada_em: "2026-10-30T14:05:00+00:00",
      },
      error: null,
    });

    expect(await cartilhaAtiva()).toEqual({
      id: "c1",
      texto: "Seja breve.",
      criada_em: "2026-10-30T14:05:00+00:00",
    });
    expect(banco.from).toHaveBeenCalledWith("mentor_cartilhas");
    expect(banco.eq).toHaveBeenCalledWith("ativa", true);
    expect(banco.order).toHaveBeenNthCalledWith(1, "criada_em", {
      ascending: false,
    });
    expect(banco.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(banco.limit).toHaveBeenCalledWith(1);
  });

  it("sem nenhuma cartilha ativa devolve nulo (o editor abre vazio)", async () => {
    leituraFalsa({ data: null, error: null });

    expect(await cartilhaAtiva()).toBeNull();
  });

  it("erro de leitura falha fechado: lança, não devolve 'sem cartilha', e o log leva só o código", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    leituraFalsa({ data: null, error: { message: "segredo interno" } });

    await expect(cartilhaAtiva()).rejects.toThrow("falha_leitura_cartilha");

    expect(JSON.stringify(log.mock.calls)).toContain("falha_admin");
    expect(JSON.stringify(log.mock.calls)).not.toContain("segredo");
    log.mockRestore();
  });
});
