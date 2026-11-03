// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";
import { conectarBanco } from "../helpers/supabase-local";

// A retenção do mentor (D-72): a conversa e as mensagens ficam 12 meses e a
// rotina diária apaga o que passou disso. Contra o banco local, chamando a
// função de limpeza que o pg_cron agenda.
//
// Cada mensagem vale pela PRÓPRIA data: uma conversa antiga que o dono retomou
// ontem não pode perder as mensagens de ontem. A conversa só sai quando é
// antiga E ficou sem mensagem nenhuma. A rotina é global (todas as casas), então
// o teste confere linha por linha pelos ids que ele mesmo criou.

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const sufixo = randomUUID().slice(0, 8);
const servico = criarCliente<Database>(
  URL_LOCAL,
  chaveLocal("service_role"),
  opcoes
);

/** Cliente sem login (anon): nunca pode executar a limpeza. */
function novoCliente() {
  return criarCliente<Database>(URL_LOCAL, chaveLocal("anon"), opcoes);
}

let banco: Client;
let casaA = "";
let casaB = "";

// Conversas (ids) e mensagens (ids) do cenário.
const conversa = {
  antigaA: "",
  antigaB: "",
  recenteA: "",
  retomadaA: "",
  antigaVaziaA: "",
  recenteVaziaA: "",
  quaseDozeMesesA: "",
};
const mensagem = {
  antigaA1: "",
  antigaA2: "",
  antigaB1: "",
  recenteA1: "",
  recenteA2: "",
  retomadaAntiga: "",
  retomadaNova: "",
  quaseDozeMeses: "",
};

async function criarConversa(
  restauranteId: string,
  titulo: string,
  criadaEm: string,
  ultimaEm: string
): Promise<string> {
  const r = await banco.query<{ id: string }>(
    `insert into public.mentor_conversas (restaurante_id, titulo, criada_em, ultima_em)
     values ($1, $2, now() - $3::interval, now() - $4::interval) returning id`,
    [restauranteId, titulo, criadaEm, ultimaEm]
  );
  return r.rows[0]?.id ?? "";
}

async function criarMensagem(
  restauranteId: string,
  conversaId: string,
  papel: "dono" | "mentor",
  texto: string,
  criadaEm: string
): Promise<string> {
  const r = await banco.query<{ id: string }>(
    `insert into public.mentor_mensagens (conversa_id, restaurante_id, papel, texto, criada_em)
     values ($1, $2, $3, $4, now() - $5::interval) returning id`,
    [conversaId, restauranteId, papel, texto, criadaEm]
  );
  return r.rows[0]?.id ?? "";
}

async function conversasQueExistem(ids: string[]): Promise<string[]> {
  const r = await banco.query<{ id: string }>(
    "select id from public.mentor_conversas where id = any($1::uuid[])",
    [ids]
  );
  return r.rows.map((linha) => linha.id).sort();
}

async function mensagensQueExistem(ids: string[]): Promise<string[]> {
  const r = await banco.query<{ id: string }>(
    "select id from public.mentor_mensagens where id = any($1::uuid[])",
    [ids]
  );
  return r.rows.map((linha) => linha.id).sort();
}

beforeAll(async () => {
  banco = await conectarBanco();
  const casas = await banco.query<{ id: string; slug: string }>(
    `insert into public.restaurantes (slug, nome)
     values ($1, 'Casa A da retenção'), ($2, 'Casa B da retenção')
     returning id, slug`,
    [`retencao-a-${sufixo}`, `retencao-b-${sufixo}`]
  );
  casaA = casas.rows.find((c) => c.slug === `retencao-a-${sufixo}`)?.id ?? "";
  casaB = casas.rows.find((c) => c.slug === `retencao-b-${sufixo}`)?.id ?? "";

  // Conversa antiga da casa A: criada e conversada há 13 meses, nunca retomada.
  conversa.antigaA = await criarConversa(
    casaA,
    "Antiga A",
    "13 months",
    "13 months"
  );
  mensagem.antigaA1 = await criarMensagem(
    casaA,
    conversa.antigaA,
    "dono",
    "pergunta antiga",
    "13 months"
  );
  mensagem.antigaA2 = await criarMensagem(
    casaA,
    conversa.antigaA,
    "mentor",
    "resposta antiga",
    "13 months"
  );

  // O mesmo, na casa B: a rotina é global, não olha casa.
  conversa.antigaB = await criarConversa(
    casaB,
    "Antiga B",
    "14 months",
    "14 months"
  );
  mensagem.antigaB1 = await criarMensagem(
    casaB,
    conversa.antigaB,
    "dono",
    "pergunta antiga da B",
    "14 months"
  );

  // Conversa recente da casa A: tudo de ontem.
  conversa.recenteA = await criarConversa(casaA, "Recente A", "1 day", "1 day");
  mensagem.recenteA1 = await criarMensagem(
    casaA,
    conversa.recenteA,
    "dono",
    "pergunta de ontem",
    "1 day"
  );
  mensagem.recenteA2 = await criarMensagem(
    casaA,
    conversa.recenteA,
    "mentor",
    "resposta de ontem",
    "1 day"
  );

  // Conversa criada há 13 meses mas retomada ontem: a mensagem velha sai, a de
  // ontem fica, e a conversa fica com ela.
  conversa.retomadaA = await criarConversa(
    casaA,
    "Retomada A",
    "13 months",
    "1 day"
  );
  mensagem.retomadaAntiga = await criarMensagem(
    casaA,
    conversa.retomadaA,
    "dono",
    "pergunta de 13 meses atrás",
    "13 months"
  );
  mensagem.retomadaNova = await criarMensagem(
    casaA,
    conversa.retomadaA,
    "dono",
    "pergunta retomada ontem",
    "1 day"
  );

  // Conversa antiga sem nenhuma mensagem (órfã): sai.
  conversa.antigaVaziaA = await criarConversa(
    casaA,
    "Antiga vazia A",
    "13 months",
    "13 months"
  );
  // Conversa recente sem mensagem: não é da conta da retenção, fica.
  conversa.recenteVaziaA = await criarConversa(
    casaA,
    "Recente vazia A",
    "1 hour",
    "1 hour"
  );

  // Perto do limite, mas ainda dentro dos 12 meses: fica.
  conversa.quaseDozeMesesA = await criarConversa(
    casaA,
    "Quase 12 meses A",
    "11 months 28 days",
    "11 months 28 days"
  );
  mensagem.quaseDozeMeses = await criarMensagem(
    casaA,
    conversa.quaseDozeMesesA,
    "dono",
    "pergunta de quase 12 meses",
    "11 months 28 days"
  );
});

