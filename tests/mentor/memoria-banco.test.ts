// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";
import { conectarBanco } from "../helpers/supabase-local";

// Fichas de memória do mentor (Fase 3) no banco: o que o mentor lembra da casa
// e do dono ("o dono prefere conselho direto"), em até 200 letras, do tipo
// fato ou resumo. O navegador nunca escreve direto: só lê as fichas da casa
// dele; quem grava é a função do servidor, com a chave de serviço. A faxina
// aposenta a ficha sem mexer há mais de 12 meses (D-72); apagar a casa (ou a
// conversa) leva as fichas junto, em cascata.
//
// Leitura barrada pela RLS devolve ZERO linhas (sem erro); escrita barrada
// devolve erro de permissão. O teste confere a CONTAGEM e relê pelo banco:
// zero linhas afetadas não é sucesso.

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
let fichaA = "";

async function criarConversa(
  restauranteId: string,
  titulo: string
): Promise<string> {
  const r = await banco.query<{ id: string }>(
    `insert into public.mentor_conversas (restaurante_id, titulo)
      values ($1, $2) returning id`,
    [restauranteId, titulo]
  );
  return r.rows[0]?.id ?? "";
}

async function criarFicha(
  restauranteId: string,
  texto: string,
  atualizadaHa = "1 hour",
  conversaId: string | null = null,
  tipo = "fato",
  criadaHa = atualizadaHa
): Promise<string> {
  const r = await banco.query<{ id: string }>(
    `insert into public.mentor_memorias
       (restaurante_id, texto, tipo, conversa_id, criada_em, atualizada_em)
      values ($1, $2, $3, $4, now() - $6::interval, now() - $5::interval)
      returning id`,
    [restauranteId, texto, tipo, conversaId, atualizadaHa, criadaHa]
  );
  return r.rows[0]?.id ?? "";
}

async function fichaNoBanco(id: string) {
  const r = await banco.query<{
    id: string;
    restaurante_id: string;
    texto: string;
    tipo: string;
  }>(
    `select id, restaurante_id, texto, tipo
       from public.mentor_memorias where id = $1`,
    [id]
  );
  return r.rows[0];
}

async function existemMemorias(ids: string[]): Promise<string[]> {
  const r = await banco.query<{ id: string }>(
    "select id from public.mentor_memorias where id = any($1::uuid[])",
    [ids]
  );
  return r.rows.map((linha) => linha.id).sort();
}

