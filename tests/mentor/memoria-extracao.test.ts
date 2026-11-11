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

// A extração e a leitura das fichas contra o banco local, com logins reais: a
// leitura passa pela RLS de verdade (o cliente do dono), e a escrita vai pela
// chave de serviço (o navegador nunca escreve ficha direto). Só o provedor de
// IA é dublê (o padrão de `tests/mentor/conversa.test.ts`). Os asserts RELEEM
// o banco e conferem contagem: zero linhas afetadas não é sucesso.

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

// `server-only` só existe dentro do Next; no Vitest entra um vazio.
vi.mock("server-only", () => ({}));
// O dono de verdade, logado no Auth local: a RLS do banco vale de verdade.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => estado.cliente,
}));

import {
  TAMANHO_MAXIMO_DA_FICHA,
  TETO_DE_FICHAS,
  carregarFichas,
  extrairEgravarFichas,
} from "@/lib/mentor/memoria";
import type { ProvedorIA, RespostaIA } from "@/lib/mentor/provedor";

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

type Entrada = Parameters<ProvedorIA["responder"]>[0];

/** Dublê que devolve um texto pronto (a "extração" do provedor de verdade). */
function provedorQueDevolve(texto: string) {
  const responder = vi.fn(
    async (_entrada: Entrada): Promise<RespostaIA> => ({
      tipo: "texto",
      texto,
    })
  );
  const provedor: ProvedorIA = { responder };
  return { provedor, responder };
}

/** Dublê que lança, como o provedor fora do ar. */
function provedorQueFalha() {
  const responder = vi.fn(async (_entrada: Entrada): Promise<RespostaIA> => {
    throw new Error("503 do provedor");
  });
  const provedor: ProvedorIA = { responder };
  return { provedor, responder };
}

const fichaJson = (tipo: string, texto: string) =>
  JSON.stringify([{ tipo, texto }]);

let banco: Client;
let casaA = "";
let casaB = "";
let conversaA = "";
let donoA: Cliente;
let donoB: Cliente;

/** Relê as fichas da casa direto no banco, das mais novas para as mais velhas. */
async function fichasDa(casa: string) {
  const r = await banco.query<{
    id: string;
    texto: string;
    tipo: string;
    conversa_id: string | null;
    atualizada_em: Date;
  }>(
    `select id, texto, tipo, conversa_id, atualizada_em
       from public.mentor_memorias where restaurante_id = $1
      order by atualizada_em desc`,
    [casa]
  );
  return r.rows;
}

async function contarFichas(casa: string) {
  const r = await banco.query<{ total: number }>(
    "select count(*)::int as total from public.mentor_memorias where restaurante_id = $1",
    [casa]
  );
  return r.rows[0]?.total ?? -1;
}

/** O que o log de erro real imprimiu (o código, nunca dado pessoal). */
function errosLogados() {
  return erroNoConsole.mock.calls
    .map((chamada) => chamada.map((parte) => String(parte)).join(" "))
    .join("\n");
}

// O log de verdade, em silêncio: se o código não estiver no allowlist do
// `lib/logger.ts`, ele imprime "erro_interno" em vez do código esperado.
const erroNoConsole = vi
  .spyOn(console, "error")
  .mockImplementation(() => undefined);

