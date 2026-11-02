// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";
import { conectarBanco } from "../helpers/supabase-local";

// A leitura da tela do mentor contra o banco local, com um login de dono de
// verdade: a lista de conversas IGNORA conversa sem mensagem (a gravação do
// cérebro faz a conversa e as mensagens em dois comandos, e uma conversa vazia
// órfã não pode aparecer), e nada de outra casa entra.

const { clienteDoDono } = vi.hoisted(() => ({
  clienteDoDono: { atual: null as unknown },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => clienteDoDono.atual,
}));

import { conversasDaCasa, mensagensDaConversa } from "@/lib/mentor/leitura";

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const sufixo = randomUUID().slice(0, 8);
const servico = criarCliente<Database>(
  URL_LOCAL,
  chaveLocal("service_role"),
  opcoes
);

let banco: Client;
let casaA = "";
let casaB = "";
let conversaAntiga = "";
let conversaNova = "";
let conversaOrfa = "";
let conversaDeB = "";

beforeAll(async () => {
  banco = await conectarBanco();
  const casas = await banco.query<{ id: string }>(
    `insert into public.restaurantes (slug, nome)
     values ($1, 'Casa A da leitura'), ($2, 'Casa B da leitura')
     returning id`,
    [`leitura-a-${sufixo}`, `leitura-b-${sufixo}`]
  );
  [casaA, casaB] = casas.rows.map((linha) => linha.id) as [string, string];

  const email = `dono-${sufixo}@teste.repply.local`;
  const senha = `senha-${randomUUID()}`;
  const criado = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (criado.error || !criado.data.user) throw new Error("sem login de teste");
  const cliente = criarCliente<Database>(URL_LOCAL, chaveLocal("anon"), opcoes);
  const entrada = await cliente.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (entrada.error) throw new Error("o login de teste não entrou");
  clienteDoDono.atual = cliente;
  await banco.query(
    "insert into public.acessos (user_id, restaurante_id) values ($1, $2)",
    [criado.data.user.id, casaA]
  );

  const conversa = async (casa: string, titulo: string, ultima: string) => {
    const r = await banco.query<{ id: string }>(
      `insert into public.mentor_conversas (restaurante_id, titulo, criada_em, ultima_em)
       values ($1, $2, $3, $3) returning id`,
      [casa, titulo, ultima]
    );
    return r.rows[0]?.id ?? "";
  };
  const mensagem = (
    conversaId: string,
    casa: string,
    papel: "dono" | "mentor",
    texto: string,
    quando: string
  ) =>
    banco.query(
      `insert into public.mentor_mensagens (conversa_id, restaurante_id, papel, texto, criada_em)
       values ($1, $2, $3, $4, $5)`,
      [conversaId, casa, papel, texto, quando]
    );

  conversaAntiga = await conversa(
    casaA,
    "Conversa antiga",
    "2026-10-20T12:00:05Z"
  );
  await mensagem(
    conversaAntiga,
    casaA,
    "dono",
    "pergunta antiga",
    "2026-10-20T12:00:00Z"
  );
  await mensagem(
    conversaAntiga,
    casaA,
    "mentor",
    "resposta antiga",
    "2026-10-20T12:00:05Z"
  );

  conversaNova = await conversa(casaA, "Conversa nova", "2026-10-28T12:00:05Z");
  // Inseridas fora de ordem de propósito: a leitura ordena por criada_em.
  await mensagem(
    conversaNova,
    casaA,
    "mentor",
    "segunda fala",
    "2026-10-28T12:00:05Z"
  );
  await mensagem(
    conversaNova,
    casaA,
    "dono",
    "primeira fala",
    "2026-10-28T12:00:00Z"
  );

  // A mais recente de todas, mas sem nenhuma mensagem: sobra de gravação pela metade.
  conversaOrfa = await conversa(
    casaA,
    "Conversa vazia órfã",
    "2026-10-29T12:00:00Z"
  );

  conversaDeB = await conversa(
    casaB,
    "Conversa da casa B",
    "2026-10-29T13:00:00Z"
  );
  await mensagem(
    conversaDeB,
    casaB,
    "dono",
    "pergunta da casa B",
    "2026-10-29T13:00:00Z"
  );
});

afterAll(async () => {
  try {
    if (!banco) return;
    await banco.query("delete from public.restaurantes where slug like $1", [
      `%${sufixo}%`,
    ]);
    const contas = await banco.query<{ id: string }>(
      "select id from auth.users where email like $1",
      [`%-${sufixo}@teste.repply.local`]
    );
    for (const { id } of contas.rows) await servico.auth.admin.deleteUser(id);
  } finally {
    await banco?.end();
  }
});

describe("conversasDaCasa", () => {
  it("lista da mais recente para a mais antiga e IGNORA a conversa sem mensagem", async () => {
    const lista = await conversasDaCasa(casaA);

    expect(lista.map((c) => c.id)).toEqual([conversaNova, conversaAntiga]);
    expect(lista.map((c) => c.id)).not.toContain(conversaOrfa);
    expect(lista[0]).toEqual({
      id: conversaNova,
      titulo: "Conversa nova",
      ultima_em: expect.any(String),
    });
  });

  it("não traz conversa de outra casa, mesmo pedindo pelo id dela", async () => {
    // O dono de A não tem acesso a B: a RLS barra e o filtro por casa também.
    expect(await conversasDaCasa(casaB)).toEqual([]);
  });
});

describe("mensagensDaConversa", () => {
  it("devolve as mensagens em ordem de criação, com o papel de quem falou", async () => {
    const mensagens = await mensagensDaConversa(conversaNova, casaA);

    expect(mensagens.map((m) => [m.papel, m.texto])).toEqual([
      ["dono", "primeira fala"],
      ["mentor", "segunda fala"],
    ]);
    expect(mensagens[0]).toEqual({
      id: expect.any(String),
      papel: "dono",
      texto: "primeira fala",
      criada_em: expect.any(String),
    });
  });

  it("filtra pela casa: uma conversa de B pedida com o id de A vem vazia", async () => {
    expect(await mensagensDaConversa(conversaDeB, casaA)).toEqual([]);
  });

  it("conversa sem mensagem devolve lista vazia", async () => {
    expect(await mensagensDaConversa(conversaOrfa, casaA)).toEqual([]);
  });
});
