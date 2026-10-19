// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, logError } = vi.hoisted(() => ({
  rpc: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logError }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc }),
}));

import {
  limparTentativas,
  loginBloqueadoAte,
  registrarTentativaErrada,
} from "@/lib/auth/limitador-de-login";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a trava usa a chave de serviço e degrada com elegância", () => {
  it("loginBloqueadoAte devolve Date quando bloqueado", async () => {
    const quando = "2026-10-15T20:00:00.000Z";
    rpc.mockResolvedValue({ data: quando, error: null });
    expect(await loginBloqueadoAte("x@y.com")).toEqual(new Date(quando));
    expect(rpc).toHaveBeenCalledWith("login_bloqueado", { p_email: "x@y.com" });
  });

  it("loginBloqueadoAte devolve null quando não bloqueado", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await loginBloqueadoAte("x@y.com")).toBeNull();
  });

  it("resposta que não é uma data válida não bloqueia ninguém", async () => {
    rpc.mockResolvedValue({ data: "isto-nao-e-data", error: null });
    expect(await loginBloqueadoAte("x@y.com")).toBeNull();
  });

  it("falha de RPC não bloqueia o login (fail-open) e registra o código", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "08006" } });
    expect(await loginBloqueadoAte("x@y.com")).toBeNull();
    expect(logError).toHaveBeenCalledWith("falha_limitador_login");
  });

  it("registrar e limpar engolem o erro depois de registrar", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "08006" } });
    await expect(registrarTentativaErrada("x@y.com")).resolves.toBeUndefined();
    await expect(limparTentativas("x@y.com")).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith("falha_limitador_login");
    expect(logError).toHaveBeenCalledTimes(2);
  });

  it("registrar e limpar chamam as funções do banco com o e-mail", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await registrarTentativaErrada("x@y.com");
    await limparTentativas("x@y.com");
    expect(rpc).toHaveBeenCalledWith("registrar_tentativa_errada", {
      p_email: "x@y.com",
    });
    expect(rpc).toHaveBeenCalledWith("limpar_tentativas", {
      p_email: "x@y.com",
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it("até uma exceção (cliente que nem sobe, rede caída) nunca derruba o login", async () => {
    rpc.mockRejectedValue(new Error("fetch failed: segredo-na-mensagem"));
    expect(await loginBloqueadoAte("x@y.com")).toBeNull();
    await expect(registrarTentativaErrada("x@y.com")).resolves.toBeUndefined();
    await expect(limparTentativas("x@y.com")).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(3);
    // Só o código vai para o log, nunca a mensagem crua do erro.
    for (const chamada of logError.mock.calls) {
      expect(chamada).toEqual(["falha_limitador_login"]);
    }
  });
});
