// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";
import { conectarBanco } from "../helpers/supabase-local";

// Sessões do mentor (Fase 2) no banco: arquivar e excluir são só marcas
// (`arquivada_em`, `excluida_em`) na conversa, nunca um apagar direto. Quem
// apaga de verdade é a faxina: excluída há mais de 60 dias some com as
// mensagens; o resto segue a regra dos 12 meses (D-72), arquivada ou não.
//
// Leitura barrada pela RLS devolve ZERO linhas (sem erro); escrita barrada
// devolve erro de permissão ou zero linhas afetadas. O teste confere a
// CONTAGEM e relê pelo banco: zero linhas afetadas não é sucesso.

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
// Semeadas direto no banco, como dono do banco, antes dos testes.
let paraArquivar = "";
let paraExcluir = "";
let conversaB = "";

async function criarConversa(
  restauranteId: string,
  titulo: string,
  criadaHa = "1 hour",
  marca: { arquivadaHa?: string; excluidaHa?: string } = {}
): Promise<string> {
  const marcas: string[] = [];
  const valores: unknown[] = [restauranteId, titulo, criadaHa];
  if (marca.arquivadaHa) {
    valores.push(marca.arquivadaHa);
    marcas.push(`now() - $${valores.length}::interval`);
  } else {
    marcas.push("null");
  }
  if (marca.excluidaHa) {
    valores.push(marca.excluidaHa);
    marcas.push(`now() - $${valores.length}::interval`);
  } else {
    marcas.push("null");
  }
  const r = await banco.query<{ id: string }>(
    `insert into public.mentor_conversas
       (restaurante_id, titulo, criada_em, ultima_em, arquivada_em, excluida_em)
     values ($1, $2, now() - $3::interval, now() - $3::interval,
             ${marcas[0]}, ${marcas[1]})
     returning id`,
    valores
  );
  return r.rows[0]?.id ?? "";
}

async function criarMensagem(
  restauranteId: string,
  conversaId: string,
  texto: string,
  criadaHa = "1 hour"
): Promise<string> {
  const r = await banco.query<{ id: string }>(
    `insert into public.mentor_mensagens (conversa_id, restaurante_id, papel, texto, criada_em)
     values ($1, $2, 'dono', $3, now() - $4::interval) returning id`,
    [conversaId, restauranteId, texto, criadaHa]
  );
  return r.rows[0]?.id ?? "";
}

async function conversaNoBanco(id: string) {
  const r = await banco.query<{
    id: string;
    restaurante_id: string;
    titulo: string;
    criada_em: string;
    arquivada_em: string | null;
    excluida_em: string | null;
  }>(
    `select id, restaurante_id, titulo, criada_em, arquivada_em, excluida_em
       from public.mentor_conversas where id = $1`,
    [id]
  );
  return r.rows[0];
}

async function existemConversas(ids: string[]): Promise<string[]> {
  const r = await banco.query<{ id: string }>(
    "select id from public.mentor_conversas where id = any($1::uuid[])",
    [ids]
  );
  return r.rows.map((linha) => linha.id).sort();
}

async function existemMensagens(ids: string[]): Promise<string[]> {
  const r = await banco.query<{ id: string }>(
    "select id from public.mentor_mensagens where id = any($1::uuid[])",
    [ids]
  );
  return r.rows.map((linha) => linha.id).sort();
}

