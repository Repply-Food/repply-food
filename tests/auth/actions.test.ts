// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: os dublês precisam existir antes de o vi.mock (içado ao topo) rodar.
const {
  getUser,
  updateUser,
  cookieGet,
  updateUserById,
  senhaConfere,
  signInWithPassword,
  resetPasswordForEmail,
  signOut,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  cookieGet: vi.fn(),
  updateUserById: vi.fn(),
  senhaConfere: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet, delete: vi.fn(), set: vi.fn() }),
  headers: async () => new Headers({ origin: "http://127.0.0.1:3000" }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser,
      updateUser,
      signInWithPassword,
      resetPasswordForEmail,
      refreshSession: vi.fn(),
      signOut,
    },
    rpc: async () => ({ data: false }),
    from: () => ({
      select: () => ({
        order: async () => ({ data: [{ slug: "casa-x", situacao: "ativo" }] }),
      }),
    }),
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ auth: { admin: { updateUserById } } }),
}));
vi.mock("@/lib/auth/nucleo", async (original) => ({
  ...(await original<typeof import("@/lib/auth/nucleo")>()),
  senhaConfere,
}));

import {
  definirNovaSenhaAction,
  entrarAction,
  pedirNovaSenhaAction,
  sairAction,
  trocarSenhaAction,
} from "@/lib/auth/actions";
import { criarCookieRecuperacao } from "@/lib/auth/cookie-recuperacao";
import { MENSAGEM_LOGIN_RECUSADO } from "@/lib/auth/erros";

const novaSenha = { senha: "senha-nova-123", confirmacao: "senha-nova-123" };
const FRASE_DE_LIMITE =
  "Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.";
const FRASE_GENERICA =
  "Não foi possível concluir agora. Tente de novo em instantes.";
const FRASE_SENHA_IGUAL = "A nova senha precisa ser diferente da atual.";

