// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";
import { conectarBanco } from "../helpers/supabase-local";

// A leitura dos anexos do mentor contra o banco local, com um login de dono
// de verdade: a lista filtra pela conversa E pela casa (filtro duplo sobre a
// RLS, como as mensagens), e nada de outra casa entra — mesmo com o id do
// anexo ou da conversa na mão.

const { clienteDoDono } = vi.hoisted(() => ({
  clienteDoDono: { atual: null as unknown },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => clienteDoDono.atual,
}));

import { anexosDaConversa } from "@/lib/mentor/leitura";

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
let conversaA = "";
let conversaB = "";
let conversaVazia = "";

const ANEXO_A1 = {
  id: "a1111111-1111-4111-8111-111111111111",
  nome: "cardapio.png",
  tipo: "imagem",
  tamanho: 204_800,
  quando: "2026-11-03T14:30:00Z",
};
const ANEXO_A2 = {
  id: "a2222222-2222-4222-8222-222222222222",
  nome: "fechamento.pdf",
  tipo: "pdf",
  tamanho: 1_572_864,
  quando: "2026-11-03T14:31:00Z",
};

beforeAll(async () => {
  banco = await conectarBanco();
  const casas = await banco.query<{ id: string }>(
    `insert into public.restaurantes (slug, nome)
     values ($1, 'Casa A dos anexos'), ($2, 'Casa B dos anexos')
     returning id`,
    [`anexos-a-${sufixo}`, `anexos-b-${sufixo}`]
  );
  [casaA, casaB] = casas.rows.map((linha) => linha.id) as [string, string];

  const email = `dono-anexos-${sufixo}@teste.repply.local`;
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

  const conversa = async (casa: string, titulo: string) => {
    const r = await banco.query<{ id: string }>(
      `insert into public.mentor_conversas (restaurante_id, titulo)
       values ($1, $2) returning id`,
      [casa, titulo]
    );
    return r.rows[0]?.id ?? "";
  };
  const anexo = (
    id: string,
    casa: string,
    conversaId: string | null,
    nome: string,
    tipo: string,
    tamanho: number,
    quando: string
  ) =>
    banco.query(
      `insert into public.mentor_anexos
         (id, restaurante_id, conversa_id, nome_original, tipo, tamanho_bytes, caminho, criada_em)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, casa, conversaId, nome, tipo, tamanho, `${sufixo}/${id}`, quando]
    );

  conversaA = await conversa(casaA, "Conversa com anexos");
  conversaB = await conversa(casaB, "Conversa da casa B");
  conversaVazia = await conversa(casaA, "Conversa sem anexo");

  // Inseridos fora de ordem de propósito: a leitura ordena por criada_em.
  await anexo(
    ANEXO_A2.id,
    casaA,
    conversaA,
    ANEXO_A2.nome,
    ANEXO_A2.tipo,
    ANEXO_A2.tamanho,
    ANEXO_A2.quando
  );
  await anexo(
    ANEXO_A1.id,
    casaA,
    conversaA,
    ANEXO_A1.nome,
    ANEXO_A1.tipo,
    ANEXO_A1.tamanho,
    ANEXO_A1.quando
  );
  await anexo(
    randomUUID(),
    casaB,
    conversaB,
    "segredo-da-casa-b.png",
    "imagem",
    100,
    "2026-11-03T14:30:00Z"
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

describe("anexosDaConversa", () => {
  it("lista os anexos da conversa, do mais antigo para o mais recente", async () => {
    const lista = await anexosDaConversa(conversaA, casaA);

    expect(lista.map((a) => a.id)).toEqual([ANEXO_A1.id, ANEXO_A2.id]);
    expect(lista[0]).toEqual({
      id: ANEXO_A1.id,
      nome: ANEXO_A1.nome,
      tipo: ANEXO_A1.tipo,
      tamanho_bytes: ANEXO_A1.tamanho,
      criada_em: expect.any(String),
    });
  });

  it("não traz anexo de outra conversa nem de outra casa", async () => {
    // O dono de A pede a conversa de B com a casa dele: filtro duplo + RLS.
    expect(await anexosDaConversa(conversaB, casaA)).toEqual([]);
    expect(await anexosDaConversa(conversaA, casaB)).toEqual([]);
  });

  it("conversa sem anexo devolve lista vazia, sem erro", async () => {
    expect(await anexosDaConversa(conversaVazia, casaA)).toEqual([]);
  });

  it("conversa que não existe devolve lista vazia, sem erro", async () => {
    expect(await anexosDaConversa(randomUUID(), casaA)).toEqual([]);
  });
});
