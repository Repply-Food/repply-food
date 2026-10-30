// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";
import { conectarBanco } from "../helpers/supabase-local";

// Isolamento das conversas do mentor contra o banco local, com logins reais:
// a regra de segurança do banco é que decide, não o código do app.
// Leitura barrada pela RLS devolve ZERO linhas (sem erro); escrita barrada
// devolve erro de permissão ou zero linhas afetadas. Em todos os casos o teste
// confere a CONTAGEM e, quando muda dado, relê pelo banco: zero linhas
// afetadas não é sucesso.

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const sufixo = randomUUID().slice(0, 8);
const servico = criarCliente<Database>(
  URL_LOCAL,
  chaveLocal("service_role"),
  opcoes
);

function novoCliente() {
  return criarCliente<Database>(URL_LOCAL, chaveLocal("anon"), opcoes);
}
type Cliente = ReturnType<typeof novoCliente>;

/** Cria o login no Auth local e entra com ele (signInWithPassword de verdade). */
async function criarLoginLogado(quem: string) {
  const email = `${quem}-${sufixo}@teste.repply.local`;
  const senha = `senha-${randomUUID()}`;
  const { data, error } = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`não criou o login de teste ${quem}`);
  const cliente = novoCliente();
  const entrada = await cliente.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (entrada.error) throw new Error(`o login de teste ${quem} não entrou`);
  return { id: data.user.id, cliente };
}

let banco: Client;
let casaA = "";
let casaB = "";
let donoA: Cliente;
let donoB: Cliente;
let admin: Cliente;
// Semeados direto no banco, como dono do banco, antes dos testes.
let conversaA = "";
let conversaB = "";
let mensagemA = "";
let mensagemB = "";

beforeAll(async () => {
  banco = await conectarBanco();
  const casas = await banco.query<{ id: string }>(
    `insert into public.restaurantes (slug, nome)
     values ($1, 'Casa A do mentor'), ($2, 'Casa B do mentor')
     returning id`,
    [`mentor-a-${sufixo}`, `mentor-b-${sufixo}`]
  );
  [casaA, casaB] = casas.rows.map((linha) => linha.id) as [string, string];

  const loginA = await criarLoginLogado("dono-a");
  const loginB = await criarLoginLogado("dono-b");
  const loginAdmin = await criarLoginLogado("admin");
  donoA = loginA.cliente;
  donoB = loginB.cliente;
  admin = loginAdmin.cliente;
  await banco.query(
    "insert into public.acessos (user_id, restaurante_id) values ($1, $2), ($3, $4)",
    [loginA.id, casaA, loginB.id, casaB]
  );
  await banco.query("insert into public.admins_repply (user_id) values ($1)", [
    loginAdmin.id,
  ]);

  const semear = async (casa: string, titulo: string, texto: string) => {
    const conversa = await banco.query<{ id: string }>(
      "insert into public.mentor_conversas (restaurante_id, titulo) values ($1, $2) returning id",
      [casa, titulo]
    );
    const conversaId = conversa.rows[0]?.id ?? "";
    const mensagem = await banco.query<{ id: string }>(
      `insert into public.mentor_mensagens (conversa_id, restaurante_id, papel, texto)
       values ($1, $2, 'dono', $3) returning id`,
      [conversaId, casa, texto]
    );
    return { conversaId, mensagemId: mensagem.rows[0]?.id ?? "" };
  };
  const a = await semear(casaA, "Conversa da casa A", "Pergunta da casa A");
  const b = await semear(casaB, "Conversa da casa B", "Pergunta da casa B");
  conversaA = a.conversaId;
  mensagemA = a.mensagemId;
  conversaB = b.conversaId;
  mensagemB = b.mensagemId;
});