const donoComTroca = {
  id: "u1",
  email: "d@x.com",
  app_metadata: { precisa_trocar_senha: true },
};
const donoSemTroca = { id: "u1", email: "d@x.com", app_metadata: {} };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "segredo-de-teste");
  updateUser.mockResolvedValue({ error: null });
  updateUserById.mockResolvedValue({
    data: { user: { app_metadata: { precisa_trocar_senha: false } } },
    error: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/**
 * As ações seguram 800 ms de propósito (mesmo tempo para qualquer resposta).
 * Com o relógio falso o teste não espera isso de verdade.
 */
async function semEspera<T>(chamada: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(1_000);
  return chamada;
}

describe("as ações conferem o acesso por dentro, não só a página", () => {
  it("nova senha sem o cookie do e-mail não troca a senha", async () => {
    getUser.mockResolvedValue({ data: { user: donoSemTroca } });
    cookieGet.mockReturnValue(undefined);
    const resultado = await definirNovaSenhaAction(novaSenha);
    expect(resultado.ok).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("troca voluntária com a senha atual errada não troca a senha", async () => {
    getUser.mockResolvedValue({ data: { user: donoSemTroca } });
    senhaConfere.mockResolvedValue({ tipo: "nao_confere" });
    const resultado = await trocarSenhaAction({
      senhaAtual: "errada-123",
      ...novaSenha,
    });
    expect(resultado).toEqual({
      ok: false,
      error: "A senha atual não confere.",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("primeiro acesso não pede a senha atual e o servidor tira o aviso", async () => {
    getUser.mockResolvedValue({ data: { user: donoComTroca } });
    const resultado = await trocarSenhaAction({ senhaAtual: "", ...novaSenha });
    expect(resultado).toEqual({
      ok: true,
      data: { destino: "/r/casa-x/hoje" },
    });
    expect(senhaConfere).not.toHaveBeenCalled();
    expect(updateUserById).toHaveBeenCalledWith("u1", {
      app_metadata: { precisa_trocar_senha: false },
    });
  });

  it("sem sessão, nada acontece", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const resultado = await trocarSenhaAction({ senhaAtual: "", ...novaSenha });
    expect(resultado.ok).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe("o login é compartilhado entre aparelhos (D-10)", () => {
  it("sair tira só este aparelho", async () => {
    signOut.mockResolvedValue({ error: null });
    await sairAction();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("trocar a senha tira os OUTROS aparelhos, não este", async () => {
    getUser.mockResolvedValue({ data: { user: donoComTroca } });
    const resultado = await trocarSenhaAction({ senhaAtual: "", ...novaSenha });
    expect(resultado.ok).toBe(true);
    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(signOut).not.toHaveBeenCalledWith({ scope: "global" });
  });
});

describe("esqueci a senha não revela quem é cliente", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it("o pedido normal volta pelo endereço em que a pessoa está", async () => {
    const resultado = await semEspera(
      pedirNovaSenhaAction({ email: "dono@casa.com" })
    );
    expect(resultado).toEqual({ ok: true });
    expect(resetPasswordForEmail).toHaveBeenCalledWith("dono@casa.com", {
      redirectTo: "http://127.0.0.1:3000/auth/confirmar?next=/nova-senha",
    });
  });

  it("limite de e-mail por usuário (só existe para e-mail de cliente) dá a mesma resposta de sucesso", async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: { code: "over_email_send_rate_limit" },
    });
    const resultado = await semEspera(
      pedirNovaSenhaAction({ email: "dono@casa.com" })
    );
    expect(resultado).toEqual({ ok: true });
  });

  it("e demora o mesmo tempo mínimo do pedido que não bateu em limite nenhum", async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: { code: "over_email_send_rate_limit" },
    });
    let respondeu = false;
    const chamada = pedirNovaSenhaAction({ email: "dono@casa.com" }).then(
      (resultado) => {
        respondeu = true;
        return resultado;
      }
    );
    await vi.advanceTimersByTimeAsync(700);
    expect(respondeu).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(respondeu).toBe(true);
    expect(await chamada).toEqual({ ok: true });
  });

  it("limite por endereço de internet (vem antes de procurar o usuário) mostra a frase de limite", async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: { code: "over_request_rate_limit" },
    });
    const resultado = await semEspera(
      pedirNovaSenhaAction({ email: "dono@casa.com" })
    );
    expect(resultado).toEqual({ ok: false, error: FRASE_DE_LIMITE });
  });

  it("outro erro do login mostra a frase genérica, nunca o texto cru", async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: {
        code: "unexpected_failure",
        message: "smtp: connection refused",
      },
    });
    const resultado = await semEspera(
      pedirNovaSenhaAction({ email: "dono@casa.com" })
    );
    expect(resultado).toEqual({ ok: false, error: FRASE_GENERICA });
  });
});

describe("entrar só diz 'incorretos' quando a credencial é que está errada", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  const dados = { email: "dono@casa.com", senha: "qualquer-123" };

  it.each(["invalid_credentials", "email_not_confirmed"])(
    "%s dá a frase de login recusado",
    async (code) => {
      signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { code },
      });
      const resultado = await semEspera(entrarAction(dados));
      expect(resultado).toEqual({ ok: false, error: MENSAGEM_LOGIN_RECUSADO });
    }
  );

  it("limite por endereço de internet dá a frase de limite", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "over_request_rate_limit" },
    });
    const resultado = await semEspera(entrarAction(dados));
    expect(resultado).toEqual({ ok: false, error: FRASE_DE_LIMITE });
  });

  it.each([
    ["erro de infraestrutura com código", { code: "unexpected_failure" }],
    ["falha de rede, sem código", { name: "AuthRetryableFetchError" }],
  ])("%s dá a frase genérica, não 'incorretos'", async (_nome, erro) => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: erro });
    const resultado = await semEspera(entrarAction(dados));
    expect(resultado).toEqual({ ok: false, error: FRASE_GENERICA });
  });

  it("login certo segue para o destino da casa", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: donoSemTroca },
      error: null,
    });
    const resultado = await semEspera(entrarAction(dados));
    expect(resultado).toEqual({
      ok: true,
      data: { destino: "/r/casa-x/hoje" },
    });
  });
});

