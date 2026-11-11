// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// As ações de sessão do mentor (renomear, arquivar, excluir, apagar de
// verdade), com dublês no guarda (`exigirCasa`/`exigirAdmin`) e nos clientes do
// banco — padrão de tests/mentor/enviar-action.test.ts. A prova é a mesma da
// fronteira de segurança: o restaurante sai da SESSÃO, nunca do argumento; o
// admin em modo leitura não organiza pelo caminho do dono; o dono não alcança
// o apagar-de-verdade; e zero linhas afetadas nunca é sucesso.

const {
  exigirCasa,
  exigirAdmin,
  createClient,
  createServiceClient,
  revalidatePath,
  logError,
} = vi.hoisted(() => ({
  exigirCasa: vi.fn(),
  exigirAdmin: vi.fn(),
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  revalidatePath: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa, exigirAdmin }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient }));
vi.mock("@/lib/logger", () => ({ logError }));

import {
  apagarConversaDeVerdade,
  arquivarConversa,
  excluirConversa,
  renomearConversa,
} from "@/lib/mentor/sessoes-actions";

const CASA = "11111111-1111-4111-8111-111111111111";
const CONVERSA = "22222222-2222-4222-8222-222222222222";
const SLUG = "bar-do-ze";

const FRASE_CONVERSA = "não encontrei essa conversa; comece uma nova";
const FRASE_ADMIN =
  "no modo leitura do admin não dá para organizar as conversas";
const FRASE_TITULO_VAZIO = "escreva um título para a conversa";
const FRASE_TITULO_LONGO = "o título ficou longo demais; use até 60 letras";
const FALHA_ORGANIZAR =
  "não foi possível organizar as conversas agora. Tente de novo em instantes.";
const FALHA_APAGAR =
  "não foi possível apagar a conversa agora. Tente de novo em instantes.";
const FRASE_SOMENTE_EXCLUIDA =
  "só dá para apagar de verdade a conversa que o dono já excluiu";

type Resposta = { data: unknown; error: unknown };

/**
 * Cliente do banco falso. O encadeamento reproduz o que as ações fazem:
 *   from("mentor_conversas").update(...).eq(...).eq(...).is(...).select("id")
 *   from("mentor_conversas").select(...).eq(...).eq(...).maybeSingle()
 *   from("mentor_conversas").delete().eq(...).select("id")
 * A consulta é "thenable" como a do supabase-js: o `await` do último
 * `.select("id")` resolve a `escrita`; o `.maybeSingle()` resolve a `leitura`.
 */
function bancoFalso(args: { leitura?: Resposta; escrita?: Resposta } = {}) {
  const leitura = args.leitura ?? { data: null, error: null };
  const escrita = args.escrita ?? { data: null, error: null };
  const consulta: Record<string, ReturnType<typeof vi.fn>> = {};
  consulta.select = vi.fn(() => consulta);
  consulta.eq = vi.fn(() => consulta);
  consulta.is = vi.fn(() => consulta);
  consulta.not = vi.fn(() => consulta);
  consulta.update = vi.fn(() => consulta);
  consulta.delete = vi.fn(() => consulta);
  consulta.maybeSingle = vi.fn(() => Promise.resolve(leitura));
  // biome-ignore lint/suspicious/noThenProperty: a consulta falsa é "thenable" de propósito, como a do supabase-js — o `await` do último `.select("id")` resolve a escrita.
  (consulta as Record<string, unknown>).then = (
    ok: (v: Resposta) => unknown,
    nok: (e: unknown) => unknown
  ) => Promise.resolve(escrita).then(ok, nok);
  const from = vi.fn(() => consulta);
  return { from, consulta };
}

function dono() {
  exigirCasa.mockResolvedValue({
    casa: { id: CASA, slug: SLUG, modulos: ["mentor"] },
    modoAdmin: false,
    sessao: {},
  });
}

function adminEmLeitura() {
  exigirCasa.mockResolvedValue({
    casa: { id: CASA, slug: SLUG, modulos: ["mentor"] },
    modoAdmin: true,
    sessao: {},
  });
}

function admin() {
  exigirAdmin.mockResolvedValue({ userId: "admin", ehAdmin: true });
}

beforeEach(() => vi.clearAllMocks());

