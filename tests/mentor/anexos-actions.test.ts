// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// A ação de baixar anexo do mentor: a mesma fronteira de segurança da tela de
// envio — o restaurante sai da SESSÃO (`exigirCasa`), nunca do argumento; o
// admin em modo leitura não baixa pelo caminho do dono (D-38); a casa sem o
// módulo não alcança; e o link assinado (120 s) só sai pela chave de serviço
// (`urlParaBaixar`), nunca como caminho público do cofre.

const { exigirCasa, urlParaBaixar } = vi.hoisted(() => ({
  exigirCasa: vi.fn(),
  urlParaBaixar: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/mentor/anexos", () => ({ urlParaBaixar }));

import { baixarAnexo } from "@/lib/mentor/anexos-actions";

const CASA = "11111111-1111-4111-8111-111111111111";
const ANEXO = "22222222-2222-4222-8222-222222222222";

function dono(comModulo = true) {
  exigirCasa.mockResolvedValue({
    casa: { id: CASA, modulos: comModulo ? ["mentor"] : [] },
    modoAdmin: false,
    sessao: {},
  });
}

function admin() {
  exigirCasa.mockResolvedValue({
    casa: { id: CASA, modulos: ["mentor"] },
    modoAdmin: true,
    sessao: {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  urlParaBaixar.mockResolvedValue("https://cofre.local/assinada");
});

describe("baixarAnexo", () => {
  it("o dono baixa o anexo da casa da sessão por um link assinado", async () => {
    dono();

    const r = await baixarAnexo("bar-do-ze", ANEXO);

    expect(r).toEqual({ ok: true, url: "https://cofre.local/assinada" });
    expect(exigirCasa).toHaveBeenCalledWith("bar-do-ze");
    expect(urlParaBaixar).toHaveBeenCalledWith(CASA, ANEXO);
  });

  it("o admin em modo leitura não baixa pelo caminho do dono", async () => {
    admin();

    const r = await baixarAnexo("bar-do-ze", ANEXO);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/modo leitura do admin/i);
      expect(r.error).toMatch(/baixar/i);
    }
    expect(urlParaBaixar).not.toHaveBeenCalled();
  });

  it("a casa sem o módulo do mentor não alcança o anexo", async () => {
    dono(false);

    const r = await baixarAnexo("bar-do-ze", ANEXO);

    expect(r).toEqual({
      ok: false,
      error: "o mentor não está disponível nesta casa",
    });
    expect(urlParaBaixar).not.toHaveBeenCalled();
  });

  it("id que não é uuid vira frase do produto, sem tocar no cofre", async () => {
    dono();

    const r = await baixarAnexo("bar-do-ze", "nao-eh-uuid");

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/não encontrei esse anexo/i);
    expect(urlParaBaixar).not.toHaveBeenCalled();
  });

  it("anexo de outra casa (ou que não existe) vira frase, sem vazar o caminho", async () => {
    dono();
    urlParaBaixar.mockResolvedValue(null);

    const r = await baixarAnexo("bar-do-ze", ANEXO);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/não encontrei esse anexo/i);
      expect(r.error).not.toContain("mentor-anexos");
    }
  });
});
