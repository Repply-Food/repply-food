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

import { cartilhaAtiva, historicoCartilhas } from "@/lib/mentor/cartilha";

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

    expect(JSON.stringify(log.mock.calls)).toContain("falha_leitura_cartilha");
    expect(JSON.stringify(log.mock.calls)).not.toContain("falha_admin");
    expect(JSON.stringify(log.mock.calls)).not.toContain("segredo");
    log.mockRestore();
  });
});

/** from().select().order().order().limit() */
function historicoFalso(resposta: { data: unknown; error: unknown }) {
  const limit = vi.fn(() => Promise.resolve(resposta));
  const order = vi.fn(() => ({ order, limit }));
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  createClient.mockResolvedValue({ from });
  return { from, select, order, limit };
}

describe("historicoCartilhas", () => {
  it("recusa quem não é admin sem tocar no banco", async () => {
    exigirAdmin.mockRejectedValue(new Error("REDIRECT:/r/casa-x/hoje"));

    await expect(historicoCartilhas()).rejects.toThrow("REDIRECT");

    expect(createClient).not.toHaveBeenCalled();
  });

  it("devolve as versões da mais nova para a mais antiga (desempate pelo id), com teto, e marca qual é a ativa", async () => {
    const linhas = [
      {
        id: "c3",
        texto: "Terceira.",
        criada_em: "2026-11-02T10:00:00+00:00",
        ativa: true,
      },
      {
        id: "c2",
        texto: "Segunda.",
        criada_em: "2026-10-31T10:00:00+00:00",
        ativa: false,
      },
      {
        id: "c1",
        texto: "Primeira.",
        criada_em: "2026-10-30T10:00:00+00:00",
        ativa: false,
      },
    ];
    const banco = historicoFalso({ data: linhas, error: null });

    expect(await historicoCartilhas()).toEqual(linhas);

    expect(banco.from).toHaveBeenCalledWith("mentor_cartilhas");
    expect(banco.select).toHaveBeenCalledWith("id, texto, criada_em, ativa");
    expect(banco.order).toHaveBeenNthCalledWith(1, "criada_em", {
      ascending: false,
    });
    expect(banco.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(banco.limit).toHaveBeenCalledWith(20);
  });

  it("sem nenhuma versão devolve lista vazia (a tela não mostra o histórico)", async () => {
    historicoFalso({ data: [], error: null });

    expect(await historicoCartilhas()).toEqual([]);
  });

  it("erro de leitura falha fechado: lança, não devolve lista vazia, e o log leva só o código", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    historicoFalso({ data: null, error: { message: "segredo interno" } });

    await expect(historicoCartilhas()).rejects.toThrow(
      "falha_leitura_cartilha"
    );

    expect(JSON.stringify(log.mock.calls)).toContain("falha_leitura_cartilha");
    expect(JSON.stringify(log.mock.calls)).not.toContain("falha_admin");
    expect(JSON.stringify(log.mock.calls)).not.toContain("segredo");
    log.mockRestore();
  });
});