afterAll(async () => {
  try {
    if (!banco) return;
    // As conversas e mensagens saem em cascata junto com a casa.
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

describe("o dono da casa lê e grava as próprias conversas do mentor", () => {
  it("o dono de A insere uma conversa e uma mensagem na casa A e lê de volta", async () => {
    const conversa = await donoA
      .from("mentor_conversas")
      .insert({ restaurante_id: casaA, titulo: "Como foi a semana?" })
      .select();
    expect(conversa.error).toBeNull();
    expect(conversa.data).toHaveLength(1);
    const novaConversa = conversa.data?.[0]?.id ?? "";
    expect(novaConversa).not.toBe("");

    const mensagem = await donoA
      .from("mentor_mensagens")
      .insert({
        conversa_id: novaConversa,
        restaurante_id: casaA,
        papel: "dono",
        texto: "Como foi o faturamento da semana?",
      })
      .select();
    expect(mensagem.error).toBeNull();
    expect(mensagem.data).toHaveLength(1);

    const lidaConversa = await donoA
      .from("mentor_conversas")
      .select("id, restaurante_id, titulo")
      .eq("id", novaConversa);
    expect(lidaConversa.error).toBeNull();
    expect(lidaConversa.data).toEqual([
      { id: novaConversa, restaurante_id: casaA, titulo: "Como foi a semana?" },
    ]);
    const lidaMensagem = await donoA
      .from("mentor_mensagens")
      .select("conversa_id, restaurante_id, papel, texto")
      .eq("conversa_id", novaConversa);
    expect(lidaMensagem.error).toBeNull();
    expect(lidaMensagem.data).toEqual([
      {
        conversa_id: novaConversa,
        restaurante_id: casaA,
        papel: "dono",
        texto: "Como foi o faturamento da semana?",
      },
    ]);

    // Sem filtro nenhum: o dono de A enxerga a semeada e a nova, só da casa A.
    const todas = await donoA
      .from("mentor_conversas")
      .select("id, restaurante_id");
    expect(todas.error).toBeNull();
    expect(todas.data?.length).toBeGreaterThanOrEqual(2);
    expect(todas.data?.every((linha) => linha.restaurante_id === casaA)).toBe(
      true
    );
    expect(todas.data?.map((linha) => linha.id)).toContain(conversaA);
    expect(todas.data?.map((linha) => linha.id)).not.toContain(conversaB);
  });

  it("o dono de A atualiza a própria conversa (1 linha afetada, conferida)", async () => {
    const resposta = await donoA
      .from("mentor_conversas")
      .update({ titulo: "Título novo", ultima_em: new Date().toISOString() })
      .eq("id", conversaA)
      .select();
    expect(resposta.error).toBeNull();
    expect(resposta.data).toHaveLength(1);
    const noBanco = await banco.query<{ titulo: string }>(
      "select titulo from public.mentor_conversas where id = $1",
      [conversaA]
    );
    expect(noBanco.rows[0]?.titulo).toBe("Título novo");
  });
});

describe("a RLS barra quem não tem acesso à casa A", () => {
  it("o dono de B consulta as conversas e mensagens de A e recebe 0 linhas", async () => {
    const porCasa = await donoB
      .from("mentor_conversas")
      .select("id")
      .eq("restaurante_id", casaA);
    expect(porCasa.error).toBeNull();
    expect(porCasa.data).toHaveLength(0);

    const porId = await donoB
      .from("mentor_conversas")
      .select("id")
      .eq("id", conversaA);
    expect(porId.error).toBeNull();
    expect(porId.data).toHaveLength(0);

    const mensagensPorCasa = await donoB
      .from("mentor_mensagens")
      .select("id")
      .eq("restaurante_id", casaA);
    expect(mensagensPorCasa.error).toBeNull();
    expect(mensagensPorCasa.data).toHaveLength(0);

    const mensagensPorConversa = await donoB
      .from("mentor_mensagens")
      .select("id")
      .eq("conversa_id", conversaA);
    expect(mensagensPorConversa.error).toBeNull();
    expect(mensagensPorConversa.data).toHaveLength(0);
  });

  it("sem filtro nenhum, o dono de B só enxerga a casa dele", async () => {
    const conversas = await donoB
      .from("mentor_conversas")
      .select("id, restaurante_id");
    expect(conversas.error).toBeNull();
    expect(conversas.data).toEqual([{ id: conversaB, restaurante_id: casaB }]);

    const mensagens = await donoB
      .from("mentor_mensagens")
      .select("id, restaurante_id");
    expect(mensagens.error).toBeNull();
    expect(mensagens.data).toEqual([{ id: mensagemB, restaurante_id: casaB }]);
  });

  it("o dono de B não escreve na casa A, nem aponta mensagem para a conversa dela", async () => {
    const conversa = await donoB
      .from("mentor_conversas")
      .insert({ restaurante_id: casaA, titulo: "invasão" });
    expect(conversa.error?.code).toBe("42501");

    const mensagemNaCasaA = await donoB.from("mentor_mensagens").insert({
      conversa_id: conversaA,
      restaurante_id: casaA,
      papel: "dono",
      texto: "invasão",
    });
    expect(mensagemNaCasaA.error?.code).toBe("42501");

    // Casa dele no restaurante_id, conversa alheia no conversa_id: a mensagem
    // ficaria pendurada numa conversa de outra casa.
    const mensagemPendurada = await donoB.from("mentor_mensagens").insert({
      conversa_id: conversaA,
      restaurante_id: casaB,
      papel: "dono",
      texto: "pendurada",
    });
    expect(mensagemPendurada.error?.code).toBe("42501");

    const alteraConversa = await donoB
      .from("mentor_conversas")
      .update({ titulo: "invadida" })
      .eq("id", conversaA)
      .select();
    expect(alteraConversa.error).toBeNull();
    expect(alteraConversa.data).toHaveLength(0);

    const alteraMensagem = await donoB
      .from("mentor_mensagens")
      .update({ texto: "invadida" })
      .eq("id", mensagemA)
      .select();
    expect(alteraMensagem.error).toBeNull();
    expect(alteraMensagem.data).toHaveLength(0);

    // Nada mudou na casa A, conferido pelo banco.
    const intrusas = await banco.query<{ total: number }>(
      `select
         (select count(*)::int from public.mentor_conversas
           where titulo in ('invasão', 'invadida'))
       + (select count(*)::int from public.mentor_mensagens
           where texto in ('invasão', 'invadida', 'pendurada')) as total`
    );
    expect(intrusas.rows[0]?.total).toBe(0);
    const titulo = await banco.query<{ titulo: string }>(
      "select titulo from public.mentor_conversas where id = $1",
      [conversaA]
    );
    expect(titulo.rows[0]?.titulo).not.toBe("invadida");
    const texto = await banco.query<{ texto: string }>(
      "select texto from public.mentor_mensagens where id = $1",
      [mensagemA]
    );
    expect(texto.rows[0]?.texto).toBe("Pergunta da casa A");
  });

  it("o dono de A não muda a casa de uma conversa (restaurante_id é imutável)", async () => {
    const resposta = await donoA
      .from("mentor_conversas")
      .update({ restaurante_id: casaB })
      .eq("id", conversaA)
      .select();
    expect(resposta.error).not.toBeNull();
    const noBanco = await banco.query<{ restaurante_id: string }>(
      "select restaurante_id from public.mentor_conversas where id = $1",
      [conversaA]
    );
    expect(noBanco.rows[0]?.restaurante_id).toBe(casaA);
  });

  it("quem não fez login não lê nem escreve", async () => {
    const anonimo = novoCliente();
    const leitura = await anonimo.from("mentor_conversas").select("id");
    expect(leitura.data ?? []).toHaveLength(0);
    expect(leitura.error?.code).toBe("42501");
    const leituraMensagens = await anonimo
      .from("mentor_mensagens")
      .select("id");
    expect(leituraMensagens.data ?? []).toHaveLength(0);
    expect(leituraMensagens.error?.code).toBe("42501");
    const escrita = await anonimo
      .from("mentor_conversas")
      .insert({ restaurante_id: casaA });
    expect(escrita.error?.code).toBe("42501");
  });
});

describe("o admin da Repply só lê", () => {
  it("o admin lê as conversas e mensagens da casa A (e de B)", async () => {
    const conversasA = await admin
      .from("mentor_conversas")
      .select("id")
      .eq("restaurante_id", casaA);
    expect(conversasA.error).toBeNull();
    expect(conversasA.data?.length).toBeGreaterThanOrEqual(1);
    expect(conversasA.data?.map((linha) => linha.id)).toContain(conversaA);

    const mensagensA = await admin
      .from("mentor_mensagens")
      .select("id")
      .eq("restaurante_id", casaA);
    expect(mensagensA.error).toBeNull();
    expect(mensagensA.data?.length).toBeGreaterThanOrEqual(1);
    expect(mensagensA.data?.map((linha) => linha.id)).toContain(mensagemA);

    const conversasB = await admin
      .from("mentor_conversas")
      .select("id")
      .eq("restaurante_id", casaB);
    expect(conversasB.error).toBeNull();
    expect(conversasB.data?.map((linha) => linha.id)).toContain(conversaB);
  });

  it("o admin não cria nem altera conversas ou mensagens", async () => {
    const conversa = await admin
      .from("mentor_conversas")
      .insert({ restaurante_id: casaA, titulo: "do admin" });
    expect(conversa.error?.code).toBe("42501");

    const mensagem = await admin.from("mentor_mensagens").insert({
      conversa_id: conversaA,
      restaurante_id: casaA,
      papel: "mentor",
      texto: "do admin",
    });
    expect(mensagem.error?.code).toBe("42501");

    const alteraConversa = await admin
      .from("mentor_conversas")
      .update({ titulo: "do admin" })
      .eq("id", conversaA)
      .select();
    expect(alteraConversa.error).toBeNull();
    expect(alteraConversa.data).toHaveLength(0);

    const alteraMensagem = await admin
      .from("mentor_mensagens")
      .update({ texto: "do admin" })
      .eq("id", mensagemA)
      .select();
    expect(alteraMensagem.error).toBeNull();
    expect(alteraMensagem.data).toHaveLength(0);

    const estado = await banco.query<{ intrusas: number }>(
      `select
         (select count(*)::int from public.mentor_conversas where titulo = 'do admin')
       + (select count(*)::int from public.mentor_mensagens where texto = 'do admin') as intrusas`
    );
    expect(estado.rows[0]?.intrusas).toBe(0);
  });
});

describe("regras do próprio banco", () => {
  it("só aceita o papel 'dono' ou 'mentor' na mensagem", async () => {
    await expect(
      banco.query(
        `insert into public.mentor_mensagens (conversa_id, restaurante_id, papel, texto)
         values ($1, $2, 'robo', 'x')`,
        [conversaA, casaA]
      )
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("apagar a casa apaga as conversas e as mensagens dela (cascata)", async () => {
    const casa = await banco.query<{ id: string }>(
      "insert into public.restaurantes (slug, nome) values ($1, 'Casa temporária') returning id",
      [`mentor-tmp-${sufixo}`]
    );
    const casaTemporaria = casa.rows[0]?.id ?? "";
    const conversa = await banco.query<{ id: string }>(
      "insert into public.mentor_conversas (restaurante_id) values ($1) returning id",
      [casaTemporaria]
    );
    const conversaTemporaria = conversa.rows[0]?.id ?? "";
    await banco.query(
      `insert into public.mentor_mensagens (conversa_id, restaurante_id, papel, texto)
       values ($1, $2, 'mentor', 'oi')`,
      [conversaTemporaria, casaTemporaria]
    );
    await banco.query("delete from public.restaurantes where id = $1", [
      casaTemporaria,
    ]);
    const sobrou = await banco.query<{ total: number }>(
      `select (select count(*)::int from public.mentor_conversas where restaurante_id = $1)
            + (select count(*)::int from public.mentor_mensagens where restaurante_id = $1) as total`,
      [casaTemporaria]
    );
    expect(sobrou.rows[0]?.total).toBe(0);
  });
});
