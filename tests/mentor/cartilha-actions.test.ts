// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// A função do servidor que salva a cartilha do mentor, com dublê (padrão de
// tests/admin/acoes-recusam.test.ts). O cliente de SERVIÇO ignora a RLS, então a
// única trava é `exigirAdmin()`: o teste prova que ela vem primeiro e que, sem
// ela, o banco nem é tocado. A leitura e a RLS da tabela são testadas no banco
// (tests/mentor/cartilha-uso.test.ts).

const { exigirAdmin, createClient, createServiceClient, revalidatePath } =
  vi.hoisted(() => ({
    exigirAdmin: vi.fn(),
    createClient: vi.fn(),
    createServiceClient: vi.fn(),
    revalidatePath: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/sessao", () => ({ exigirAdmin }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient }));

import { salvarCartilhaAction } from "@/lib/mentor/cartilha-actions";

const ADMIN = "6f1c2b9e-1d2a-4c3b-8a4d-5e6f7a8b9c0d";
const NOVA = "11111111-1111-4111-8111-111111111111";
const CRIADA_EM = "2026-11-01T13:00:00.123456+00:00";

type Resposta = { data: unknown; error: unknown };

/**
 * Cliente de serviço falso. O encadeamento reproduz o que a action faz:
 *   from("mentor_cartilhas").insert(...).select(...).single()
 *   from("mentor_cartilhas").update(...).eq("ativa", true).lt("criada_em", ...)
 */
function servicoFalso(r: { insert?: Resposta; update?: { error: unknown } }) {
  const single = vi.fn(() =>
    Promise.resolve(
      r.insert ?? { data: { id: NOVA, criada_em: CRIADA_EM }, error: null }
    )
  );
  const selecionar = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select: selecionar }));
  const lt = vi.fn(() => Promise.resolve(r.update ?? { error: null }));
  const eq = vi.fn(() => ({ lt }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ insert, update }));
  createServiceClient.mockReturnValue({ from });
  return { from, insert, selecionar, update, eq, lt };
}

function admin() {
  exigirAdmin.mockResolvedValue({ userId: ADMIN, ehAdmin: true });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("salvarCartilhaAction · quem pode", () => {
  it("recusa quem não é admin sem tocar no banco", async () => {
    exigirAdmin.mockRejectedValue(new Error("REDIRECT:/r/casa-x/hoje"));
    const banco = servicoFalso({});

    await expect(salvarCartilhaAction("Seja breve.")).rejects.toThrow(
      "REDIRECT"
    );

    expect(createServiceClient).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(banco.from).not.toHaveBeenCalled();
  });

  it("confere o admin ANTES de olhar o texto (texto inválido não esconde a trava)", async () => {
    exigirAdmin.mockRejectedValue(new Error("REDIRECT:/r/casa-x/hoje"));

    await expect(salvarCartilhaAction("")).rejects.toThrow("REDIRECT");
  });
});

describe("salvarCartilhaAction · texto", () => {
  it.each([
    ["vazio", ""],
    ["só espaços e quebras de linha", "  \n\t  "],
    ["que não é texto (POST direto)", undefined as unknown as string],
  ])(
    "recusa o texto %s com frase de produto, sem tocar no banco",
    async (_, texto) => {
      admin();
      const banco = servicoFalso({});

      expect(await salvarCartilhaAction(texto)).toEqual({
        ok: false,
        error: "Escreva o texto da cartilha.",
      });

      expect(createServiceClient).not.toHaveBeenCalled();
      expect(banco.from).not.toHaveBeenCalled();
    }
  );

  it("recusa o texto grande demais com frase de produto, sem tocar no banco", async () => {
    admin();
    servicoFalso({});

    const r = await salvarCartilhaAction("a".repeat(20_001));

    expect(r).toEqual({
      ok: false,
      error: "A cartilha ficou longa demais; resuma em até 20.000 caracteres.",
    });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("aceita o texto no limite exato", async () => {
    admin();
    const banco = servicoFalso({});

    expect((await salvarCartilhaAction("a".repeat(20_000))).ok).toBe(true);
    expect(banco.insert).toHaveBeenCalledTimes(1);
  });
});

describe("salvarCartilhaAction · salvar", () => {
  it("insere a nova versão ativa, sem as sobras de espaço, com o admin da sessão em criada_por", async () => {
    admin();
    const banco = servicoFalso({});

    const r = await salvarCartilhaAction("  Seja breve e acolhedor.  \n");

    expect(r).toEqual({ ok: true });
    expect(banco.from).toHaveBeenCalledWith("mentor_cartilhas");
    expect(banco.insert).toHaveBeenCalledWith({
      texto: "Seja breve e acolhedor.",
      ativa: true,
      criada_por: ADMIN,
    });
  });

  it("desativa as ativas mais antigas que a nova, DEPOIS de inserir a nova", async () => {
    admin();
    const banco = servicoFalso({});

    await salvarCartilhaAction("Seja breve.");

    expect(banco.update).toHaveBeenCalledWith({ ativa: false });
    expect(banco.eq).toHaveBeenCalledWith("ativa", true);
    // Só o que é mais velho que a nova: duas pessoas salvando ao mesmo tempo
    // nunca desativam a versão uma da outra (sobra sempre a mais recente).
    expect(banco.lt).toHaveBeenCalledWith("criada_em", CRIADA_EM);
    // Inserir primeiro: se a segunda etapa falhar, sobram duas ativas (vale a
    // mais recente), nunca zero.
    const [ordemDoInsert] = banco.insert.mock.invocationCallOrder;
    const [ordemDoUpdate] = banco.update.mock.invocationCallOrder;
    expect(ordemDoInsert).toBeLessThan(ordemDoUpdate as number);
  });

  it("atualiza a tela do editor depois de salvar", async () => {
    admin();
    servicoFalso({});

    await salvarCartilhaAction("Seja breve.");

    expect(revalidatePath).toHaveBeenCalledWith("/admin/mentor");
  });
});

describe("salvarCartilhaAction · quando o banco falha", () => {
  it("insert com zero linhas devolvidas NÃO é sucesso e não desativa nada", async () => {
    admin();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const banco = servicoFalso({ insert: { data: null, error: null } });

    const r = await salvarCartilhaAction("Seja breve.");

    expect(r.ok).toBe(false);
    expect(banco.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("erro do banco no insert vira frase de produto, sem vazar a mensagem, e o log leva só o código", async () => {
    admin();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const banco = servicoFalso({
      insert: {
        data: null,
        error: { code: "XX000", message: "segredo interno do Postgres" },
      },
    });

    const r = await salvarCartilhaAction("Seja breve.");

    expect(r).toEqual({
      ok: false,
      error:
        "Não foi possível salvar a cartilha agora. Tente de novo em instantes.",
    });
    expect(banco.update).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).toContain("falha_admin");
    expect(JSON.stringify(log.mock.calls)).not.toContain("segredo");
    expect(JSON.stringify(log.mock.calls)).not.toContain("Seja breve");
    log.mockRestore();
  });

  it("se só a desativação da anterior falhar, a nova já vale (é a mais recente): salva, e o erro vai para o log", async () => {
    admin();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    servicoFalso({
      update: { error: { code: "XX000", message: "segredo interno" } },
    });

    const r = await salvarCartilhaAction("Seja breve.");

    expect(r).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/mentor");
    expect(JSON.stringify(log.mock.calls)).toContain("falha_admin");
    expect(JSON.stringify(log.mock.calls)).not.toContain("segredo");
    log.mockRestore();
  });
});
