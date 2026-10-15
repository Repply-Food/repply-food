// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { exigirAdmin, obterSessao, createClient, createServiceClient } =
  vi.hoisted(() => ({
    exigirAdmin: vi.fn(),
    obterSessao: vi.fn(),
    createClient: vi.fn(),
    createServiceClient: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/sessao", () => ({ exigirAdmin, obterSessao }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient }));

import * as acoes from "@/lib/admin/actions";
import {
  detalheDoRestaurante,
  emailsDosLoginsDaCasa,
  listarRestaurantes,
  restauranteParaEditar,
} from "@/lib/admin/dados";
import { registrarAberturaDoPainel } from "@/lib/admin/registro";
import { VALORES_INICIAIS } from "@/lib/admin/schemas";

const ID = "6f1c2b9e-1d2a-4c3b-8a4d-5e6f7a8b9c0d";

const chamadas: [string, () => Promise<unknown>][] = [
  ["cadastrar", () => acoes.cadastrarRestauranteAction(VALORES_INICIAIS)],
  ["editar", () => acoes.editarRestauranteAction(ID, VALORES_INICIAIS)],
  ["gerar token", () => acoes.gerarTokenAction(ID, "agora")],
  ["revogar token", () => acoes.revogarTokensAction(ID)],
  [
    "criar login",
    () => acoes.criarLoginAction(ID, { email: "dono@exemplo.com" }),
  ],
  ["redefinir senha", () => acoes.redefinirSenhaAction(ID, ID)],
  [
    "trocar e-mail",
    () => acoes.trocarEmailAction(ID, ID, { email: "novo@exemplo.com" }),
  ],
  [
    "pedir reenvio",
    () => acoes.pedirReenvioAction(ID, { desde: "2026-10-01" }),
  ],
  ["suspender", () => acoes.mudarSituacaoAction(ID, "suspenso")],
];

const leituras: [string, () => Promise<unknown>][] = [
  ["listar restaurantes", () => listarRestaurantes()],
  ["detalhe do restaurante", () => detalheDoRestaurante(ID)],
  ["restaurante para editar", () => restauranteParaEditar(ID)],
  ["e-mails dos logins da casa", () => emailsDosLoginsDaCasa(ID)],
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toda função do servidor do admin confere por dentro (POST direto)", () => {
  it.each(chamadas)(
    "%s recusa quem não é admin sem tocar no banco",
    async (_, chamar) => {
      exigirAdmin.mockRejectedValue(new Error("REDIRECT:/r/casa-x/hoje"));
      await expect(chamar()).rejects.toThrow("REDIRECT");
      expect(createClient).not.toHaveBeenCalled();
      expect(createServiceClient).not.toHaveBeenCalled();
    }
  );

  it.each(leituras)(
    "a leitura '%s' recusa quem não é admin sem tocar no banco",
    async (_, ler) => {
      exigirAdmin.mockRejectedValue(new Error("REDIRECT:/r/casa-x/hoje"));
      await expect(ler()).rejects.toThrow("REDIRECT");
      expect(createClient).not.toHaveBeenCalled();
      expect(createServiceClient).not.toHaveBeenCalled();
    }
  );

  it.each([
    [
      "editar",
      () => acoes.editarRestauranteAction("nao-e-uuid", VALORES_INICIAIS),
    ],
    ["gerar token", () => acoes.gerarTokenAction("nao-e-uuid", "agora")],
    ["revogar token", () => acoes.revogarTokensAction("../outro")],
    [
      "criar login",
      () => acoes.criarLoginAction("1 or 1=1", { email: "dono@exemplo.com" }),
    ],
    ["redefinir senha", () => acoes.redefinirSenhaAction(ID, "nao-e-uuid")],
    [
      "trocar e-mail",
      () => acoes.trocarEmailAction("x", ID, { email: "novo@exemplo.com" }),
    ],
    [
      "pedir reenvio",
      () => acoes.pedirReenvioAction("x", { desde: "2026-10-01" }),
    ],
    ["suspender", () => acoes.mudarSituacaoAction("x", "suspenso")],
  ] as const)(
    "%s com id que não é UUID é recusado sem tocar no banco",
    async (_, chamar) => {
      exigirAdmin.mockResolvedValue({ userId: ID, ehAdmin: true });
      expect(await chamar()).toMatchObject({ ok: false });
      expect(createClient).not.toHaveBeenCalled();
    }
  );

  it("cadastro inválido volta com a frase do campo, sem tocar no banco", async () => {
    exigirAdmin.mockResolvedValue({ userId: ID, ehAdmin: true });
    expect(await acoes.cadastrarRestauranteAction(VALORES_INICIAIS)).toEqual({
      ok: false,
      error: "Digite o nome do restaurante",
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("as leituras e o 'abriu o painel' também não confiam no navegador", () => {
  it("leitura com id que não é UUID devolve vazio, sem tocar no banco", async () => {
    exigirAdmin.mockResolvedValue({ userId: ID, ehAdmin: true });
    expect(await detalheDoRestaurante("nao-e-uuid")).toBeNull();
    expect(await restauranteParaEditar("../outro")).toBeNull();
    expect(await emailsDosLoginsDaCasa("1 or 1=1")).toEqual([]);
    expect(createClient).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it.each([
    ["sem sessão", null],
    ["sessão de dono", { userId: ID, ehAdmin: false }],
  ])("'abriu o painel' com %s não grava nada", async (_, sessao) => {
    obterSessao.mockResolvedValue(sessao);
    await registrarAberturaDoPainel(ID);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("'abriu o painel' nunca lança, nem quando a sessão falha", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    obterSessao.mockRejectedValue(new Error("falha_leitura_sessao"));
    await expect(registrarAberturaDoPainel(ID)).resolves.toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
    // O log leva só o código, nunca o texto do erro.
    expect(log).toHaveBeenCalledWith(
      "[repply-food]",
      "falha_registro_admin",
      undefined
    );
    log.mockRestore();
  });
});