beforeAll(async () => {
  banco = await conectarBanco();
  const casas = await banco.query<{ id: string }>(
    `insert into public.restaurantes (slug, nome)
     values ($1, 'Casa A das sessões'), ($2, 'Casa B das sessões')
     returning id`,
    [`sessoes-a-${sufixo}`, `sessoes-b-${sufixo}`]
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

  paraArquivar = await criarConversa(casaA, "Conversa para arquivar");
  paraExcluir = await criarConversa(casaA, "Conversa para excluir");
  conversaB = await criarConversa(casaB, "Conversa da casa B");
});

afterAll(async () => {
  try {
    if (!banco) return;
    // As conversas e as mensagens saem em cascata junto com as casas.
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

describe("o dono arquiva e exclui a própria conversa (só marca, sem apagar)", () => {
  it("o dono de A arquiva a conversa dele", async () => {
    const agora = new Date().toISOString();
    const resposta = await donoA
      .from("mentor_conversas")
      .update({ arquivada_em: agora })
      .eq("id", paraArquivar)
      .select();
    expect(resposta.error).toBeNull();
    expect(resposta.data).toHaveLength(1);
    const noBanco = await conversaNoBanco(paraArquivar);
    expect(noBanco?.arquivada_em).not.toBeNull();
    expect(noBanco?.excluida_em).toBeNull();
  });

  it("o dono de A traz a conversa de volta (desarquiva)", async () => {
    const resposta = await donoA
      .from("mentor_conversas")
      .update({ arquivada_em: null })
      .eq("id", paraArquivar)
      .select();
    expect(resposta.error).toBeNull();
    expect(resposta.data).toHaveLength(1);
    const noBanco = await conversaNoBanco(paraArquivar);
    expect(noBanco?.arquivada_em).toBeNull();
  });

  it("o dono de A exclui a conversa dele (marca, a linha continua lá)", async () => {
    const agora = new Date().toISOString();
    const resposta = await donoA
      .from("mentor_conversas")
      .update({ excluida_em: agora })
      .eq("id", paraExcluir)
      .select();
    expect(resposta.error).toBeNull();
    expect(resposta.data).toHaveLength(1);
    const noBanco = await conversaNoBanco(paraExcluir);
    expect(noBanco?.excluida_em).not.toBeNull();
    // Excluir esconde do dono, não apaga: a linha continua no banco.
    expect(await existemConversas([paraExcluir])).toEqual([paraExcluir]);
  });
});

describe("a trava de quem não é dono", () => {
  it("o dono de B não arquiva nem renomeia a conversa de A (zero linhas)", async () => {
    const resposta = await donoB
      .from("mentor_conversas")
      .update({ titulo: "invadida", arquivada_em: new Date().toISOString() })
      .eq("id", paraArquivar)
      .select();
    expect(resposta.error).toBeNull();
    expect(resposta.data).toHaveLength(0);
    const noBanco = await conversaNoBanco(paraArquivar);
    expect(noBanco?.titulo).toBe("Conversa para arquivar");
    expect(noBanco?.arquivada_em).toBeNull();
  });

  it("ninguém apaga a linha direto (DELETE recusado para authenticated)", async () => {
    const apagaA = await donoA
      .from("mentor_conversas")
      .delete()
      .eq("id", paraExcluir);
    expect(apagaA.error?.code).toBe("42501");

    const apagaB = await donoB
      .from("mentor_conversas")
      .delete()
      .eq("id", paraArquivar);
    expect(apagaB.error?.code).toBe("42501");

    // Nada sumiu, conferido pelo banco.
    expect(await existemConversas([paraArquivar, paraExcluir])).toEqual(
      [paraArquivar, paraExcluir].sort()
    );
  });

  it("não há política de DELETE em mentor_conversas nem privilégio de apagar", async () => {
    const politicas = await banco.query<{ cmd: string }>(
      `select cmd from pg_policies
        where schemaname = 'public' and tablename = 'mentor_conversas' and cmd = 'DELETE'`
    );
    expect(politicas.rows).toHaveLength(0);
    const privilegio = await banco.query<{ tem: boolean }>(
      `select has_table_privilege('authenticated', 'public.mentor_conversas', 'DELETE') as tem`
    );
    expect(privilegio.rows[0]).toEqual({ tem: false });
  });

  it("o dono não muda a casa nem a data de criação da conversa", async () => {
    const trocaCasa = await donoA
      .from("mentor_conversas")
      .update({ restaurante_id: casaB })
      .eq("id", paraArquivar)
      .select();
    expect(trocaCasa.error).not.toBeNull();

    const trocaData = await donoA
      .from("mentor_conversas")
      .update({ criada_em: new Date(2020, 0, 1).toISOString() })
      .eq("id", paraArquivar)
      .select();
    expect(trocaData.error).not.toBeNull();

    const noBanco = await conversaNoBanco(paraArquivar);
    expect(noBanco?.restaurante_id).toBe(casaA);
    expect(new Date(noBanco?.criada_em ?? "").getFullYear()).toBeGreaterThan(
      2020
    );
  });
});

describe("a faxina apaga de verdade só a excluída há mais de 60 dias", () => {
  it("excluída há 61 dias some com as mensagens", async () => {
    const conversa = await criarConversa(
      casaA,
      "Excluída há 61 dias",
      "1 hour",
      {
        excluidaHa: "61 days",
      }
    );
    const primeira = await criarMensagem(casaA, conversa, "pergunta velha");
    const segunda = await criarMensagem(casaA, conversa, "resposta velha");

    const limpeza = await servico.rpc("limpar_conversas_mentor");
    expect(limpeza.error).toBeNull();
    const apagadas = limpeza.data as { mensagens: number; conversas: number };
    expect(apagadas.mensagens).toBeGreaterThanOrEqual(2);
    expect(apagadas.conversas).toBeGreaterThanOrEqual(1);

    expect(await existemConversas([conversa])).toEqual([]);
    expect(await existemMensagens([primeira, segunda])).toEqual([]);
  });

  it("excluída há 59 dias fica (conversa e mensagem)", async () => {
    const conversa = await criarConversa(
      casaA,
      "Excluída há 59 dias",
      "1 hour",
      {
        excluidaHa: "59 days",
      }
    );
    const mensagem = await criarMensagem(casaA, conversa, "pergunta recente");

    const limpeza = await servico.rpc("limpar_conversas_mentor");
    expect(limpeza.error).toBeNull();

    expect(await existemConversas([conversa])).toEqual([conversa]);
    expect(await existemMensagens([mensagem])).toEqual([mensagem]);
    // E a excluída de agora há pouco (semana do teste) também continua lá.
    expect(await existemConversas([paraExcluir])).toEqual([paraExcluir]);
  });

  it("arquivada (não excluída) segue a regra dos 12 meses", async () => {
    const recente = await criarConversa(casaA, "Arquivada recente", "1 hour", {
      arquivadaHa: "1 hour",
    });
    const mensagemRecente = await criarMensagem(casaA, recente, "de ontem");

    const velha = await criarConversa(casaA, "Arquivada velha", "13 months", {
      arquivadaHa: "1 hour",
    });
    const mensagemVelha = await criarMensagem(
      casaA,
      velha,
      "de 13 meses atrás",
      "13 months"
    );

    const limpeza = await servico.rpc("limpar_conversas_mentor");
    expect(limpeza.error).toBeNull();

    // A recente fica; a velha sai pela regra dos 12 meses, mesmo arquivada.
    expect(await existemConversas([recente])).toEqual([recente]);
    expect(await existemMensagens([mensagemRecente])).toEqual([
      mensagemRecente,
    ]);
    expect(await existemConversas([velha])).toEqual([]);
    expect(await existemMensagens([mensagemVelha])).toEqual([]);
  });
});