beforeAll(async () => {
  vi.stubEnv("SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", chaveLocal("service_role"));

  banco = await conectarBanco();
  const casas = await banco.query<{ id: string }>(
    `insert into public.restaurantes (slug, nome)
      values ($1, 'Casa A da extração'), ($2, 'Casa B da extração')
      returning id`,
    [`extracao-a-${sufixo}`, `extracao-b-${sufixo}`]
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

  const conversa = await banco.query<{ id: string }>(
    "insert into public.mentor_conversas (restaurante_id, titulo) values ($1, $2) returning id",
    [casaA, "Conversa da extração"]
  );
  conversaA = conversa.rows[0]?.id ?? "";
});

afterAll(async () => {
  vi.unstubAllEnvs();
  erroNoConsole.mockRestore();
  try {
    if (!banco) return;
    // Conversas, mensagens e fichas saem em cascata junto com as casas.
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

beforeEach(async () => {
  estado.cliente = donoA;
  erroNoConsole.mockClear();
  await banco.query(
    "delete from public.mentor_memorias where restaurante_id = any($1::uuid[])",
    [[casaA, casaB]]
  );
});

function extrairDa(casa: string, provedor: ProvedorIA, conversaId = conversaA) {
  return extrairEgravarFichas({
    restauranteId: casa,
    conversaId,
    pergunta: "Como falo com a equipe?",
    resposta: "Fale direto e sem rodeio.",
    provedor,
  });
}

describe("extrairEgravarFichas", () => {
  it("grava a ficha que o dublê extrai, com a conversa onde o mentor soube", async () => {
    const { provedor, responder } = provedorQueDevolve(
      fichaJson("fato", "o dono prefere conselho direto")
    );

    await expect(extrairDa(casaA, provedor)).resolves.toBeUndefined();

    expect(responder).toHaveBeenCalledTimes(1);
    // A instrução é fechada: pede JSON e nada além.
    expect(responder.mock.calls[0]?.[0].instrucoes).toMatch(/JSON/i);

    const fichas = await fichasDa(casaA);
    expect(fichas).toHaveLength(1);
    expect(fichas[0]).toMatchObject({
      texto: "o dono prefere conselho direto",
      tipo: "fato",
      conversa_id: conversaA,
    });
    expect(await contarFichas(casaB)).toBe(0);
    expect(erroNoConsole).not.toHaveBeenCalled();
  });

  it("dublê vazio ou fora do formato: nada grava, sem lançar e sem log", async () => {
    for (const saida of [
      "[]",
      "   ",
      "não é json",
      '{"tipo":"fato"}',
      "null",
      "42",
    ]) {
      await expect(
        extrairDa(casaA, provedorQueDevolve(saida).provedor)
      ).resolves.toBeUndefined();
    }
    // Resposta de ferramenta não é extração: também é nada.
    const ferramenta: ProvedorIA = {
      responder: vi.fn(
        async (): Promise<RespostaIA> => ({
          tipo: "ferramenta",
          pedidos: [],
        })
      ),
    };
    await expect(extrairDa(casaA, ferramenta)).resolves.toBeUndefined();

    expect(await contarFichas(casaA)).toBe(0);
    expect(erroNoConsole).not.toHaveBeenCalled();
  });

  it("ficha igual à existente renova em vez de duplicar (vale aparada)", async () => {
    await banco.query(
      `insert into public.mentor_memorias
         (restaurante_id, texto, tipo, conversa_id, atualizada_em)
       values ($1, 'o dono prefere conselho direto', 'fato', $2, now() - interval '1 day')`,
      [casaA, conversaA]
    );
    const antes = (await fichasDa(casaA))[0]?.atualizada_em;

    // O dublê devolve o mesmo texto com espaços: após aparar, é a mesma ficha.
    const { provedor } = provedorQueDevolve(
      fichaJson("fato", "  o dono prefere conselho direto  ")
    );
    await expect(extrairDa(casaA, provedor)).resolves.toBeUndefined();

    const depois = await fichasDa(casaA);
    expect(depois).toHaveLength(1);
    expect(depois[0]?.texto).toBe("o dono prefere conselho direto");
    expect(depois[0]?.atualizada_em.getTime()).toBeGreaterThan(
      antes?.getTime() ?? 0
    );
    expect(erroNoConsole).not.toHaveBeenCalled();
  });

  it("com 50 fichas, a 51ª aposenta a mais antiga sem erro", async () => {
    expect(TETO_DE_FICHAS).toBe(50);
    await banco.query(
      `insert into public.mentor_memorias (restaurante_id, texto, tipo, atualizada_em)
       select $1, 'ficha ' || g, 'fato', now() - (g || ' minutes')::interval
         from generate_series(0, 49) g`,
      [casaA]
    );
    await banco.query(
      "insert into public.mentor_memorias (restaurante_id, texto, tipo) values ($1, 'ficha da casa B', 'fato')",
      [casaB]
    );

    const { provedor } = provedorQueDevolve(
      fichaJson("fato", "o dono abre a casa às 8h")
    );
    await expect(extrairDa(casaA, provedor)).resolves.toBeUndefined();

    // Continua no teto: a mais antiga saiu, a nova entrou.
    expect(await contarFichas(casaA)).toBe(50);
    const textos = (await fichasDa(casaA)).map((ficha) => ficha.texto);
    expect(textos).toContain("o dono abre a casa às 8h");
    expect(textos).not.toContain("ficha 49");
    expect(textos).toContain("ficha 48");
    // A outra casa não perde nada.
    expect((await fichasDa(casaB)).map((ficha) => ficha.texto)).toEqual([
      "ficha da casa B",
    ]);
    expect(erroNoConsole).not.toHaveBeenCalled();
  });

  it("texto fora do tamanho ou tipo inválido é descartado; o válido passa", async () => {
    expect(TAMANHO_MAXIMO_DA_FICHA).toBe(200);
    const { provedor } = provedorQueDevolve(
      JSON.stringify([
        { tipo: "fato", texto: "ficha boa" },
        { tipo: "fato", texto: "x".repeat(201) },
        { tipo: "lembrete", texto: "tipo fora do enum" },
        { tipo: "fato", texto: "   " },
        { tipo: "resumo", texto: "y".repeat(200) },
        { tipo: "fato", texto: 42 },
        null,
        "só texto",
      ])
    );
    await expect(extrairDa(casaA, provedor)).resolves.toBeUndefined();

    const textos = (await fichasDa(casaA)).map((ficha) => ficha.texto).sort();
    expect(textos).toEqual(["ficha boa", "y".repeat(200)]);
    expect(erroNoConsole).not.toHaveBeenCalled();
  });

  it("provedor que lança: sem lançar, com o código no log", async () => {
    await expect(
      extrairDa(casaA, provedorQueFalha().provedor)
    ).resolves.toBeUndefined();

    expect(await contarFichas(casaA)).toBe(0);
    // O log leva só o código (se ele não estivesse no allowlist do logger,
    // sairia "erro_interno" em vez deste código).
    expect(errosLogados()).toContain("falha_memoria_mentor");
  });
});

describe("carregarFichas", () => {
  it("devolve tipo e texto das fichas da casa, das mais novas para as mais velhas, no máximo 50", async () => {
    await banco.query(
      `insert into public.mentor_memorias (restaurante_id, texto, tipo, atualizada_em)
       values ($1, 'ficha velha', 'fato', now() - interval '2 days'),
              ($1, 'ficha nova', 'resumo', now() - interval '1 hour'),
              ($1, 'ficha do meio', 'fato', now() - interval '1 day')`,
      [casaA]
    );

    await expect(carregarFichas(casaA)).resolves.toEqual([
      { tipo: "resumo", texto: "ficha nova" },
      { tipo: "fato", texto: "ficha do meio" },
      { tipo: "fato", texto: "ficha velha" },
    ]);

    // Acima do teto, só as 50 mais novas voltam.
    await banco.query(
      `insert into public.mentor_memorias (restaurante_id, texto, tipo, atualizada_em)
       select $1, 'leitura ' || g, 'fato', now() - (g || ' minutes')::interval
         from generate_series(0, 59) g`,
      [casaA]
    );
    const cheia = await carregarFichas(casaA);
    expect(cheia).toHaveLength(50);
    expect(cheia[0]).toEqual({ tipo: "fato", texto: "leitura 0" });
  });

  it("o dono não enxerga a ficha da outra casa (zero linhas, sem erro)", async () => {
    await banco.query(
      "insert into public.mentor_memorias (restaurante_id, texto, tipo) values ($1, 'ficha de A', 'fato'), ($2, 'ficha de B', 'resumo')",
      [casaA, casaB]
    );

    estado.cliente = donoA;
    await expect(carregarFichas(casaA)).resolves.toEqual([
      { tipo: "fato", texto: "ficha de A" },
    ]);
    await expect(carregarFichas(casaB)).resolves.toEqual([]);

    estado.cliente = donoB;
    await expect(carregarFichas(casaB)).resolves.toEqual([
      { tipo: "resumo", texto: "ficha de B" },
    ]);
    expect(erroNoConsole).not.toHaveBeenCalled();
  });

  it("casa desconhecida ou id inválido devolve vazio, sem lançar", async () => {
    await expect(carregarFichas(randomUUID())).resolves.toEqual([]);
    await expect(carregarFichas("x")).resolves.toEqual([]);
  });
});
