// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import {
  liberarPrimeiroAcesso,
  precisaTrocarSenha,
  senhaConfere,
} from "../../lib/auth/nucleo";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";

const servico = createClient(URL_LOCAL, chaveLocal("service_role"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const criados: string[] = [];

afterEach(async () => {
  for (const id of criados.splice(0)) await servico.auth.admin.deleteUser(id);
});

async function contaDeTeste(precisa: boolean) {
  const email = `teste-${randomUUID()}@teste.repply.local`;
  const senha = `provisoria-${randomUUID().slice(0, 8)}`;
  const { data, error } = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    app_metadata: { precisa_trocar_senha: precisa },
  });
  if (error || !data.user) throw new Error("não criou a conta de teste");
  criados.push(data.user.id);
  return { id: data.user.id, email, senha, usuario: data.user };
}

describe("núcleo do login, contra o Supabase local", () => {
  it("conta criada pelo admin com o aviso de troca é reconhecida", async () => {
    const conta = await contaDeTeste(true);
    expect(precisaTrocarSenha(conta.usuario)).toBe(true);
  });

  it("confere a senha sem abrir sessão nova no navegador", async () => {
    const conta = await contaDeTeste(false);
    expect(
      await senhaConfere(
        URL_LOCAL,
        chaveLocal("anon"),
        conta.email,
        conta.senha
      )
    ).toBe(true);
    expect(
      await senhaConfere(
        URL_LOCAL,
        chaveLocal("anon"),
        conta.email,
        "senha-errada-123"
      )
    ).toBe(false);
  });

  it("só o servidor tira o aviso de troca, e confere que tirou", async () => {
    const conta = await contaDeTeste(true);
    expect(await liberarPrimeiroAcesso(servico, conta.id)).toBe(true);
    const { data } = await servico.auth.admin.getUserById(conta.id);
    expect(precisaTrocarSenha(data.user)).toBe(false);
  });

  it("ninguém se cadastra sozinho (cadastro público fechado, D-11)", async () => {
    const anonimo = createClient(URL_LOCAL, chaveLocal("anon"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anonimo.auth.signUp({
      email: `invasor-${randomUUID()}@teste.repply.local`,
      password: "senha-de-teste-123",
    });
    if (data.user) criados.push(data.user.id);
    expect(error?.code).toBe("signup_disabled");
  });
});
