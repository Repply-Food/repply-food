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

const { sessao, clientes, createClient, logError } = vi.hoisted(() => {
  const clientes = { atual: null as unknown };
  return {
    sessao: { recusar: false, chamadas: 0 },
    clientes,
    createClient: vi.fn(async () => clientes.atual),
    logError: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/sessao", () => ({
  exigirAdmin: async () => {
    sessao.chamadas += 1;
    if (sessao.recusar) throw new Error("NEXT_REDIRECT");
    return { userId: "admin", ehAdmin: true };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
// O log de verdade imprime no console: aqui ele é espiado, e a regra "log só com
// o código" (D-29) passa a ser afirmada em vez de só aparecer na saída.
vi.mock("@/lib/logger", () => ({ logError }));

import {
  MAXIMO_DE_CONVERSAS_NO_ADMIN,
  conversaParaAdmin,
  conversasParaAdmin,
} from "@/lib/mentor/leitura";

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

/**
 * Um cliente de mentira que devolve `quantas` conversas (já na ordem do banco)
 * e guarda o teto que a leitura pediu: assim o teste prova o "um a mais" sem
 * semear 100 conversas num banco compartilhado.
 */
function clienteComConversas(quantas: number) {
  const tetosPedidos: number[] = [];
  const linhas = Array.from({ length: quantas }, (_, i) => ({
    id: `conversa-${i}`,
    titulo: `Conversa ${i}`,
    ultima_em: "2099-06-01T12:00:00Z",
    restaurantes: { id: "casa", nome: "Casa", fuso: "America/Sao_Paulo" },
    mentor_mensagens: [{ id: `mensagem-${i}` }],
  }));
  const consulta = {
    select: () => consulta,
    order: () => consulta,
    // O `.limit(n)` do pai guarda o teto; o `.limit(1, { referencedTable })` da
    // tabela filha é o último da cadeia da leitura e é quem responde.
    limit: (teto: number, opcoesDoLimite?: object) => {
      if (!opcoesDoLimite) {
        tetosPedidos.push(teto);
        return consulta;
      }
      return Promise.resolve({ data: linhas, error: null });
    },
  };
  return { cliente: { from: () => consulta }, tetosPedidos };
}

let banco: Client;
let casaA = "";
let casaB = "";
let conversaAntigaDeA = "";
let conversaDoMeioDeB = "";
let conversaOrfaDeA = "";
let conversaRecenteDeA = "";

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

  // A conversa da casa B fica no MEIO, entre duas da casa A (A, B, A no
  // tempo): um agrupamento por casa daria A, A, B e quebraria o teste. O admin
  // lê as duas casas numa ordem só, a do tempo.
  conversaDoMeioDeB = await conversa(
    casaB,
    "Do meio da casa B",
    "2099-01-02T12:00:05Z"
  );
  await mensagem(
    conversaDoMeioDeB,
    casaB,
    "dono",
    "pergunta da casa B",
    "2099-01-02T12:00:00Z"
  );

  conversaRecenteDeA = await conversa(
    casaA,
    "Recente da casa A",
    "2099-01-03T12:00:05Z"
  );
  // Inseridas fora de ordem de propósito: a leitura ordena por criada_em.
  await mensagem(
    conversaRecenteDeA,
    casaA,
    "mentor",
    "segunda fala",
    "2099-01-03T12:00:05Z"
  );
  await mensagem(
    conversaRecenteDeA,
    casaA,
    "dono",
    "primeira fala",
    "2099-01-03T12:00:00Z"
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
  createClient.mockClear();
  logError.mockClear();
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
    const { conversas } = await conversasParaAdmin();
    const meus = new Set([
      conversaAntigaDeA,
      conversaDoMeioDeB,
      conversaOrfaDeA,
      conversaRecenteDeA,
    ]);

    // B no meio, entre duas de A: só uma ordem pelo tempo (e não por casa) passa.
    expect(conversas.map((c) => c.id).filter((id) => meus.has(id))).toEqual([
      conversaRecenteDeA,
      conversaDoMeioDeB,
      conversaAntigaDeA,
    ]);
    expect(conversas.map((c) => c.id)).not.toContain(conversaOrfaDeA);
  });

  it("traz a casa de cada conversa (só o que a tela usa), para mostrar de quem é", async () => {
    const { conversas } = await conversasParaAdmin();
    const deB = conversas.find((c) => c.id === conversaDoMeioDeB);
    const deA = conversas.find((c) => c.id === conversaRecenteDeA);

    expect(deB).toEqual({
      id: conversaDoMeioDeB,
      titulo: "Do meio da casa B",
      ultima_em: expect.any(String),
      casa: { id: casaB, nome: "Casa B do admin", fuso: "America/Manaus" },
    });
    expect(deA?.casa).toEqual({
      id: casaA,
      nome: "Casa A do admin",
      fuso: "America/Sao_Paulo",
    });
  });

  it("confere que quem pede é admin, antes de ler", async () => {
    await conversasParaAdmin();
    expect(sessao.chamadas).toBe(1);
  });

  it("quem não é admin é barrado ANTES de tocar o banco", async () => {
    sessao.recusar = true;

    await expect(conversasParaAdmin()).rejects.toThrow("NEXT_REDIRECT");
    expect(sessao.chamadas).toBe(1);
    // Sem cliente do banco criado, a leitura nem começou.
    expect(createClient).not.toHaveBeenCalled();
  });

  it("falha de leitura vira erro, nunca lista vazia, e o log leva só o código", async () => {
    const bom = clientes.atual;
    clientes.atual = clienteQueFalha();
    try {
      await expect(conversasParaAdmin()).rejects.toThrow(
        "falha_leitura_mentor"
      );
    } finally {
      clientes.atual = bom;
    }
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith("falha_leitura_mentor");
  });

  describe("o teto da lista", () => {
    const comClienteDeMentira = async (quantas: number) => {
      const { cliente, tetosPedidos } = clienteComConversas(quantas);
      const bom = clientes.atual;
      clientes.atual = cliente;
      try {
        return { ...(await conversasParaAdmin()), tetosPedidos };
      } finally {
        clientes.atual = bom;
      }
    };

    it("pede ao banco UMA a mais que o teto, para saber se há conversas fora da lista", async () => {
      const { tetosPedidos } = await comClienteDeMentira(0);

      expect(tetosPedidos).toEqual([MAXIMO_DE_CONVERSAS_NO_ADMIN + 1]);
    });

    it("com exatamente o teto de conversas, devolve todas e NÃO diz que há mais", async () => {
      const { conversas, haMais } = await comClienteDeMentira(
        MAXIMO_DE_CONVERSAS_NO_ADMIN
      );

      expect(conversas).toHaveLength(MAXIMO_DE_CONVERSAS_NO_ADMIN);
      expect(haMais).toBe(false);
    });

    it("com uma a mais que o teto, devolve só o teto (as mais recentes) e diz que há mais", async () => {
      const { conversas, haMais } = await comClienteDeMentira(
        MAXIMO_DE_CONVERSAS_NO_ADMIN + 1
      );

      expect(conversas).toHaveLength(MAXIMO_DE_CONVERSAS_NO_ADMIN);
      expect(conversas[0]?.id).toBe("conversa-0");
      expect(conversas.at(-1)?.id).toBe(
        `conversa-${MAXIMO_DE_CONVERSAS_NO_ADMIN - 1}`
      );
      expect(haMais).toBe(true);
    });

    it("com poucas conversas, não diz que há mais", async () => {
      const { conversas, haMais } = await comClienteDeMentira(3);

      expect(conversas).toHaveLength(3);
      expect(haMais).toBe(false);
    });
  });
});

describe("conversaParaAdmin", () => {
  it("devolve a conversa com a casa e as mensagens em ordem de criação", async () => {
    const detalhe = await conversaParaAdmin(conversaRecenteDeA);

    expect(detalhe).toEqual({
      id: conversaRecenteDeA,
      titulo: "Recente da casa A",
      ultima_em: expect.any(String),
      casa: { id: casaA, nome: "Casa A do admin", fuso: "America/Sao_Paulo" },
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
    const detalhe = await conversaParaAdmin(conversaDoMeioDeB);

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

  it("quem não é admin é barrado ANTES de tocar o banco", async () => {
    sessao.recusar = true;

    await expect(conversaParaAdmin(conversaRecenteDeA)).rejects.toThrow(
      "NEXT_REDIRECT"
    );
    expect(sessao.chamadas).toBe(1);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("quem não é admin é barrado mesmo com um id que não é uuid, nunca recebe 'não encontrada'", async () => {
    sessao.recusar = true;

    // O atalho do id inválido devolveria nulo (a página viraria 404); o guarda
    // tem de vir antes dele.
    await expect(conversaParaAdmin("nao-e-um-uuid")).rejects.toThrow(
      "NEXT_REDIRECT"
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("falha de leitura vira erro, nunca conversa vazia, e o log leva só o código", async () => {
    const bom = clientes.atual;
    clientes.atual = clienteQueFalha();
    try {
      await expect(conversaParaAdmin(conversaRecenteDeA)).rejects.toThrow(
        "falha_leitura_mentor"
      );
    } finally {
      clientes.atual = bom;
    }
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith("falha_leitura_mentor");
  });
});
