// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// As ações das lembranças do mentor (apagar uma ficha, esquecer tudo), com
// dublês no guarda (`exigirCasa`) e nos clientes do banco — padrão de
// tests/mentor/sessoes-actions.test.ts. A prova é a mesma da fronteira de
// segurança: o restaurante sai da SESSÃO, nunca do argumento; o admin em modo
// leitura não mexe pelo caminho do dono; o navegador nunca escreve ficha
// direto (sem política de escrita para `authenticated`), então as ações vão
// pela chave de serviço com a casa explícita; e zero linhas afetadas nunca é
// sucesso. A leitura (`fichasDaCasa`) vai pelo cliente do dono: a RLS é a
// trava, e o filtro pela casa é a segunda camada.

const {
  exigirCasa,
  createClient,
  createServiceClient,
  revalidatePath,
  logError,
} = vi.hoisted(() => ({
  exigirCasa: vi.fn(),
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  revalidatePath: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/sessao", () => ({ exigirCasa }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient }));
vi.mock("@/lib/logger", () => ({ logError }));

import { fichasDaCasa } from "@/lib/mentor/leitura";
import { apagarFicha, esquecerTudo } from "@/lib/mentor/memorias-actions";

const CASA = "11111111-1111-4111-8111-111111111111";
const FICHA = "22222222-2222-4222-8222-222222222222";
const SLUG = "bar-do-ze";

const FRASE_FICHA = "não encontrei essa lembrança; ela pode ter sido apagada";
const FRASE_ADMIN = "no modo leitura do admin não dá para mexer nas lembranças";
const FALHA_LEMBRANCAS =
  "não foi possível mexer nas lembranças agora. Tente de novo em instantes.";

type Resposta = { data: unknown; error: unknown };

/**
 * Cliente do banco falso. O encadeamento reproduz o que as ações e a leitura
 * fazem:
 *   from("mentor_memorias").delete().eq(...).eq(...).select("id")
 *   from("mentor_memorias").select(...).eq(...).order(...).limit(...)
 * A consulta é "thenable" como a do supabase-js: o `await` do último elo
 * resolve a `escrita`; o `.maybeSingle()` resolve a `leitura`.
 */
function bancoFalso(args: { leitura?: Resposta; escrita?: Resposta } = {}) {
  const leitura = args.leitura ?? { data: null, error: null };
  const escrita = args.escrita ?? { data: null, error: null };
  const consulta: Record<string, ReturnType<typeof vi.fn>> = {};
  consulta.select = vi.fn(() => consulta);
  consulta.eq = vi.fn(() => consulta);
  consulta.order = vi.fn(() => consulta);
  consulta.limit = vi.fn(() => consulta);
  consulta.delete = vi.fn(() => consulta);
  consulta.maybeSingle = vi.fn(() => Promise.resolve(leitura));
  // biome-ignore lint/suspicious/noThenProperty: a consulta falsa é "thenable" de propósito, como a do supabase-js — o `await` do último elo resolve a escrita.
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

beforeEach(() => vi.clearAllMocks());

describe("apagarFicha", () => {
  it("o dono apaga só a ficha da casa da sessão e atualiza a tela", async () => {
    dono();
    const banco = bancoFalso({
      escrita: { data: [{ id: FICHA }], error: null },
    });
    createServiceClient.mockReturnValue({ from: banco.from });

    const r = await apagarFicha(SLUG, FICHA);

    expect(r).toEqual({ ok: true });
    expect(exigirCasa).toHaveBeenCalledWith(SLUG);
    expect(banco.from).toHaveBeenCalledWith("mentor_memorias");
    expect(banco.consulta.delete).toHaveBeenCalledTimes(1);
    // A ficha é presa pelo id E pela casa da sessão.
    expect(banco.consulta.eq).toHaveBeenCalledWith("id", FICHA);
    expect(banco.consulta.eq).toHaveBeenCalledWith("restaurante_id", CASA);
    // Chave de serviço: o cliente do dono nunca escreve ficha direto.
    expect(createClient).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith(`/r/${SLUG}/mentor/lembrancas`);
  });

  it("ficha de outra casa (zero linhas) vira frase de produto", async () => {
    dono();
    const banco = bancoFalso({ escrita: { data: [], error: null } });
    createServiceClient.mockReturnValue({ from: banco.from });

    const r = await apagarFicha(SLUG, FICHA);

    expect(r).toEqual({ ok: false, error: FRASE_FICHA });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("admin em modo leitura não apaga pelo caminho do dono", async () => {
    adminEmLeitura();
    const banco = bancoFalso();
    createServiceClient.mockReturnValue({ from: banco.from });

    const r = await apagarFicha(SLUG, FICHA);

    expect(r).toEqual({ ok: false, error: FRASE_ADMIN });
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(banco.from).not.toHaveBeenCalled();
  });

  it("id que não é uuid vira frase de produto, sem tocar no banco", async () => {
    dono();
    const banco = bancoFalso();
    createServiceClient.mockReturnValue({ from: banco.from });

    const r = await apagarFicha(SLUG, "nao-e-um-uuid");

    expect(r).toEqual({ ok: false, error: FRASE_FICHA });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("erro do banco vira frase genérica e o log leva só o código", async () => {
    dono();
    const banco = bancoFalso({
      escrita: {
        data: null,
        error: { code: "XX000", message: "segredo interno do Postgres" },
      },
    });
    createServiceClient.mockReturnValue({ from: banco.from });

    const r = await apagarFicha(SLUG, FICHA);

    expect(r).toEqual({ ok: false, error: FALHA_LEMBRANCAS });
    expect(logError).toHaveBeenCalledWith("falha_memoria_mentor");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("segredo");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("esquecerTudo", () => {
  it("o dono apaga só as fichas da casa da sessão e atualiza a tela", async () => {
    dono();
    const banco = bancoFalso({
      escrita: { data: [{ id: FICHA }], error: null },
    });
    createServiceClient.mockReturnValue({ from: banco.from });

    const r = await esquecerTudo(SLUG);

    expect(r).toEqual({ ok: true });
    expect(exigirCasa).toHaveBeenCalledWith(SLUG);
    expect(banco.from).toHaveBeenCalledWith("mentor_memorias");
    expect(banco.consulta.delete).toHaveBeenCalledTimes(1);
    // Só as dele: o filtro é a casa, sem id — outra casa mantém as suas.
    expect(banco.consulta.eq).toHaveBeenCalledWith("restaurante_id", CASA);
    expect(banco.consulta.eq).not.toHaveBeenCalledWith("id", expect.anything());
    expect(createClient).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith(`/r/${SLUG}/mentor/lembrancas`);
  });

  it("esquecerTudo nunca toca em anexo nem no cofre: só mentor_memorias", async () => {
    dono();
    const banco = bancoFalso({
      escrita: { data: [{ id: FICHA }], error: null },
    });
    const storageFrom = vi.fn();
    createServiceClient.mockReturnValue({
      from: banco.from,
      storage: { from: storageFrom },
    });

    const r = await esquecerTudo(SLUG);

    expect(r).toEqual({ ok: true });
    // O delete alcança UMA tabela, e é a das fichas — nunca mentor_anexos.
    expect(banco.from).toHaveBeenCalledWith("mentor_memorias");
    const tabelas = banco.from.mock.calls.map(
      (args) => (args as unknown as string[])[0]
    );
    expect(tabelas).toEqual(["mentor_memorias"]);
    expect(banco.consulta.delete).toHaveBeenCalledTimes(1);
    // Nada no cofre: esquecer é das lembranças, o anexo sai com a conversa.
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it("sem ficha nenhuma continua ok (nada para esquecer)", async () => {
    dono();
    const banco = bancoFalso({ escrita: { data: [], error: null } });
    createServiceClient.mockReturnValue({ from: banco.from });

    const r = await esquecerTudo(SLUG);

    expect(r).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith(`/r/${SLUG}/mentor/lembrancas`);
  });

  it("admin em modo leitura não esquece pelo caminho do dono", async () => {
    adminEmLeitura();
    const banco = bancoFalso();
    createServiceClient.mockReturnValue({ from: banco.from });

    const r = await esquecerTudo(SLUG);

    expect(r).toEqual({ ok: false, error: FRASE_ADMIN });
    expect(createServiceClient).not.toHaveBeenCalled();
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
    createServiceClient.mockReturnValue({ from: banco.from });

    const r = await esquecerTudo(SLUG);

    expect(r).toEqual({ ok: false, error: FALHA_LEMBRANCAS });
    expect(logError).toHaveBeenCalledWith("falha_memoria_mentor");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("segredo");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("codigo de log", () => {
  it("usa código dentro do allowlist real do logger (não vira erro_interno)", async () => {
    // Prova contra regressão: os asserts acima mockam o logger e repetiriam
    // um código fora do allowlist sem reclamar. Aqui o código que a action
    // usou passa pelo logError DE VERDADE (importActual, sem quebrar os
    // mocks do arquivo); fora do allowlist ele sairia como "erro_interno".
    const real =
      await vi.importActual<typeof import("@/lib/logger")>("@/lib/logger");
    const saidas: string[] = [];
    const olho = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        saidas.push(args.map(String).join(" "));
      });
    try {
      dono();
      const banco1 = bancoFalso({
        escrita: { data: null, error: { code: "XX000", message: "x" } },
      });
      createServiceClient.mockReturnValue({ from: banco1.from });
      await apagarFicha(SLUG, FICHA);
      const codigo1 = logError.mock.calls[0]?.[0];
      logError.mockClear();

      dono();
      const banco2 = bancoFalso({
        escrita: { data: null, error: { code: "XX000", message: "x" } },
      });
      createServiceClient.mockReturnValue({ from: banco2.from });
      await esquecerTudo(SLUG);
      const codigo2 = logError.mock.calls[0]?.[0];

      for (const codigo of [codigo1, codigo2]) {
        const antes = saidas.length;
        real.logError(codigo);
        const saida = saidas.slice(antes).join(" ");
        expect(saida).toContain(String(codigo));
        expect(saida).not.toContain("erro_interno");
      }
    } finally {
      olho.mockRestore();
    }
  });
});

describe("fichasDaCasa", () => {
  const LINHAS = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tipo: "fato",
      texto: "o dono prefere conselho direto",
      atualizada_em: "2026-11-03T13:30:00+00:00",
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      tipo: "resumo",
      texto: "a casa lota de sexta",
      atualizada_em: "2026-11-02T13:30:00+00:00",
    },
  ];

  it("devolve tipo, texto e data, filtrando pela casa e ordenando pela mais nova", async () => {
    const banco = bancoFalso({ escrita: { data: LINHAS, error: null } });
    createClient.mockResolvedValue({ from: banco.from });

    const fichas = await fichasDaCasa(CASA);

    expect(fichas).toEqual(LINHAS);
    expect(banco.from).toHaveBeenCalledWith("mentor_memorias");
    expect(banco.consulta.eq).toHaveBeenCalledWith("restaurante_id", CASA);
    expect(banco.consulta.order).toHaveBeenCalledWith("atualizada_em", {
      ascending: false,
    });
  });

  it("outra casa devolve vazio (o filtro + a RLS barram)", async () => {
    const banco = bancoFalso({ escrita: { data: [], error: null } });
    createClient.mockResolvedValue({ from: banco.from });

    expect(await fichasDaCasa("99999999-9999-4999-8999-999999999999")).toEqual(
      []
    );
  });

  it("linha com tipo fora de fato/resumo não aparece", async () => {
    const banco = bancoFalso({
      escrita: {
        data: [
          ...LINHAS,
          {
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            tipo: "lembrete",
            texto: "tipo que o banco de hoje não aceita mais",
            atualizada_em: "2026-11-04T13:30:00+00:00",
          },
        ],
        error: null,
      },
    });
    createClient.mockResolvedValue({ from: banco.from });

    expect(await fichasDaCasa(CASA)).toEqual(LINHAS);
  });

  it("erro do banco falha fechado, com o log levando só o código", async () => {
    const banco = bancoFalso({
      escrita: {
        data: null,
        error: { code: "XX000", message: "segredo interno do Postgres" },
      },
    });
    createClient.mockResolvedValue({ from: banco.from });

    await expect(fichasDaCasa(CASA)).rejects.toThrow("falha_leitura_mentor");
    expect(logError).toHaveBeenCalledWith("falha_leitura_mentor");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("segredo");
  });
});
