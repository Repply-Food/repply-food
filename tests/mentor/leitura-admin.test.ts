// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";
import { conectarBanco } from "../helpers/supabase-local";

// A leitura do admin sobre as conversas do mentor, contra o banco local, com um
// admin de verdade (login + linha em admins_repply): ele lê as conversas de
// QUALQUER casa pela RLS de leitura (D-38), na ordem certa, sem a conversa órfã
// (sem mensagem). Só a camada de sessão é trocada (quem é o admin) e o
// `server-only`, que não existem fora do servidor do Next.
//
// O banco local é compartilhado com outras suítes (que também semeiam
// conversas): as conversas deste teste ficam em 2099, para ocupar o topo da
// lista, e as afirmações olham só os ids semeados aqui.

const { sessao, clientes } = vi.hoisted(() => ({
  sessao: { recusar: false, chamadas: 0 },
  clientes: { atual: null as unknown },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({
  exigirAdmin: async () => {
    sessao.chamadas += 1;
    if (sessao.recusar) throw new Error("NEXT_REDIRECT");
    return { userId: "admin", ehAdmin: true };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => clientes.atual,
}));

import { conversaParaAdmin, conversasParaAdmin } from "@/lib/mentor/leitura";

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const sufixo = randomUUID().slice(0, 8);
const servico = criarCliente<Database>(
  URL_LOCAL,
  chaveLocal("service_role"),
  opcoes
);

/** Um cliente de verdade cujo servidor responde erro na hora (sem esperar a rede). */
function clienteQueFalha() {
  return criarCliente<Database>(URL_LOCAL, chaveLocal("anon"), {
    ...opcoes,
    global: {
      fetch: async () =>
        new Response(JSON.stringify({ code: "XX000", message: "falhou" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    },
  });
}

let banco: Client;
let casaA = "";
let casaB = "";
let conversaAntigaDeA = "";
let conversaRecenteDeB = "";
let conversaOrfaDeA = "";
let conversaDoMeioDeA = "";

beforeAll(async () => {
  banco = await conectarBanco();
  const casas = await banco.query<{ id: string }>(
    `insert into public.restaurantes (slug, nome, fuso)
     values ($1, 'Casa A do admin', 'America/Sao_Paulo'),
            ($2, 'Casa B do admin', 'America/Manaus')
     returning id`,
    [`admin-a-${sufixo}`, `admin-b-${sufixo}`]
  );
  [casaA, casaB] = casas.rows.map((linha) => linha.id) as [string, string];

  // Um admin de verdade, sem acesso a nenhuma das duas casas (só a RLS do admin).
  const email = `admin-${sufixo}@teste.repply.local`;
  const senha = `senha-${randomUUID()}`;
  const criado = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (criado.error || !criado.data.user) throw new Error("sem login de teste");
  await banco.query("insert into public.admins_repply (user_id) values ($1)", [
    criado.data.user.id,
  ]);
  const cliente = criarCliente<Database>(URL_LOCAL, chaveLocal("anon"), opcoes);
  const entrada = await cliente.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (entrada.error) throw new Error("o login de teste não entrou");
  clientes.atual = cliente;

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

  conversaAntigaDeA = await conversa(
    casaA,
    "Antiga da casa A",
    "2099-01-01T12:00:05Z"
  );
  await mensagem(
    conversaAntigaDeA,
    casaA,
    "dono",
    "pergunta antiga",
    "2099-01-01T12:00:00Z"
  );
  await mensagem(
    conversaAntigaDeA,
    casaA,
    "mentor",
    "resposta antiga",
    "2099-01-01T12:00:05Z"
  );

  // A conversa da casa B fica no MEIO: o admin lê as duas casas numa ordem só.
  conversaRecenteDeB = await conversa(
    casaB,
    "Recente da casa B",
    "2099-01-03T12:00:05Z"
  );
  await mensagem(
    conversaRecenteDeB,
    casaB,
    "dono",
    "pergunta da casa B",
    "2099-01-03T12:00:00Z"
  );

  conversaDoMeioDeA = await conversa(
    casaA,
    "Do meio da casa A",
    "2099-01-02T12:00:05Z"
  );
  // Inseridas fora de ordem de propósito: a leitura ordena por criada_em.
  await mensagem(
    conversaDoMeioDeA,
    casaA,
    "mentor",
    "segunda fala",
    "2099-01-02T12:00:05Z"
  );
  await mensagem(
    conversaDoMeioDeA,
    casaA,
    "dono",
    "primeira fala",
    "2099-01-02T12:00:00Z"
  );

  // A mais recente de todas, mas sem nenhuma mensagem: sobra de gravação pela metade.
  conversaOrfaDeA = await conversa(
    casaA,
    "Órfã da casa A",
    "2099-01-04T12:00:00Z"
  );
});

beforeEach(() => {
  sessao.recusar = false;
  sessao.chamadas = 0;
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

describe("conversasParaAdmin", () => {
  it("lê as conversas de AMBAS as casas, da mais recente para a mais antiga, sem a órfã", async () => {
    const lista = await conversasParaAdmin();
    const meus = new Set([
      conversaAntigaDeA,
      conversaRecenteDeB,
      conversaOrfaDeA,
      conversaDoMeioDeA,
    ]);

    expect(lista.map((c) => c.id).filter((id) => meus.has(id))).toEqual([
      conversaRecenteDeB,
      conversaDoMeioDeA,
      conversaAntigaDeA,
    ]);
    expect(lista.map((c) => c.id)).not.toContain(conversaOrfaDeA);
  });

  it("traz a casa de cada conversa, para a tela mostrar de quem é", async () => {
    const lista = await conversasParaAdmin();
    const deB = lista.find((c) => c.id === conversaRecenteDeB);
    const deA = lista.find((c) => c.id === conversaDoMeioDeA);

    expect(deB).toEqual({
      id: conversaRecenteDeB,
      titulo: "Recente da casa B",
      ultima_em: expect.any(String),
      casa: {
        id: casaB,
        slug: `admin-b-${sufixo}`,
        nome: "Casa B do admin",
        fuso: "America/Manaus",
      },
    });
    expect(deA?.casa).toEqual({
      id: casaA,
      slug: `admin-a-${sufixo}`,
      nome: "Casa A do admin",
      fuso: "America/Sao_Paulo",
    });
  });

  it("confere que quem pede é admin, antes de ler", async () => {
    await conversasParaAdmin();
    expect(sessao.chamadas).toBe(1);

    sessao.recusar = true;
    await expect(conversasParaAdmin()).rejects.toThrow("NEXT_REDIRECT");
  });

  it("falha de leitura vira erro, nunca lista vazia", async () => {
    const bom = clientes.atual;
    clientes.atual = clienteQueFalha();
    try {
      await expect(conversasParaAdmin()).rejects.toThrow(
        "falha_leitura_mentor"
      );
    } finally {
      clientes.atual = bom;
    }
  });
});

describe("conversaParaAdmin", () => {
  it("devolve a conversa com a casa e as mensagens em ordem de criação", async () => {
    const detalhe = await conversaParaAdmin(conversaDoMeioDeA);

    expect(detalhe).toEqual({
      id: conversaDoMeioDeA,
      titulo: "Do meio da casa A",
      ultima_em: expect.any(String),
      casa: {
        id: casaA,
        slug: `admin-a-${sufixo}`,
        nome: "Casa A do admin",
        fuso: "America/Sao_Paulo",
      },
      mensagens: [
        {
          id: expect.any(String),
          papel: "dono",
          texto: "primeira fala",
          criada_em: expect.any(String),
        },
        {
          id: expect.any(String),
          papel: "mentor",
          texto: "segunda fala",
          criada_em: expect.any(String),
        },
      ],
    });
  });

  it("lê a conversa da casa B com a casa dela, não a de outra", async () => {
    const detalhe = await conversaParaAdmin(conversaRecenteDeB);

    expect(detalhe?.casa.id).toBe(casaB);
    expect(detalhe?.mensagens.map((m) => [m.papel, m.texto])).toEqual([
      ["dono", "pergunta da casa B"],
    ]);
  });

  it("a conversa sem mensagem abre vazia, para a tela dizer isso", async () => {
    const detalhe = await conversaParaAdmin(conversaOrfaDeA);

    expect(detalhe?.id).toBe(conversaOrfaDeA);
    expect(detalhe?.mensagens).toEqual([]);
  });

  it("devolve nulo para conversa que não existe ou id que não é um uuid", async () => {
    expect(await conversaParaAdmin(randomUUID())).toBeNull();
    expect(await conversaParaAdmin("nao-e-um-uuid")).toBeNull();
  });

  it("confere que quem pede é admin, antes de ler", async () => {
    sessao.recusar = true;
    await expect(conversaParaAdmin(conversaDoMeioDeA)).rejects.toThrow(
      "NEXT_REDIRECT"
    );
  });

  it("falha de leitura vira erro, nunca conversa vazia", async () => {
    const bom = clientes.atual;
    clientes.atual = clienteQueFalha();
    try {
      await expect(conversaParaAdmin(conversaDoMeioDeA)).rejects.toThrow(
        "falha_leitura_mentor"
      );
    } finally {
      clientes.atual = bom;
    }
  });
});