beforeAll(async () => {
  banco = await conectarBanco();
  const casas = await banco.query<{ id: string }>(
    `insert into public.restaurantes (slug, nome)
      values ($1, 'Casa A das lembranças'), ($2, 'Casa B das lembranças')
      returning id`,
    [`memoria-a-${sufixo}`, `memoria-b-${sufixo}`]
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
  // O admin não tem acesso a nenhuma das duas casas: lê só pela RLS do admin.
  await banco.query("insert into public.admins_repply (user_id) values ($1)", [
    loginAdmin.id,
  ]);

  conversaA = await criarConversa(casaA, "Conversa com lembranças");
  fichaA = await criarFicha(
    casaA,
    "o dono prefere conselho direto",
    "1 hour",
    conversaA
  );
});

afterAll(async () => {
  try {
    if (!banco) return;
    // As conversas, as mensagens e as fichas saem em cascata junto com as casas.
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

describe("o dono lê só as lembranças da casa dele", () => {
  it("o dono de A lê a ficha dele", async () => {
    const leitura = await donoA
      .from("mentor_memorias")
      .select("id")
      .eq("id", fichaA);
    expect(leitura.error).toBeNull();
    expect(leitura.data).toHaveLength(1);
  });

  it("a ficha de A é invisível para o dono de B (zero linhas, sem erro)", async () => {
    const leitura = await donoB
      .from("mentor_memorias")
      .select("id")
      .eq("id", fichaA);
    expect(leitura.error).toBeNull();
    expect(leitura.data).toHaveLength(0);
  });
});

describe("o admin da Repply lê (só lê)", () => {
  it("o admin lê a ficha de qualquer casa, sem acesso a nenhuma", async () => {
    const fichaB = await criarFicha(casaB, "a casa B prefere resumo curto");

    for (const id of [fichaA, fichaB]) {
      const leitura = await admin
        .from("mentor_memorias")
        .select("id")
        .eq("id", id);
      expect(leitura.error).toBeNull();
      expect(leitura.data).toHaveLength(1);
    }
  });

  it("o admin não escreve ficha (INSERT, UPDATE e DELETE recusados)", async () => {
    const insere = await admin
      .from("mentor_memorias")
      .insert({
        restaurante_id: casaA,
        texto: "ficha do admin",
        tipo: "fato",
      })
      .select();
    expect(insere.error?.code).toBe("42501");

    const altera = await admin
      .from("mentor_memorias")
      .update({ texto: "texto do admin" })
      .eq("id", fichaA)
      .select();
    expect(altera.error?.code).toBe("42501");

    const apaga = await admin.from("mentor_memorias").delete().eq("id", fichaA);
    expect(apaga.error?.code).toBe("42501");

    // Nada entrou nem mudou, conferido pelo banco.
    const intrusas = await banco.query<{ total: string }>(
      "select count(*) as total from public.mentor_memorias where texto in ('ficha do admin', 'texto do admin')"
    );
    expect(intrusas.rows[0]?.total).toBe("0");
    expect((await fichaNoBanco(fichaA))?.texto).toBe(
      "o dono prefere conselho direto"
    );
    expect(await existemMemorias([fichaA])).toEqual([fichaA]);
  });
});

describe("o navegador não escreve ficha direto (só a função do servidor)", () => {
  it("ninguém insere ficha direto (INSERT recusado para authenticated)", async () => {
    const insere = await donoA
      .from("mentor_memorias")
      .insert({ restaurante_id: casaA, texto: "tentativa direta", tipo: "fato" })
      .select();
    expect(insere.error?.code).toBe("42501");

    // Nada entrou, conferido pelo banco.
    const contagem = await banco.query<{ total: string }>(
      "select count(*) as total from public.mentor_memorias where texto = 'tentativa direta'"
    );
    expect(contagem.rows[0]?.total).toBe("0");
  });

  it("ninguém altera nem apaga ficha direto (UPDATE e DELETE recusados)", async () => {
    const altera = await donoA
      .from("mentor_memorias")
      .update({ texto: "texto invadido" })
      .eq("id", fichaA)
      .select();
    expect(altera.error?.code).toBe("42501");
    expect((await fichaNoBanco(fichaA))?.texto).toBe(
      "o dono prefere conselho direto"
    );

    const apaga = await donoA
      .from("mentor_memorias")
      .delete()
      .eq("id", fichaA);
    expect(apaga.error?.code).toBe("42501");

    // Nada sumiu, conferido pelo banco.
    expect(await existemMemorias([fichaA])).toEqual([fichaA]);
  });

  it("não há política de escrita em mentor_memorias nem privilégio de escrever", async () => {
    const politicas = await banco.query<{ cmd: string }>(
      `select cmd from pg_policies
        where schemaname = 'public' and tablename = 'mentor_memorias'
          and cmd in ('INSERT', 'UPDATE', 'DELETE')`
    );
    expect(politicas.rows).toHaveLength(0);
    for (const privilegio of ["INSERT", "UPDATE", "DELETE"] as const) {
      const r = await banco.query<{ tem: boolean }>(
        `select has_table_privilege('authenticated', 'public.mentor_memorias', $1) as tem`,
        [privilegio]
      );
      expect(r.rows[0]).toEqual({ tem: false });
    }
  });
});

describe("a faxina aposenta a ficha velha e poupa a nova", () => {
  it("ficha sem mexer há 13 meses some; a de ontem fica", async () => {
    const velha = await criarFicha(casaA, "ficha velha de treze meses", "13 months");
    const nova = await criarFicha(casaA, "ficha de ontem", "1 day");

    const limpeza = await servico.rpc("limpar_conversas_mentor");
    expect(limpeza.error).toBeNull();

    expect(await existemMemorias([velha])).toEqual([]);
    expect(await existemMemorias([nova])).toEqual([nova]);
    // E a ficha semente (de agora há pouco) também continua lá.
    expect(await existemMemorias([fichaA])).toEqual([fichaA]);
  });

  it("o corte é pela atualizada_em: criada há 13 meses mas mexida ontem sobrevive; sem mexer há 13 meses some", async () => {
    const sobrevivente = await criarFicha(
      casaA,
      "criada há treze meses, mexida ontem",
      "1 day",
      null,
      "fato",
      "13 months"
    );
    const esquecida = await criarFicha(
      casaA,
      "criada ontem, sem mexer há treze meses",
      "13 months",
      null,
      "fato",
      "1 day"
    );

    // O helper gravou as duas datas com intervalos diferentes, conferido pelo
    // banco: a sobrevivente nasceu velha mas foi mexida ontem; a esquecida
    // nasceu ontem mas não é mexida há 13 meses.
    const datas = await banco.query<{
      id: string;
      criada_velha: boolean;
      atualizada_velha: boolean;
    }>(
      `select id,
          criada_em < now() - interval '12 months' as criada_velha,
          atualizada_em < now() - interval '12 months' as atualizada_velha
         from public.mentor_memorias where id = any($1::uuid[])`,
      [[sobrevivente, esquecida]]
    );
    const porId = new Map(datas.rows.map((linha) => [linha.id, linha]));
    expect(porId.get(sobrevivente)).toEqual({
      id: sobrevivente,
      criada_velha: true,
      atualizada_velha: false,
    });
    expect(porId.get(esquecida)).toEqual({
      id: esquecida,
      criada_velha: false,
      atualizada_velha: true,
    });

    // Confirmar a ficha renova os 12 meses: velha de 13 meses, mexida agora
    // (só a atualizada_em anda), escapa da faxina.
    const confirmada = await criarFicha(
      casaA,
      "ficha velha confirmada agora",
      "13 months"
    );
    await banco.query(
      "update public.mentor_memorias set atualizada_em = now() where id = $1",
      [confirmada]
    );

    const limpeza = await servico.rpc("limpar_conversas_mentor");
    expect(limpeza.error).toBeNull();

    expect(await existemMemorias([sobrevivente])).toEqual([sobrevivente]);
    expect(await existemMemorias([confirmada])).toEqual([confirmada]);
    expect(await existemMemorias([esquecida])).toEqual([]);
  });
});

describe("apagar leva as fichas junto (cascata)", () => {
  it("apagar a casa leva as fichas dela e só as dela", async () => {
    const casaTemp = (
      await banco.query<{ id: string }>(
        `insert into public.restaurantes (slug, nome)
          values ($1, 'Casa temporária das lembranças') returning id`,
        [`memoria-temp-${sufixo}`]
      )
    ).rows[0]?.id as string;
    const fichaTemp = await criarFicha(casaTemp, "ficha temporária");

    await banco.query("delete from public.restaurantes where id = $1", [
      casaTemp,
    ]);

    expect(await existemMemorias([fichaTemp])).toEqual([]);
    expect(await existemMemorias([fichaA])).toEqual([fichaA]);
  });

  it("apagar a conversa leva as fichas dela", async () => {
    const conversaTemp = await criarConversa(casaA, "Conversa temporária");
    const fichaTemp = await criarFicha(
      casaA,
      "ficha da conversa temporária",
      "1 hour",
      conversaTemp
    );

    await banco.query("delete from public.mentor_conversas where id = $1", [
      conversaTemp,
    ]);

    expect(await existemMemorias([fichaTemp])).toEqual([]);
    expect(await existemMemorias([fichaA])).toEqual([fichaA]);
  });
});

describe("o banco recusa ficha fora da regra", () => {
  it("texto de 200 letras passa; com 201 o banco recusa", async () => {
    const noLimite = await banco.query<{ id: string }>(
      `insert into public.mentor_memorias (restaurante_id, texto, tipo)
        values ($1, $2, 'fato') returning id`,
      [casaA, "x".repeat(200)]
    );
    expect(noLimite.rows).toHaveLength(1);
    await banco.query("delete from public.mentor_memorias where id = $1", [
      noLimite.rows[0]?.id,
    ]);

    await expect(
      banco.query(
        `insert into public.mentor_memorias (restaurante_id, texto, tipo)
          values ($1, $2, 'fato')`,
        [casaA, "x".repeat(201)]
      )
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("tipo fora de fato/resumo o banco recusa", async () => {
    await expect(
      banco.query(
        `insert into public.mentor_memorias (restaurante_id, texto, tipo)
          values ($1, 'texto válido', 'lembrete')`,
        [casaA]
      )
    ).rejects.toMatchObject({ code: "23514" });
  });
});
