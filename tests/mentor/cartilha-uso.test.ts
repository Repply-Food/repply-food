// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";
import { conectarBanco } from "../helpers/supabase-local";

// A cartilha do mentor (o texto que o afina) e o contador de uso diário, contra
// o banco local, com logins reais: a regra de segurança do banco é que decide.
// Leitura barrada pela RLS devolve ZERO linhas (sem erro); escrita barrada
// devolve erro de permissão ou zero linhas afetadas. O teste confere sempre a
// CONTAGEM e, quando muda dado, relê pelo banco: zero linhas afetadas, ou
// duplicada, não é sucesso.

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

/**
 * Dia de operação (AAAA-MM-DD) de um instante, contado fora do banco: soma o
 * deslocamento do fuso (em minutos em relação ao UTC) e tira a hora da virada.
 */
function diaDeOperacao(
  instante: Date,
  deslocamentoUtcEmMinutos: number,
  viradaEmMinutos: number
): string {
  const local = instante.getTime() + deslocamentoUtcEmMinutos * 60_000;
  return new Date(local - viradaEmMinutos * 60_000).toISOString().slice(0, 10);
}

let banco: Client;
let casaA = "";
let casaB = "";
// Casa que ninguém usou (nenhum login tem acesso): serve ao teste do admin.
let casaC = "";
let donoA: Cliente;
let donoB: Cliente;
let admin: Cliente;
let adminId = "";
let sementeId = "";
let sementeTexto = "";
// A tabela da cartilha é global (config da Repply): o teste guarda o estado
// dela antes e devolve tudo como estava no fim.
let antes: { id: string; ativa: boolean }[] = [];
const cartilhasDoTeste: string[] = [];

beforeAll(async () => {
  banco = await conectarBanco();
  // Casa A: fuso e virada padrão (America/Fortaleza, 05:00).
  // Casa B: Rio Branco (UTC-5, sem horário de verão) com virada às 23:59, para
  // provar que a função lê o fuso e a virada da casa e não usa um padrão.
  const casas = await banco.query<{ id: string; slug: string }>(
    `insert into public.restaurantes (slug, nome, fuso, hora_virada)
     values ($1, 'Casa A do uso', 'America/Fortaleza', '05:00'),
            ($2, 'Casa B do uso', 'America/Rio_Branco', '23:59'),
            ($3, 'Casa C do uso', 'America/Fortaleza', '05:00')
     returning id, slug`,
    [`uso-a-${sufixo}`, `uso-b-${sufixo}`, `uso-c-${sufixo}`]
  );
  casaA = casas.rows.find((c) => c.slug === `uso-a-${sufixo}`)?.id ?? "";
  casaB = casas.rows.find((c) => c.slug === `uso-b-${sufixo}`)?.id ?? "";
  casaC = casas.rows.find((c) => c.slug === `uso-c-${sufixo}`)?.id ?? "";

  const loginA = await criarLoginLogado("dono-a");
  const loginB = await criarLoginLogado("dono-b");
  const loginAdmin = await criarLoginLogado("admin");
  donoA = loginA.cliente;
  donoB = loginB.cliente;
  admin = loginAdmin.cliente;
  adminId = loginAdmin.id;
  await banco.query(
    "insert into public.acessos (user_id, restaurante_id) values ($1, $2), ($3, $4)",
    [loginA.id, casaA, loginB.id, casaB]
  );
  await banco.query("insert into public.admins_repply (user_id) values ($1)", [
    adminId,
  ]);

  const estadoAntes = await banco.query<{ id: string; ativa: boolean }>(
    "select id, ativa from public.mentor_cartilhas"
  );
  antes = estadoAntes.rows;
  const semente = await banco.query<{ id: string; texto: string }>(
    `select id, texto from public.mentor_cartilhas
      where ativa order by criada_em desc limit 1`
  );
  sementeId = semente.rows[0]?.id ?? "";
  sementeTexto = semente.rows[0]?.texto ?? "";
});

