// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";
import { conectarBanco } from "../helpers/supabase-local";

// Salvar a cartilha e ler o histórico contra o banco local, sem dublê no banco:
// só a camada de sessão é trocada (quem é o admin) e o `server-only`/o cache do
// Next, que não existem fora do servidor. Os testes com dublê de
// cartilha-actions.test.ts só fixam o FORMATO da chamada; aqui vale o efeito:
// se a data (`timestamptz`) fosse serializada errada na desativação, ela casaria
// zero linhas SEM erro e as versões antigas ficariam ativas para sempre. A
// conferência é sempre pelo banco (`pg`), nunca pelo que a própria action diz.

const { sessao, clientes } = vi.hoisted(() => ({
  sessao: { adminId: "" },
  clientes: { servico: null as unknown, admin: null as unknown },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/sessao", () => ({
  exigirAdmin: async () => ({ userId: sessao.adminId, ehAdmin: true }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => clientes.servico,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => clientes.admin,
}));

import { cartilhaAtiva, historicoCartilhas } from "@/lib/mentor/cartilha";
import { salvarCartilhaAction } from "@/lib/mentor/cartilha-actions";

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const sufixo = randomUUID().slice(0, 8);
const servico = criarCliente<Database>(
  URL_LOCAL,
  chaveLocal("service_role"),
  opcoes
);

type Linha = { id: string; texto: string; ativa: boolean; criada_em: Date };

let banco: Client;
let adminId = "";
let anteriorId = "";
// A tabela da cartilha é global (config da Repply): o teste guarda o estado
// dela antes e devolve tudo como estava no fim.
let antes: { id: string; ativa: boolean }[] = [];

/** As versões que existem agora no banco, da mais nova para a mais antiga. */
async function versoesNoBanco() {
  const r = await banco.query<Linha>(
    `select id, texto, ativa, criada_em
       from public.mentor_cartilhas
      order by criada_em desc, id desc`
  );
  return r.rows;
}

beforeAll(async () => {
  banco = await conectarBanco();

  const email = `admin-${sufixo}@teste.repply.local`;
  const senha = `senha-${randomUUID()}`;
  const criado = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (criado.error || !criado.data.user) throw new Error("sem login de teste");
  adminId = criado.data.user.id;
  sessao.adminId = adminId;
  await banco.query("insert into public.admins_repply (user_id) values ($1)", [
    adminId,
  ]);
  const admin = criarCliente<Database>(URL_LOCAL, chaveLocal("anon"), opcoes);
  const entrada = await admin.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (entrada.error) throw new Error("o login de teste não entrou");
  clientes.admin = admin;
  clientes.servico = servico;

  const estadoAntes = await banco.query<{ id: string; ativa: boolean }>(
    "select id, ativa from public.mentor_cartilhas"
  );
  antes = estadoAntes.rows;

  // Uma versão ANTERIOR ativa, além da semente: a limpeza tem de pegar as duas.
  const anterior = await banco.query<{ id: string }>(
    `insert into public.mentor_cartilhas (texto, ativa, criada_por)
     values ($1, true, $2) returning id`,
    [`Versão anterior do teste ${sufixo}`, adminId]
  );
  anteriorId = anterior.rows[0]?.id ?? "";
});

afterAll(async () => {
  try {
    if (!banco) return;
    // Apaga o que o teste criou (antes de apagar o login: criada_por é
    // `on delete set null`) e devolve a ativa de cada versão que já existia.
    await banco.query(
      "delete from public.mentor_cartilhas where criada_por = $1",
      [adminId]
    );
    for (const { id, ativa } of antes) {
      await banco.query(
        "update public.mentor_cartilhas set ativa = $2 where id = $1",
        [id, ativa]
      );
    }
    const contas = await banco.query<{ id: string }>(
      "select id from auth.users where email like $1",
      [`%-${sufixo}@teste.repply.local`]
    );
    for (const { id } of contas.rows) await servico.auth.admin.deleteUser(id);
  } finally {
    await banco?.end();
  }
});

describe("salvar a cartilha contra o banco", () => {
  it("a nova fica ativa e TODAS as anteriores ficam inativas (conferido pelo banco)", async () => {
    const antesDoSalvar = await versoesNoBanco();
    // Cenário: a semente e a versão anterior do teste estão ativas.
    expect(antesDoSalvar.filter((v) => v.ativa).length).toBeGreaterThanOrEqual(
      2
    );

    const r = await salvarCartilhaAction(`  Cartilha nova ${sufixo}  \n`);
    expect(r).toEqual({ ok: true });

    const depois = await versoesNoBanco();
    const nova = depois.find((v) => v.texto === `Cartilha nova ${sufixo}`);
    expect(nova).toBeDefined();
    expect(nova?.ativa).toBe(true);
    // Só ela ativa; cada versão que existia antes continua lá, agora inativa.
    expect(depois.filter((v) => v.ativa).map((v) => v.id)).toEqual([nova?.id]);
    expect(depois).toHaveLength(antesDoSalvar.length + 1);
    for (const velha of antesDoSalvar) {
      expect(depois.find((v) => v.id === velha.id)?.ativa).toBe(false);
    }
    expect(depois.find((v) => v.id === anteriorId)?.ativa).toBe(false);

    // Quem salvou fica registrado.
    const autoria = await banco.query<{ criada_por: string }>(
      "select criada_por from public.mentor_cartilhas where id = $1",
      [nova?.id]
    );
    expect(autoria.rows[0]?.criada_por).toBe(adminId);

    // E o cérebro do mentor já lê o texto novo.
    const doCerebro = await servico.rpc("mentor_cartilha_ativa");
    expect(doCerebro.error).toBeNull();
    expect(doCerebro.data).toBe(`Cartilha nova ${sufixo}`);
  });

  it("salvar outra vez mantém uma só ativa (a mais nova), sem apagar nenhuma versão", async () => {
    const antesDoSalvar = await versoesNoBanco();

    const r = await salvarCartilhaAction(`Cartilha mais nova ${sufixo}`);
    expect(r).toEqual({ ok: true });

    const depois = await versoesNoBanco();
    expect(depois).toHaveLength(antesDoSalvar.length + 1);
    expect(depois[0]?.texto).toBe(`Cartilha mais nova ${sufixo}`);
    expect(depois.filter((v) => v.ativa).map((v) => v.id)).toEqual([
      depois[0]?.id,
    ]);
  });
});

describe("o histórico e a ativa pelo cliente do admin (a RLS libera o admin)", () => {
  it("cartilhaAtiva devolve a que acabou de ser salva", async () => {
    const ativa = await cartilhaAtiva();

    expect(ativa?.texto).toBe(`Cartilha mais nova ${sufixo}`);
  });

  it("historicoCartilhas devolve da mais nova para a mais antiga, só a mais nova ativa, e inclui as antigas", async () => {
    const historico = await historicoCartilhas();

    const nossas = historico.filter((v) => v.texto.includes(sufixo));
    expect(nossas.map((v) => v.texto)).toEqual([
      `Cartilha mais nova ${sufixo}`,
      `Cartilha nova ${sufixo}`,
      `Versão anterior do teste ${sufixo}`,
    ]);
    expect(nossas.map((v) => v.ativa)).toEqual([true, false, false]);
    // O histórico vem pelo banco na ordem certa, e a primeira é a que vale.
    const instantes = historico.map((v) => new Date(v.criada_em).getTime());
    expect(instantes).toEqual([...instantes].sort((a, b) => b - a));
    expect(historico[0]?.id).toBe((await cartilhaAtiva())?.id);
    expect(historico.length).toBeLessThanOrEqual(20);
  });
});
