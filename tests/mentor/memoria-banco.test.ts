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
  tipo = "fato"
): Promise<string> {
  const r = await banco.query<{ id: string }>(
    `insert into public.mentor_memorias
       (restaurante_id, texto, tipo, conversa_id, criada_em, atualizada_em)
      values ($1, $2, $3, $4, now() - $5::interval, now() - $5::interval)
      returning id`,
    [restauranteId, texto, tipo, conversaId, atualizadaHa]
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
  donoA = loginA.cliente;
  donoB = loginB.cliente;
  await banco.query(
    "insert into public.acessos (user_id, restaurante_id) values ($1, $2), ($3, $4)",
    [loginA.id, casaA, loginB.id, casaB]
  );

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
