// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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
    ).toEqual({ tipo: "confere" });
    expect(
      await senhaConfere(
        URL_LOCAL,
        chaveLocal("anon"),
        conta.email,
        "senha-errada-123"
      )
    ).toEqual({ tipo: "nao_confere" });
  });

  it("falha do login (rede, limite, erro interno) não vira 'não confere'", async () => {
    // Porta 1: ninguém escuta; a conexão é recusada na hora.
    expect(
      await senhaConfere(
        "http://127.0.0.1:1",
        chaveLocal("anon"),
        "dono@casa.com",
        "qualquer-123"
      )
    ).toEqual({ tipo: "falhou", codigo: null });
  });

  describe("com um login falso que responde o que mandarmos", () => {
    let resposta: { status: number; corpo: object } = {
      status: 200,
      corpo: {},
    };
    const falso = createServer((_pedido, saida) => {
      saida.writeHead(resposta.status, { "content-type": "application/json" });
      saida.end(JSON.stringify(resposta.corpo));
    });
    let url = "";

    beforeAll(async () => {
      await new Promise<void>((pronto) => falso.listen(0, "127.0.0.1", pronto));
      url = `http://127.0.0.1:${(falso.address() as AddressInfo).port}`;
    });
    afterAll(() => {
      falso.close();
    });

    const conferir = () =>
      senhaConfere(url, chaveLocal("anon"), "dono@casa.com", "qualquer-123");

    it("credencial inválida é 'não confere'", async () => {
      resposta = {
        status: 400,
        corpo: { code: 400, error_code: "invalid_credentials", msg: "x" },
      };
      expect(await conferir()).toEqual({ tipo: "nao_confere" });
    });

    it("limite por endereço de internet é 'falhou' e leva o código junto", async () => {
      resposta = {
        status: 429,
        corpo: { code: 429, error_code: "over_request_rate_limit", msg: "x" },
      };
      expect(await conferir()).toEqual({
        tipo: "falhou",
        codigo: "over_request_rate_limit",
      });
    });

    it("queda do login (erro 5xx, a biblioteca não devolve código) é 'falhou' sem código", async () => {
      resposta = {
        status: 500,
        corpo: { code: 500, error_code: "unexpected_failure", msg: "x" },
      };
      expect(await conferir()).toEqual({ tipo: "falhou", codigo: null });
    });

    it("outro erro 4xx do login (conta bloqueada, por exemplo) é 'falhou' e leva o código", async () => {
      resposta = {
        status: 403,
        corpo: { code: 403, error_code: "user_banned", msg: "x" },
      };
      expect(await conferir()).toEqual({
        tipo: "falhou",
        codigo: "user_banned",
      });
    });
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
