// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const servico = createClient<Database>(
  URL_LOCAL,
  chaveLocal("service_role"),
  opcoes
);
const novoAnonimo = () =>
  createClient<Database>(URL_LOCAL, chaveLocal("anon"), opcoes);
const criados: string[] = [];

afterAll(async () => {
  for (const id of criados.splice(0)) await servico.auth.admin.deleteUser(id);
});

async function contaDeTeste() {
  const email = `login-${randomUUID().slice(0, 8)}@teste.repply.local`;
  const senha = `senha-${randomUUID()}`;
  const { data, error } = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error("não criou a conta de teste");
  criados.push(data.user.id);
  return { id: data.user.id, email, senha };
}

async function entrar(email: string, senha: string) {
  const cliente = novoAnonimo();
  const { data, error } = await cliente.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error || !data.session) throw new Error("a conta de teste não entrou");
  return { cliente, sessao: data.session };
}

describe("funções da chave de serviço para os logins (D-55)", () => {
  it("id_do_login_por_email acha a conta sem ligar para maiúsculas e espaços", async () => {
    const conta = await contaDeTeste();
    const { data, error } = await servico.rpc("id_do_login_por_email", {
      p_email: `  ${conta.email.toUpperCase()} `,
    });
    expect(error).toBeNull();
    expect(data).toBe(conta.id);
  });

  it("e-mail sem conta devolve nulo", async () => {
    const { data, error } = await servico.rpc("id_do_login_por_email", {
      p_email: `ninguem-${randomUUID()}@teste.repply.local`,
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("encerrar_sessoes_do_login desconecta todos os aparelhos daquele login", async () => {
    const conta = await contaDeTeste();
    const celular = await entrar(conta.email, conta.senha);
    const computador = await entrar(conta.email, conta.senha);

    const { data, error } = await servico.rpc("encerrar_sessoes_do_login", {
      p_user_id: conta.id,
    });
    expect(error).toBeNull();
    expect(data).toBe(2);

    // O porteiro (proxy.ts) chama getUser a cada página: o token antigo não vale mais...
    const lido = await servico.auth.getUser(celular.sessao.access_token);
    expect(lido.data.user).toBeNull();
    // ... e não se renova.
    const renovado = await novoAnonimo().auth.refreshSession({
      refresh_token: computador.sessao.refresh_token,
    });
    expect(renovado.error?.code).toBe("refresh_token_not_found");
  });

  it("login sem sessão aberta: zero sessões encerradas, sem erro", async () => {
    const conta = await contaDeTeste();
    const { data, error } = await servico.rpc("encerrar_sessoes_do_login", {
      p_user_id: conta.id,
    });
    expect(error).toBeNull();
    expect(data).toBe(0);
  });

  it("nem o visitante nem um login chamam as duas funções", async () => {
    const conta = await contaDeTeste();
    const { cliente } = await entrar(conta.email, conta.senha);
    for (const chamador of [novoAnonimo(), cliente]) {
      const achar = await chamador.rpc("id_do_login_por_email", {
        p_email: conta.email,
      });
      expect(achar.error).not.toBeNull();
      const encerrar = await chamador.rpc("encerrar_sessoes_do_login", {
        p_user_id: conta.id,
      });
      expect(encerrar.error).not.toBeNull();
    }
  });
});