afterAll(async () => {
  try {
    if (!banco) return;
    // As conversas e as mensagens saem em cascata junto com as casas.
    await banco.query("delete from public.restaurantes where slug like $1", [
      `%${sufixo}%`,
    ]);
  } finally {
    await banco?.end();
  }
});

describe("a retenção de 12 meses do mentor", () => {
  it("antes da limpeza, o cenário todo está no banco", async () => {
    expect(await conversasQueExistem(Object.values(conversa))).toEqual(
      Object.values(conversa).sort()
    );
    expect(await mensagensQueExistem(Object.values(mensagem))).toEqual(
      Object.values(mensagem).sort()
    );
  });

  it("apaga o que passou de 12 meses (nas duas casas) e preserva o resto", async () => {
    const limpeza = await servico.rpc("limpar_conversas_mentor");
    expect(limpeza.error).toBeNull();
    // Sai ao menos o que o cenário plantou: 4 mensagens velhas (A1, A2, B1 e a
    // antiga da retomada) e 3 conversas (antigaA, antigaB, antigaVaziaA). Pode
    // sair mais se o banco local tiver outra sobra velha de teste; por isso >=.
    const apagadas = limpeza.data as { mensagens: number; conversas: number };
    expect(apagadas.mensagens).toBeGreaterThanOrEqual(4);
    expect(apagadas.conversas).toBeGreaterThanOrEqual(3);

    // Conversas: ficam as recentes, a retomada e a quase-12-meses.
    expect(await conversasQueExistem(Object.values(conversa))).toEqual(
      [
        conversa.recenteA,
        conversa.retomadaA,
        conversa.recenteVaziaA,
        conversa.quaseDozeMesesA,
      ].sort()
    );

    // Mensagens: ficam as recentes, a de ontem da retomada e a de quase 12 meses.
    expect(await mensagensQueExistem(Object.values(mensagem))).toEqual(
      [
        mensagem.recenteA1,
        mensagem.recenteA2,
        mensagem.retomadaNova,
        mensagem.quaseDozeMeses,
      ].sort()
    );
  });

  it("rodar de novo não apaga mais nada (idempotente)", async () => {
    const outraVez = await servico.rpc("limpar_conversas_mentor");
    expect(outraVez.error).toBeNull();
    expect(outraVez.data).toEqual({ mensagens: 0, conversas: 0 });
    expect(await conversasQueExistem(Object.values(conversa))).toHaveLength(4);
    expect(await mensagensQueExistem(Object.values(mensagem))).toHaveLength(4);
  });
});

describe("a rotina de limpeza nasce fechada e agendada", () => {
  it("só o service_role executa a função (nem anônimo, nem dono logado)", async () => {
    const privilegios = await banco.query<{
      anon: boolean;
      authenticated: boolean;
      servico: boolean;
    }>(
      `select has_function_privilege('anon', 'public.limpar_conversas_mentor()', 'execute') as anon,
              has_function_privilege('authenticated', 'public.limpar_conversas_mentor()', 'execute') as authenticated,
              has_function_privilege('service_role', 'public.limpar_conversas_mentor()', 'execute') as servico`
    );
    expect(privilegios.rows[0]).toEqual({
      anon: false,
      authenticated: false,
      servico: true,
    });

    const peloAnonimo = await novoCliente().rpc("limpar_conversas_mentor");
    expect(peloAnonimo.data).toBeNull();
    expect(peloAnonimo.error?.code).toBe("42501");
  });

  it("há um agendamento diário no pg_cron que chama a função", async () => {
    const rotina = await banco.query<{
      schedule: string;
      command: string;
      active: boolean;
    }>(
      "select schedule, command, active from cron.job where jobname = 'rf-limpa-mentor'"
    );
    expect(rotina.rows).toHaveLength(1);
    expect(rotina.rows[0]?.active).toBe(true);
    // Uma vez por dia: minuto e hora fixos, o resto "*".
    expect(rotina.rows[0]?.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
    expect(rotina.rows[0]?.command).toContain(
      "public.limpar_conversas_mentor()"
    );
  });
});