describe("renomearConversa", () => {
  it("renomeia a conversa da casa da sessão e atualiza a tela", async () => {
    dono();
    const banco = bancoFalso({
      escrita: { data: [{ id: CONVERSA }], error: null },
    });
    createClient.mockResolvedValue({ from: banco.from });

    const r = await renomearConversa(
      SLUG,
      CONVERSA,
      "  Ideias para o cardápio  "
    );

    expect(r).toEqual({ ok: true });
    expect(exigirCasa).toHaveBeenCalledWith(SLUG);
    expect(banco.from).toHaveBeenCalledWith("mentor_conversas");
    // O título vai aparado; a conversa é presa pelo id E pela casa da sessão.
    expect(banco.consulta.update).toHaveBeenCalledWith({
      titulo: "Ideias para o cardápio",
    });
    expect(banco.consulta.eq).toHaveBeenCalledWith("id", CONVERSA);
    expect(banco.consulta.eq).toHaveBeenCalledWith("restaurante_id", CASA);
    // Excluída some da vista do dono: renomear não a traz de volta.
    expect(banco.consulta.is).toHaveBeenCalledWith("excluida_em", null);
    expect(revalidatePath).toHaveBeenCalledWith(`/r/${SLUG}/mentor`);
  });

  it("conversa de outra casa (zero linhas) vira frase de produto", async () => {
    dono();
    const banco = bancoFalso({ escrita: { data: [], error: null } });
    createClient.mockResolvedValue({ from: banco.from });

    const r = await renomearConversa(SLUG, CONVERSA, "Novo título");

    expect(r).toEqual({ ok: false, error: FRASE_CONVERSA });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("admin em modo leitura não renomeia pelo caminho do dono", async () => {
    adminEmLeitura();
    const banco = bancoFalso();
    createClient.mockResolvedValue({ from: banco.from });

    const r = await renomearConversa(SLUG, CONVERSA, "Novo título");

    expect(r).toEqual({ ok: false, error: FRASE_ADMIN });
    expect(createClient).not.toHaveBeenCalled();
    expect(banco.from).not.toHaveBeenCalled();
  });

  it.each([
    ["vazio", ""],
    ["só espaços", "   \n  "],
    ["que não é texto (chamada forjada)", undefined as unknown as string],
  ])(
    "título %s vira frase de produto, sem tocar no banco",
    async (_, titulo) => {
      dono();
      const banco = bancoFalso();
      createClient.mockResolvedValue({ from: banco.from });

      const r = await renomearConversa(SLUG, CONVERSA, titulo);

      expect(r).toEqual({ ok: false, error: FRASE_TITULO_VAZIO });
      expect(createClient).not.toHaveBeenCalled();
      expect(banco.from).not.toHaveBeenCalled();
    }
  );

  it("título maior que 60 letras vira frase de produto, sem tocar no banco", async () => {
    dono();
    const banco = bancoFalso();
    createClient.mockResolvedValue({ from: banco.from });

    const r = await renomearConversa(SLUG, CONVERSA, "a".repeat(61));

    expect(r).toEqual({ ok: false, error: FRASE_TITULO_LONGO });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("aceita exatamente 60 letras", async () => {
    dono();
    const banco = bancoFalso({
      escrita: { data: [{ id: CONVERSA }], error: null },
    });
    createClient.mockResolvedValue({ from: banco.from });

    const r = await renomearConversa(SLUG, CONVERSA, "a".repeat(60));

    expect(r).toEqual({ ok: true });
    expect(banco.consulta.update).toHaveBeenCalledWith({
      titulo: "a".repeat(60),
    });
  });

  it("id que não é uuid vira frase de produto, sem tocar no banco", async () => {
    dono();
    const banco = bancoFalso();
    createClient.mockResolvedValue({ from: banco.from });

    const r = await renomearConversa(SLUG, "nao-e-um-uuid", "Novo título");

    expect(r).toEqual({ ok: false, error: FRASE_CONVERSA });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("erro do banco vira frase genérica e o log leva só o código", async () => {
    dono();
    const banco = bancoFalso({
      escrita: {
        data: null,
        error: { code: "XX000", message: "segredo interno do Postgres" },
      },
    });
    createClient.mockResolvedValue({ from: banco.from });

    const r = await renomearConversa(SLUG, CONVERSA, "Novo título");

    expect(r).toEqual({ ok: false, error: FALHA_ORGANIZAR });
    expect(logError).toHaveBeenCalledWith("falha_sessoes_mentor");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("segredo");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("arquivarConversa", () => {
  it("arquiva a conversa da casa da sessão e atualiza a tela", async () => {
    dono();
    const banco = bancoFalso({
      escrita: { data: [{ id: CONVERSA }], error: null },
    });
    createClient.mockResolvedValue({ from: banco.from });

    const r = await arquivarConversa(SLUG, CONVERSA, true);

    expect(r).toEqual({ ok: true });
    expect(banco.consulta.update).toHaveBeenCalledWith({
      arquivada_em: expect.any(String),
    });
    expect(banco.consulta.eq).toHaveBeenCalledWith("id", CONVERSA);
    expect(banco.consulta.eq).toHaveBeenCalledWith("restaurante_id", CASA);
    expect(banco.consulta.is).toHaveBeenCalledWith("excluida_em", null);
    expect(revalidatePath).toHaveBeenCalledWith(`/r/${SLUG}/mentor`);
  });

  it("desarquiva marcando nulo (trazer de volta)", async () => {
    dono();
    const banco = bancoFalso({
      escrita: { data: [{ id: CONVERSA }], error: null },
    });
    createClient.mockResolvedValue({ from: banco.from });

    const r = await arquivarConversa(SLUG, CONVERSA, false);

    expect(r).toEqual({ ok: true });
    expect(banco.consulta.update).toHaveBeenCalledWith({ arquivada_em: null });
  });

  it("conversa de outra casa (zero linhas) vira frase de produto", async () => {
    dono();
    const banco = bancoFalso({ escrita: { data: [], error: null } });
    createClient.mockResolvedValue({ from: banco.from });

    const r = await arquivarConversa(SLUG, CONVERSA, true);

    expect(r).toEqual({ ok: false, error: FRASE_CONVERSA });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("admin em modo leitura não arquiva pelo caminho do dono", async () => {
    adminEmLeitura();
    const banco = bancoFalso();
    createClient.mockResolvedValue({ from: banco.from });

    const r = await arquivarConversa(SLUG, CONVERSA, true);

    expect(r).toEqual({ ok: false, error: FRASE_ADMIN });
    expect(createClient).not.toHaveBeenCalled();
    expect(banco.from).not.toHaveBeenCalled();
  });

  it("erro do banco vira frase genérica e o log leva só o código", async () => {
    dono();
    const banco = bancoFalso({
      escrita: {
        data: null,
        error: { code: "XX000", message: "segredo interno do Postgres" },
      },
    });
    createClient.mockResolvedValue({ from: banco.from });

    const r = await arquivarConversa(SLUG, CONVERSA, true);

    expect(r).toEqual({ ok: false, error: FALHA_ORGANIZAR });
    expect(logError).toHaveBeenCalledWith("falha_sessoes_mentor");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("segredo");
  });
});

describe("excluirConversa", () => {
  const VISIVEL = { data: { id: CONVERSA, excluida_em: null }, error: null };

  it("exclui marcando a data, sem apagar a linha, e atualiza a tela", async () => {
    dono();
    const banco = bancoFalso({
      leitura: VISIVEL,
      escrita: { data: [{ id: CONVERSA }], error: null },
    });
    const servicoBanco = bancoFalso({
      escrita: { data: [], error: null },
    });
    createClient.mockResolvedValue({ from: banco.from });
    createServiceClient.mockReturnValue({ from: servicoBanco.from });

    const r = await excluirConversa(SLUG, CONVERSA);

    expect(r).toEqual({ ok: true });
    expect(banco.consulta.eq).toHaveBeenCalledWith("id", CONVERSA);
    expect(banco.consulta.eq).toHaveBeenCalledWith("restaurante_id", CASA);
    expect(banco.consulta.update).toHaveBeenCalledWith({
      excluida_em: expect.any(String),
    });
    // Marca, não apaga: nenhum DELETE sai daqui para a conversa.
    expect(banco.consulta.delete).not.toHaveBeenCalled();
    // Só as fichas saem junto, pela chave de serviço.
    expect(servicoBanco.from).toHaveBeenCalledWith("mentor_memorias");
    expect(revalidatePath).toHaveBeenCalledWith(`/r/${SLUG}/mentor`);
  });

  it("excluir conversa já excluída é idempotente (ok, sem mexer no relógio dos 60 dias)", async () => {
    dono();
    const banco = bancoFalso({
      leitura: {
        data: { id: CONVERSA, excluida_em: "2026-11-01T12:00:00Z" },
        error: null,
      },
    });
    createClient.mockResolvedValue({ from: banco.from });

    const r = await excluirConversa(SLUG, CONVERSA);

    expect(r).toEqual({ ok: true });
    // Sem nova escrita a data original fica valendo: o prazo não recomeça.
    expect(banco.consulta.update).not.toHaveBeenCalled();
  });

  it("apaga junto as fichas daquela conversa e casa, antes da marca", async () => {
    dono();
    const donoBanco = bancoFalso({
      leitura: VISIVEL,
      escrita: { data: [{ id: CONVERSA }], error: null },
    });
    const servicoBanco = bancoFalso({
      escrita: { data: [], error: null },
    });
    createClient.mockResolvedValue({ from: donoBanco.from });
    createServiceClient.mockReturnValue({ from: servicoBanco.from });

    const r = await excluirConversa(SLUG, CONVERSA);

    expect(r).toEqual({ ok: true });
    // As fichas morrem junto com a vista da conversa: DELETE na tabela
    // certa, preso à conversa E à casa da sessão — outra conversa da casa
    // mantém as suas porque o filtro nunca é só pela casa.
    expect(servicoBanco.from).toHaveBeenCalledWith("mentor_memorias");
    expect(servicoBanco.consulta.delete).toHaveBeenCalledTimes(1);
    expect(servicoBanco.consulta.eq).toHaveBeenCalledWith(
      "conversa_id",
      CONVERSA
    );
    expect(servicoBanco.consulta.eq).toHaveBeenCalledWith(
      "restaurante_id",
      CASA
    );
    // E a marca segue valendo, como antes.
    expect(donoBanco.consulta.update).toHaveBeenCalledWith({
      excluida_em: expect.any(String),
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/r/${SLUG}/mentor`);
  });

  it("erro ao apagar as fichas falha fechado: sem marca, frase genérica, log só com código", async () => {
    dono();
    const donoBanco = bancoFalso({ leitura: VISIVEL });
    const servicoBanco = bancoFalso({
      escrita: {
        data: null,
        error: { code: "XX000", message: "segredo interno do Postgres" },
      },
    });
    createClient.mockResolvedValue({ from: donoBanco.from });
    createServiceClient.mockReturnValue({ from: servicoBanco.from });

    const r = await excluirConversa(SLUG, CONVERSA);

    expect(r).toEqual({ ok: false, error: FALHA_ORGANIZAR });
    expect(logError).toHaveBeenCalledWith("falha_sessoes_mentor");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("segredo");
    expect(donoBanco.consulta.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("conversa de outra casa vira frase de produto", async () => {
    dono();
    const banco = bancoFalso({ leitura: { data: null, error: null } });
    createClient.mockResolvedValue({ from: banco.from });

    const r = await excluirConversa(SLUG, CONVERSA);

    expect(r).toEqual({ ok: false, error: FRASE_CONVERSA });
    expect(banco.consulta.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("admin em modo leitura não exclui pelo caminho do dono", async () => {
    adminEmLeitura();
    const banco = bancoFalso();
    createClient.mockResolvedValue({ from: banco.from });

    const r = await excluirConversa(SLUG, CONVERSA);

    expect(r).toEqual({ ok: false, error: FRASE_ADMIN });
    expect(createClient).not.toHaveBeenCalled();
    expect(banco.from).not.toHaveBeenCalled();
  });

  it("erro do banco na leitura vira frase genérica e o log leva só o código", async () => {
    dono();
    const banco = bancoFalso({
      leitura: {
        data: null,
        error: { code: "XX000", message: "segredo interno do Postgres" },
      },
    });
    createClient.mockResolvedValue({ from: banco.from });

    const r = await excluirConversa(SLUG, CONVERSA);

    expect(r).toEqual({ ok: false, error: FALHA_ORGANIZAR });
    expect(logError).toHaveBeenCalledWith("falha_sessoes_mentor");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("segredo");
    expect(banco.consulta.update).not.toHaveBeenCalled();
  });
});

describe("apagarConversaDeVerdade", () => {
  const EXCLUIDA = {
    data: { id: CONVERSA, excluida_em: "2026-11-01T12:00:00Z" },
    error: null,
  };

  it("o admin apaga a EXCLUÍDA pela chave de serviço e atualiza a lista do suporte", async () => {
    admin();
    const banco = bancoFalso({
      leitura: EXCLUIDA,
      escrita: { data: [{ id: CONVERSA }], error: null },
    });
    createServiceClient.mockReturnValue({ from: banco.from });

    const r = await apagarConversaDeVerdade(CONVERSA);

    expect(r).toEqual({ ok: true });
    expect(exigirAdmin).toHaveBeenCalledTimes(1);
    expect(banco.from).toHaveBeenCalledWith("mentor_conversas");
    expect(banco.consulta.delete).toHaveBeenCalledTimes(1);
    expect(banco.consulta.eq).toHaveBeenCalledWith("id", CONVERSA);
    // Mesmo excluída na leitura, o DELETE exige de novo: corrida em que a
    // conversa deixou de ser excluída não apaga nada (zero linhas).
    expect(banco.consulta.not).toHaveBeenCalledWith("excluida_em", "is", null);
    // Chave de serviço: o cliente do dono nunca é tocado.
    expect(createClient).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/mentor/conversas");
  });

  it("conversa NÃO excluída não é apagada: frase de produto, sem DELETE", async () => {
    admin();
    const banco = bancoFalso({
      leitura: { data: { id: CONVERSA, excluida_em: null }, error: null },
    });
    createServiceClient.mockReturnValue({ from: banco.from });

    const r = await apagarConversaDeVerdade(CONVERSA);

    expect(r).toEqual({ ok: false, error: FRASE_SOMENTE_EXCLUIDA });
    expect(banco.consulta.delete).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("o dono não chama o apagar-de-verdade (barrado antes de tocar no banco)", async () => {
    exigirAdmin.mockRejectedValue(new Error("REDIRECT:/r/bar-do-ze/hoje"));
    const banco = bancoFalso();
    createServiceClient.mockReturnValue({ from: banco.from });

    await expect(apagarConversaDeVerdade(CONVERSA)).rejects.toThrow("REDIRECT");

    expect(createServiceClient).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(banco.from).not.toHaveBeenCalled();
  });

  it("conversa que não existe vira frase de produto, sem DELETE", async () => {
    admin();
    const banco = bancoFalso({ leitura: { data: null, error: null } });
    createServiceClient.mockReturnValue({ from: banco.from });

    const r = await apagarConversaDeVerdade(CONVERSA);

    expect(r).toEqual({ ok: false, error: FRASE_CONVERSA });
    expect(banco.consulta.delete).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("id que não é uuid vira frase de produto, sem tocar no banco", async () => {
    admin();
    const banco = bancoFalso();
    createServiceClient.mockReturnValue({ from: banco.from });

    const r = await apagarConversaDeVerdade("nao-e-um-uuid");

    expect(r).toEqual({ ok: false, error: FRASE_CONVERSA });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("erro do banco na leitura vira frase genérica e o log leva só o código", async () => {
    admin();
    const banco = bancoFalso({
      leitura: {
        data: null,
        error: { code: "XX000", message: "segredo interno do Postgres" },
      },
    });
    createServiceClient.mockReturnValue({ from: banco.from });

    const r = await apagarConversaDeVerdade(CONVERSA);

    expect(r).toEqual({ ok: false, error: FALHA_APAGAR });
    expect(logError).toHaveBeenCalledWith("falha_sessoes_mentor");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("segredo");
    expect(banco.consulta.delete).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("erro do banco no DELETE vira frase genérica e o log leva só o código", async () => {
    admin();
    const banco = bancoFalso({
      leitura: EXCLUIDA,
      escrita: {
        data: null,
        error: { code: "XX000", message: "segredo interno do Postgres" },
      },
    });
    createServiceClient.mockReturnValue({ from: banco.from });

    const r = await apagarConversaDeVerdade(CONVERSA);

    expect(r).toEqual({ ok: false, error: FALHA_APAGAR });
    expect(logError).toHaveBeenCalledWith("falha_sessoes_mentor");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("segredo");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