afterAll(async () => {
  try {
    if (!banco) return;
    if (cartilhasDoTeste.length > 0) {
      await banco.query(
        "delete from public.mentor_cartilhas where id = any($1::uuid[])",
        [cartilhasDoTeste]
      );
    }
    for (const { id, ativa } of antes) {
      await banco.query(
        "update public.mentor_cartilhas set ativa = $2 where id = $1",
        [id, ativa]
      );
    }
    // O uso sai em cascata junto com a casa.
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

describe("a cartilha ativa do mentor", () => {
  it("a migration entrega a cartilha-semente, e o serviço a lê pela função", async () => {
    expect(sementeId).not.toBe("");
    expect(sementeTexto).toContain("Você é o mentor do repply food.");
    const resposta = await servico.rpc("mentor_cartilha_ativa");
    expect(resposta.error).toBeNull();
    expect(resposta.data).toBe(sementeTexto);
  });

  it("o admin publica uma cartilha nova e a função passa a devolver a nova", async () => {
    const nova = await admin
      .from("mentor_cartilhas")
      .insert({
        texto: `Cartilha nova do teste ${sufixo}`,
        ativa: true,
        criada_por: adminId,
      })
      .select("id, criada_por");
    expect(nova.error).toBeNull();
    expect(nova.data).toHaveLength(1);
    const novaId = nova.data?.[0]?.id ?? "";
    expect(novaId).not.toBe("");
    expect(nova.data?.[0]?.criada_por).toBe(adminId);
    cartilhasDoTeste.push(novaId);

    // Com as duas ativas, vale a mais recente.
    const comAsDuas = await servico.rpc("mentor_cartilha_ativa");
    expect(comAsDuas.error).toBeNull();
    expect(comAsDuas.data).toBe(`Cartilha nova do teste ${sufixo}`);

    // Desativa a anterior (1 linha afetada, conferida).
    const desativa = await admin
      .from("mentor_cartilhas")
      .update({ ativa: false })
      .eq("id", sementeId)
      .select("id");
    expect(desativa.error).toBeNull();
    expect(desativa.data).toHaveLength(1);
    const noBanco = await banco.query<{ ativa: boolean }>(
      "select ativa from public.mentor_cartilhas where id = $1",
      [sementeId]
    );
    expect(noBanco.rows[0]?.ativa).toBe(false);

    const soANova = await servico.rpc("mentor_cartilha_ativa");
    expect(soANova.data).toBe(`Cartilha nova do teste ${sufixo}`);

    // Desativada a nova, volta a que estiver ativa; sem nenhuma, devolve nulo.
    await admin
      .from("mentor_cartilhas")
      .update({ ativa: true })
      .eq("id", sementeId)
      .select("id");
    await admin
      .from("mentor_cartilhas")
      .update({ ativa: false })
      .eq("id", novaId)
      .select("id");
    const voltou = await servico.rpc("mentor_cartilha_ativa");
    expect(voltou.data).toBe(sementeTexto);

    await admin
      .from("mentor_cartilhas")
      .update({ ativa: false })
      .eq("id", sementeId)
      .select("id");
    const nenhuma = await servico.rpc("mentor_cartilha_ativa");
    expect(nenhuma.error).toBeNull();
    expect(nenhuma.data).toBeNull();
  });
});

describe("a cartilha é do admin: o dono não lê, não escreve e não executa a função", () => {
  it("o dono de A lê 0 linhas da cartilha, havendo cartilhas no banco", async () => {
    const noBanco = await banco.query<{ total: number }>(
      "select count(*)::int as total from public.mentor_cartilhas"
    );
    expect(noBanco.rows[0]?.total).toBeGreaterThanOrEqual(2);

    const doDono = await donoA.from("mentor_cartilhas").select("id, texto");
    expect(doDono.error).toBeNull();
    expect(doDono.data).toHaveLength(0);

    const doOutroDono = await donoB.from("mentor_cartilhas").select("id");
    expect(doOutroDono.error).toBeNull();
    expect(doOutroDono.data).toHaveLength(0);

    // O admin lê tudo.
    const doAdmin = await admin.from("mentor_cartilhas").select("id");
    expect(doAdmin.error).toBeNull();
    expect(doAdmin.data).toHaveLength(noBanco.rows[0]?.total ?? -1);
  });

  it("o dono de A não cria, não altera e não apaga cartilha", async () => {
    const cria = await donoA
      .from("mentor_cartilhas")
      .insert({ texto: "texto do dono", ativa: true });
    expect(cria.error?.code).toBe("42501");

    const altera = await donoA
      .from("mentor_cartilhas")
      .update({ texto: "texto do dono" })
      .eq("id", sementeId)
      .select("id");
    expect(altera.error).toBeNull();
    expect(altera.data).toHaveLength(0);

    const apaga = await donoA
      .from("mentor_cartilhas")
      .delete()
      .eq("id", sementeId)
      .select("id");
    expect(apaga.error).toBeNull();
    expect(apaga.data).toHaveLength(0);

    const intactas = await banco.query<{ texto: string }>(
      "select texto from public.mentor_cartilhas where id = $1 or texto = 'texto do dono'",
      [sementeId]
    );
    expect(intactas.rows).toEqual([{ texto: sementeTexto }]);
  });

  it("quem não fez login não lê a cartilha", async () => {
    const leitura = await novoCliente().from("mentor_cartilhas").select("id");
    expect(leitura.data ?? []).toHaveLength(0);
    expect(leitura.error?.code).toBe("42501");
  });

  it("ninguém além do serviço executa mentor_cartilha_ativa() (nem dono, nem admin, nem anônimo)", async () => {
    const doDono = await donoA.rpc("mentor_cartilha_ativa");
    expect(doDono.data).toBeNull();
    expect(doDono.error?.code).toBe("42501");

    const doAdmin = await admin.rpc("mentor_cartilha_ativa");
    expect(doAdmin.data).toBeNull();
    expect(doAdmin.error?.code).toBe("42501");

    const doAnonimo = await novoCliente().rpc("mentor_cartilha_ativa");
    expect(doAnonimo.data).toBeNull();
    expect(doAnonimo.error?.code).toBe("42501");

    const privilegios = await banco.query<{
      anon: boolean;
      authenticated: boolean;
      servico: boolean;
    }>(
      `select has_function_privilege('anon', 'public.mentor_cartilha_ativa()', 'execute') as anon,
              has_function_privilege('authenticated', 'public.mentor_cartilha_ativa()', 'execute') as authenticated,
              has_function_privilege('service_role', 'public.mentor_cartilha_ativa()', 'execute') as servico`
    );
    expect(privilegios.rows[0]).toEqual({
      anon: false,
      authenticated: false,
      servico: true,
    });
  });
});

describe("o contador de uso diário do mentor", () => {
  it("conta 1, depois 2 na casa A; a casa B começa em 1 (isolada por casa)", async () => {
    const primeira = await donoA.rpc("mentor_registrar_uso", {
      p_restaurante_id: casaA,
    });
    expect(primeira.error).toBeNull();
    expect(primeira.data).toBe(1);

    const segunda = await donoA.rpc("mentor_registrar_uso", {
      p_restaurante_id: casaA,
    });
    expect(segunda.error).toBeNull();
    expect(segunda.data).toBe(2);

    const instanteAntes = new Date();
    const daB = await donoB.rpc("mentor_registrar_uso", {
      p_restaurante_id: casaB,
    });
    const instanteDepois = new Date();
    expect(daB.error).toBeNull();
    expect(daB.data).toBe(1);

    // Conferido pelo banco: uma linha por casa, sem duplicar.
    const linhasA = await banco.query<{ contagem: number; dia: string }>(
      "select contagem, dia::text as dia from public.mentor_uso where restaurante_id = $1",
      [casaA]
    );
    expect(linhasA.rows).toHaveLength(1);
    expect(linhasA.rows[0]?.contagem).toBe(2);
    const linhasB = await banco.query<{ contagem: number; dia: string }>(
      "select contagem, dia::text as dia from public.mentor_uso where restaurante_id = $1",
      [casaB]
    );
    expect(linhasB.rows).toHaveLength(1);
    expect(linhasB.rows[0]?.contagem).toBe(1);

    // O dia é o de operação da casa: fuso e virada dela, não do servidor.
    const esperadoA = await banco.query<{ dia: string }>(
      `select public.dia_operacao_de(now(), fuso, hora_virada)::text as dia
         from public.restaurantes where id = $1`,
      [casaA]
    );
    expect(linhasA.rows[0]?.dia).toBe(esperadoA.rows[0]?.dia);
    // Casa B: UTC-5 (-300 min) com virada às 23:59 (1439 min), contado fora do banco.
    expect([
      diaDeOperacao(instanteAntes, -300, 1439),
      diaDeOperacao(instanteDepois, -300, 1439),
    ]).toContain(linhasB.rows[0]?.dia);
  });

  it("um dia novo recomeça em 1 e não mexe no dia anterior", async () => {
    await banco.query(
      "insert into public.mentor_uso (restaurante_id, dia, contagem) values ($1, '2020-01-15', 7)",
      [casaB]
    );
    const hoje = await donoB.rpc("mentor_registrar_uso", {
      p_restaurante_id: casaB,
    });
    expect(hoje.error).toBeNull();
    expect(hoje.data).toBe(2);

    const linhas = await banco.query<{ dia: string; contagem: number }>(
      `select dia::text as dia, contagem from public.mentor_uso
        where restaurante_id = $1 order by dia`,
      [casaB]
    );
    expect(linhas.rows).toHaveLength(2);
    expect(linhas.rows[0]).toEqual({ dia: "2020-01-15", contagem: 7 });
    expect(linhas.rows[1]?.contagem).toBe(2);
  });

  it("o dono de A não registra uso na casa B, nem na que não existe (e nada é gravado)", async () => {
    const naB = await donoA.rpc("mentor_registrar_uso", {
      p_restaurante_id: casaB,
    });
    expect(naB.data).toBeNull();
    expect(naB.error?.code).toBe("42501");

    const inexistente = await donoA.rpc("mentor_registrar_uso", {
      p_restaurante_id: randomUUID(),
    });
    expect(inexistente.data).toBeNull();
    expect(inexistente.error?.code).toBe("42501");

    // B segue com 7 (2020) e 2 (hoje); A segue com 2.
    const total = await banco.query<{ restaurante_id: string; soma: number }>(
      `select restaurante_id, sum(contagem)::int as soma
         from public.mentor_uso
        where restaurante_id in ($1, $2)
        group by restaurante_id`,
      [casaA, casaB]
    );
    const somaPorCasa = Object.fromEntries(
      total.rows.map((linha) => [linha.restaurante_id, linha.soma])
    );
    expect(somaPorCasa[casaA]).toBe(2);
    expect(somaPorCasa[casaB]).toBe(9);
  });

  it("o admin não gasta o limite do cliente: a função recusa e nada muda", async () => {
    // Casa que já tem o uso de hoje: o caminho da alteração.
    const noDiaComUso = await admin.rpc("mentor_registrar_uso", {
      p_restaurante_id: casaA,
    });
    expect(noDiaComUso.data).toBeNull();
    expect(noDiaComUso.error?.code).toBe("42501");
    const casaAnoBanco = await banco.query<{ contagem: number }>(
      "select contagem from public.mentor_uso where restaurante_id = $1",
      [casaA]
    );
    expect(casaAnoBanco.rows).toEqual([{ contagem: 2 }]);

    // Casa sem nenhum uso hoje: o caminho da criação da linha.
    const noDiaSemUso = await admin.rpc("mentor_registrar_uso", {
      p_restaurante_id: casaC,
    });
    expect(noDiaSemUso.data).toBeNull();
    expect(noDiaSemUso.error?.code).toBe("42501");
    const casaCnoBanco = await banco.query<{ total: number }>(
      "select count(*)::int as total from public.mentor_uso where restaurante_id = $1",
      [casaC]
    );
    expect(casaCnoBanco.rows[0]?.total).toBe(0);
  });

  it("quem não fez login não executa mentor_registrar_uso", async () => {
    const resposta = await novoCliente().rpc("mentor_registrar_uso", {
      p_restaurante_id: casaA,
    });
    expect(resposta.data).toBeNull();
    expect(resposta.error?.code).toBe("42501");
  });

  it("cada dono lê só o uso da casa dele; o admin lê o de todas", async () => {
    const doDonoA = await donoA
      .from("mentor_uso")
      .select("restaurante_id, contagem");
    expect(doDonoA.error).toBeNull();
    expect(doDonoA.data).toEqual([{ restaurante_id: casaA, contagem: 2 }]);

    const doDonoB = await donoB
      .from("mentor_uso")
      .select("restaurante_id, dia");
    expect(doDonoB.error).toBeNull();
    expect(doDonoB.data).toHaveLength(2);
    expect(doDonoB.data?.every((linha) => linha.restaurante_id === casaB)).toBe(
      true
    );

    const doAdmin = await admin
      .from("mentor_uso")
      .select("restaurante_id")
      .in("restaurante_id", [casaA, casaB]);
    expect(doAdmin.error).toBeNull();
    expect(doAdmin.data).toHaveLength(3);

    const anonimo = await novoCliente().from("mentor_uso").select("contagem");
    expect(anonimo.data ?? []).toHaveLength(0);
    expect(anonimo.error?.code).toBe("42501");
  });

  it("o dono de A não mexe no uso da casa B (0 linhas afetadas, conferido pelo banco)", async () => {
    const altera = await donoA
      .from("mentor_uso")
      .update({ contagem: 0 })
      .eq("restaurante_id", casaB)
      .select();
    expect(altera.error).toBeNull();
    expect(altera.data).toHaveLength(0);

    const cria = await donoA.from("mentor_uso").insert({
      restaurante_id: casaB,
      dia: "2020-02-02",
      contagem: 1,
    });
    expect(cria.error?.code).toBe("42501");

    const apaga = await donoA
      .from("mentor_uso")
      .delete()
      .eq("restaurante_id", casaB)
      .select();
    expect(apaga.data ?? []).toHaveLength(0);

    const noBanco = await banco.query<{ total: number }>(
      "select sum(contagem)::int as total from public.mentor_uso where restaurante_id = $1",
      [casaB]
    );
    expect(noBanco.rows[0]?.total).toBe(9);
  });

  it("o restaurante_id de uma linha de uso é imutável", async () => {
    await expect(
      banco.query(
        "update public.mentor_uso set restaurante_id = $2 where restaurante_id = $1",
        [casaA, casaB]
      )
    ).rejects.toMatchObject({ code: "55000" });
    const noBanco = await banco.query<{ total: number }>(
      "select count(*)::int as total from public.mentor_uso where restaurante_id = $1",
      [casaA]
    );
    expect(noBanco.rows[0]?.total).toBe(1);
  });
});