describe("troca voluntária: falha da conferência não vira 'senha atual não confere'", () => {
  const entrada = { senhaAtual: "atual-123", ...novaSenha };

  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: donoSemTroca } });
  });

  it("limite por endereço de internet mostra a frase de limite e não troca nada", async () => {
    senhaConfere.mockResolvedValue({
      tipo: "falhou",
      codigo: "over_request_rate_limit",
    });
    const resultado = await trocarSenhaAction(entrada);
    expect(resultado).toEqual({ ok: false, error: FRASE_DE_LIMITE });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("falha de rede (sem código) mostra a frase genérica e não troca nada", async () => {
    senhaConfere.mockResolvedValue({ tipo: "falhou", codigo: null });
    const resultado = await trocarSenhaAction(entrada);
    expect(resultado).toEqual({ ok: false, error: FRASE_GENERICA });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("senha atual conferida segue e troca", async () => {
    senhaConfere.mockResolvedValue({ tipo: "confere" });
    const resultado = await trocarSenhaAction(entrada);
    expect(resultado.ok).toBe(true);
    expect(updateUser).toHaveBeenCalledWith({ password: novaSenha.senha });
  });
});

describe("primeiro acesso que parou no meio não prende a pessoa", () => {
  const sameSenha = { error: { code: "same_password" } };

  describe("na troca de senha (trocarSenhaAction)", () => {
    it("same_password com o aviso ainda ligado: a senha já é a nova, então tira o aviso", async () => {
      getUser.mockResolvedValue({ data: { user: donoComTroca } });
      updateUser.mockResolvedValue(sameSenha);
      const resultado = await trocarSenhaAction({
        senhaAtual: "",
        ...novaSenha,
      });
      expect(resultado).toEqual({
        ok: true,
        data: { destino: "/r/casa-x/hoje" },
      });
      expect(updateUserById).toHaveBeenCalledWith("u1", {
        app_metadata: { precisa_trocar_senha: false },
      });
    });

    it("same_password numa troca voluntária continua sendo erro", async () => {
      getUser.mockResolvedValue({ data: { user: donoSemTroca } });
      senhaConfere.mockResolvedValue({ tipo: "confere" });
      updateUser.mockResolvedValue(sameSenha);
      const resultado = await trocarSenhaAction({
        senhaAtual: "atual-123",
        ...novaSenha,
      });
      expect(resultado).toEqual({ ok: false, error: FRASE_SENHA_IGUAL });
      expect(updateUserById).not.toHaveBeenCalled();
    });

    it("outro erro no primeiro acesso não tira o aviso", async () => {
      getUser.mockResolvedValue({ data: { user: donoComTroca } });
      updateUser.mockResolvedValue({ error: { code: "weak_password" } });
      const resultado = await trocarSenhaAction({
        senhaAtual: "",
        ...novaSenha,
      });
      expect(resultado.ok).toBe(false);
      expect(updateUserById).not.toHaveBeenCalled();
    });

    it("se o servidor não conseguir tirar o aviso, não diz que deu certo", async () => {
      getUser.mockResolvedValue({ data: { user: donoComTroca } });
      updateUser.mockResolvedValue(sameSenha);
      updateUserById.mockResolvedValue({
        data: { user: null },
        error: { code: "unexpected_failure" },
      });
      const resultado = await trocarSenhaAction({
        senhaAtual: "",
        ...novaSenha,
      });
      expect(resultado).toEqual({ ok: false, error: FRASE_GENERICA });
    });
  });

  describe("na senha nova do e-mail (definirNovaSenhaAction)", () => {
    beforeEach(() => {
      cookieGet.mockReturnValue({ value: criarCookieRecuperacao("u1") });
    });

    it("same_password com o aviso ainda ligado: tira o aviso", async () => {
      getUser.mockResolvedValue({ data: { user: donoComTroca } });
      updateUser.mockResolvedValue(sameSenha);
      const resultado = await definirNovaSenhaAction(novaSenha);
      expect(resultado).toEqual({
        ok: true,
        data: { destino: "/r/casa-x/hoje" },
      });
      expect(updateUserById).toHaveBeenCalledWith("u1", {
        app_metadata: { precisa_trocar_senha: false },
      });
    });

    it("same_password sem aviso de troca continua sendo erro", async () => {
      getUser.mockResolvedValue({ data: { user: donoSemTroca } });
      updateUser.mockResolvedValue(sameSenha);
      const resultado = await definirNovaSenhaAction(novaSenha);
      expect(resultado).toEqual({ ok: false, error: FRASE_SENHA_IGUAL });
      expect(updateUserById).not.toHaveBeenCalled();
    });
  });
});
