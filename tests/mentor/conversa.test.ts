// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import {
  afterAll,
  afterEach,
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

// O cérebro do mentor contra o banco local, com logins reais: a conversa, as
// mensagens e o limite passam pela RLS de verdade. Só o provedor de IA e as
// ferramentas (que têm teste próprio) são dublês. Os asserts RELEEM o banco e
// conferem contagem: zero linhas afetadas, ou meia-conversa, não é sucesso.

const { executarFerramentas, logError } = vi.hoisted(() => ({
  executarFerramentas: vi.fn(),
  logError: vi.fn(),
}));
const estado = vi.hoisted(() => ({ cliente: null as unknown }));

// `server-only` só existe dentro do Next; no Vitest entra um vazio.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logError }));
// O dono de verdade, logado no Auth local: a RLS do banco vale de verdade.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => estado.cliente,
}));
vi.mock("@/lib/mentor/ferramentas", () => ({
  FERRAMENTAS: [
    {
      nome: "faturamento",
      descricao: "O faturamento de hoje, sem a taxa de serviço.",
      parametros: { type: "object", properties: {} },
    },
    {
      nome: "mesas_abertas",
      descricao: "As mesas abertas agora.",
      parametros: { type: "object", properties: {} },
    },
  ],
  executarFerramentas,
}));

import { contextoDeHoje, responderNoMentor } from "@/lib/mentor/conversa";
import { FERRAMENTAS } from "@/lib/mentor/ferramentas";
import { TETO_DIARIO } from "@/lib/mentor/limite";
import type {
  PedidoFerramenta,
  ProvedorIA,
  RespostaIA,
} from "@/lib/mentor/provedor";
import { TRILHOS } from "@/lib/mentor/trilhos";

const FRASE_LIMITE = "você já usou bastante o mentor hoje; ele volta amanhã";
const FRASE_INDISPONIVEL = "o mentor está indisponível agora, tente de novo";
const FRASE_CONVERSA = "não encontrei essa conversa; comece uma nova";
const FRASE_VAZIA = "escreva sua pergunta para o mentor";
const FRASE_LONGA =
  "sua pergunta ficou longa demais; resuma em até 4000 caracteres";

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

/** Provedor de mentira: devolve as respostas do roteiro, uma por chamada. */
function provedorRoteirizado(roteiro: (RespostaIA | Error)[]) {
  const fila = [...roteiro];
  const responder = vi.fn(async (_entrada: Entrada): Promise<RespostaIA> => {
    const proxima = fila.shift();
    if (proxima === undefined) throw new Error("o roteiro do teste acabou");
    if (proxima instanceof Error) throw proxima;
    return proxima;
  });
  const provedor: ProvedorIA = { responder };
  return { provedor, responder };
}

const texto = (t: string): RespostaIA => ({ tipo: "texto", texto: t });
const pedir = (...nomes: string[]): RespostaIA => ({
  tipo: "ferramenta",
  pedidos: nomes.map((nome): PedidoFerramenta => ({ nome, argumentos: {} })),
});

let banco: Client;
let casaA = "";
let casaDupla = ""; // segunda casa do mesmo login da casa A
let casaB = "";
let casaLimite = "";
let donoA: Cliente;
let donoB: Cliente;
let donoLimite: Cliente;
let conversaB = "";
let conversaDupla = "";
let cartilhasAntes: { id: string; ativa: boolean }[] = [];

async function mensagensDa(conversaId: string) {
  const r = await banco.query<{
    papel: string;
    texto: string;
    ferramentas_usadas: unknown;
    restaurante_id: string;
  }>(
    `select papel, texto, ferramentas_usadas, restaurante_id
       from public.mentor_mensagens where conversa_id = $1
      order by criada_em`,
    [conversaId]
  );
  return r.rows;
}

async function contar(
  tabela: "mentor_conversas" | "mentor_mensagens",
  casa: string
) {
  const r = await banco.query<{ total: number }>(
    `select count(*)::int as total from public.${tabela} where restaurante_id = $1`,
    [casa]
  );
  return r.rows[0]?.total ?? -1;
}

async function usoDeHoje(casa: string) {
  const r = await banco.query<{ contagem: number }>(
    `select u.contagem from public.mentor_uso u
       join public.restaurantes r on r.id = u.restaurante_id
      where u.restaurante_id = $1
        and u.dia = public.dia_operacao_de(now(), r.fuso, r.hora_virada)`,
    [casa]
  );
  return r.rows[0]?.contagem ?? 0;
}

async function diaDaCasa(casa: string) {
  const r = await banco.query<{ dia: string }>(
    `select public.dia_operacao_de(now(), fuso, hora_virada)::text as dia
       from public.restaurantes where id = $1`,
    [casa]
  );
  return r.rows[0]?.dia ?? "";
}

/**
 * O mesmo dono logado, mas com a GRAVAÇÃO (insert) de uma tabela recusada: o
 * banco "devolve erro" como se a RLS ou a rede tivesse barrado. Leituras e as
 * demais tabelas passam para o cliente de verdade.
 */
function comFalhaNaGravacao(
  cliente: Cliente,
  tabela: "mentor_conversas" | "mentor_mensagens"
): Cliente {
  const falha = { data: null, error: { message: "falha forçada pelo teste" } };
  return new Proxy(cliente, {
    get(alvo, propriedade) {
      const valor = Reflect.get(alvo, propriedade, alvo);
      if (propriedade !== "from" || typeof valor !== "function") {
        return typeof valor === "function" ? valor.bind(alvo) : valor;
      }
      return (nome: string) => {
        const construtor = alvo.from(nome as typeof tabela);
        if (nome !== tabela) return construtor;
        return new Proxy(construtor, {
          get(c, p) {
            if (p === "insert") {
              return () => ({ select: async () => falha });
            }
            const v = Reflect.get(c, p, c);
            return typeof v === "function" ? v.bind(c) : v;
          },
        });
      };
    },
  });
}

/** Põe o contador de hoje da casa num valor exato, pelo cliente de serviço. */
async function fixarUsoDeHoje(casa: string, contagem: number) {
  const dia = await diaDaCasa(casa);
  const gravado = await servico
    .from("mentor_uso")
    .upsert({ restaurante_id: casa, dia, contagem })
    .select("contagem");
  expect(gravado.error).toBeNull();
  expect(gravado.data).toHaveLength(1);
}

beforeAll(async () => {
  vi.stubEnv("SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", chaveLocal("service_role"));

  banco = await conectarBanco();
  const casas = await banco.query<{ id: string; slug: string }>(
    `insert into public.restaurantes (slug, nome)
     values ($1, 'Casa A do cérebro'), ($2, 'Casa dupla do cérebro'),
            ($3, 'Casa B do cérebro'), ($4, 'Casa do limite')
     returning id, slug`,
    [
      `cer-a-${sufixo}`,
      `cer-dupla-${sufixo}`,
      `cer-b-${sufixo}`,
      `cer-limite-${sufixo}`,
    ]
  );
  const idDe = (slug: string) =>
    casas.rows.find((c) => c.slug === `${slug}-${sufixo}`)?.id ?? "";
  casaA = idDe("cer-a");
  casaDupla = idDe("cer-dupla");
  casaB = idDe("cer-b");
  casaLimite = idDe("cer-limite");

  const loginA = await criarLoginLogado("dono-a");
  const loginB = await criarLoginLogado("dono-b");
  const loginLimite = await criarLoginLogado("dono-limite");
  donoA = loginA.cliente;
  donoB = loginB.cliente;
  donoLimite = loginLimite.cliente;
  await banco.query(
    `insert into public.acessos (user_id, restaurante_id)
     values ($1, $2), ($1, $3), ($4, $5), ($6, $7)`,
    [loginA.id, casaA, casaDupla, loginB.id, casaB, loginLimite.id, casaLimite]
  );

  // Conversas semeadas, uma da casa B e uma da outra casa do dono A.
  const semear = async (casa: string, titulo: string) => {
    const r = await banco.query<{ id: string }>(
      "insert into public.mentor_conversas (restaurante_id, titulo) values ($1, $2) returning id",
      [casa, titulo]
    );
    return r.rows[0]?.id ?? "";
  };
  conversaB = await semear(casaB, "Conversa da casa B");
  conversaDupla = await semear(casaDupla, "Conversa da casa dupla");

  const antes = await banco.query<{ id: string; ativa: boolean }>(
    "select id, ativa from public.mentor_cartilhas"
  );
  cartilhasAntes = antes.rows;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  try {
    if (!banco) return;
    // A tabela da cartilha é global: devolve tudo como estava.
    for (const { id, ativa } of cartilhasAntes) {
      await banco.query(
        "update public.mentor_cartilhas set ativa = $2 where id = $1",
        [id, ativa]
      );
    }
    // Conversas, mensagens e uso saem em cascata junto com a casa.
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

beforeEach(() => {
  estado.cliente = donoA;
  executarFerramentas.mockReset();
  executarFerramentas.mockImplementation(async (pedidos: PedidoFerramenta[]) =>
    pedidos.map((p) => ({ nome: p.nome, resultado: { valor: "1234.56" } }))
  );
  logError.mockReset();
});

afterEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", chaveLocal("service_role"));
});

describe("quando o mentor puxa um número de uma ferramenta", () => {
  it("executa a ferramenta da casa da sessão, devolve ao provedor e grava a conversa", async () => {
    const { provedor, responder } = provedorRoteirizado([
      pedir("faturamento"),
      texto("Hoje a casa faturou R$ 1.234,56. Uma ideia pra testar: ..."),
    ]);
    const cartilha = await servico.rpc("mentor_cartilha_ativa");
    expect(typeof cartilha.data).toBe("string");

    const antes = await diaDaCasa(casaA);
    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "Como foi o faturamento de hoje?",
      provedor,
    });
    const depois = await diaDaCasa(casaA);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.resposta).toBe(
      "Hoje a casa faturou R$ 1.234,56. Uma ideia pra testar: ..."
    );

    // O provedor foi chamado duas vezes: a 1ª pede a ferramenta, a 2ª recebe o resultado.
    expect(responder).toHaveBeenCalledTimes(2);
    const primeira = responder.mock.calls[0]?.[0];
    const segunda = responder.mock.calls[1]?.[0];
    expect(primeira?.resultados).toBeUndefined();
    expect(primeira?.ferramentas).toEqual(FERRAMENTAS);
    expect(segunda?.ferramentas).toEqual(FERRAMENTAS);
    expect(segunda?.resultados).toEqual([
      { nome: "faturamento", resultado: { valor: "1234.56" } },
    ]);
    expect(segunda?.historico).toEqual(primeira?.historico);

    // O restaurante das ferramentas é o da sessão, nunca outro.
    expect(executarFerramentas).toHaveBeenCalledTimes(1);
    expect(executarFerramentas).toHaveBeenCalledWith(
      [{ nome: "faturamento", argumentos: {} }],
      casaA
    );

    // As instruções: trilhos + cartilha + o dia de hoje da casa.
    const instrucoes = primeira?.instrucoes ?? "";
    expect(instrucoes).toContain(TRILHOS);
    expect(instrucoes).toContain(String(cartilha.data).trim());
    expect(
      instrucoes.includes(contextoDeHoje(antes, "05:00:00")) ||
        instrucoes.includes(contextoDeHoje(depois, "05:00:00"))
    ).toBe(true);
    expect(segunda?.instrucoes).toBe(instrucoes);

    // O último turno do histórico é a pergunta do dono.
    expect(primeira?.historico).toEqual([
      { papel: "dono", texto: "Como foi o faturamento de hoje?" },
    ]);

    // Banco relido: a conversa existe, com as duas mensagens, na ordem certa.
    const conversa = await banco.query<{
      restaurante_id: string;
      titulo: string;
      criada_em: Date;
      ultima_em: Date;
    }>(
      "select restaurante_id, titulo, criada_em, ultima_em from public.mentor_conversas where id = $1",
      [resultado.conversaId]
    );
    expect(conversa.rows).toHaveLength(1);
    expect(conversa.rows[0]?.restaurante_id).toBe(casaA);
    expect(conversa.rows[0]?.titulo).toBe("Como foi o faturamento de hoje?");
    expect(conversa.rows[0]?.ultima_em.getTime()).toBeGreaterThanOrEqual(
      conversa.rows[0]?.criada_em.getTime() ?? 0
    );

    const mensagens = await mensagensDa(resultado.conversaId);
    expect(mensagens).toEqual([
      {
        papel: "dono",
        texto: "Como foi o faturamento de hoje?",
        ferramentas_usadas: null,
        restaurante_id: casaA,
      },
      {
        papel: "mentor",
        texto: "Hoje a casa faturou R$ 1.234,56. Uma ideia pra testar: ...",
        ferramentas_usadas: ["faturamento"],
        restaurante_id: casaA,
      },
    ]);
    expect(logError).not.toHaveBeenCalled();
  });

  it("registra uma vez só cada ferramenta usada, mesmo em várias rodadas, e ignora nome fora do catálogo", async () => {
    const { provedor, responder } = provedorRoteirizado([
      pedir("faturamento", "inventada"),
      pedir("faturamento", "mesas_abertas"),
      texto("Pronto."),
    ]);
    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "Me dá um panorama",
      provedor,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(responder).toHaveBeenCalledTimes(3);
    expect(executarFerramentas).toHaveBeenCalledTimes(2);
    const mensagens = await mensagensDa(resultado.conversaId);
    expect(mensagens[1]?.ferramentas_usadas).toEqual([
      "faturamento",
      "mesas_abertas",
    ]);
  });
});

describe("quando o provedor responde só com texto (os trilhos)", () => {
  it("não fabrica número: repassa o texto do provedor, grava e não executa ferramenta", async () => {
    const { provedor, responder } = provedorRoteirizado([
      texto("Não tenho esse dado agora, então prefiro não chutar um valor."),
    ]);
    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "  Quanto vendemos no Natal de 2019?  ",
      provedor,
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.resposta).toBe(
      "Não tenho esse dado agora, então prefiro não chutar um valor."
    );
    expect(responder).toHaveBeenCalledTimes(1);
    expect(executarFerramentas).not.toHaveBeenCalled();
    // Os trilhos vão em toda chamada.
    expect(responder.mock.calls[0]?.[0].instrucoes).toContain(TRILHOS);

    const mensagens = await mensagensDa(resultado.conversaId);
    expect(mensagens).toEqual([
      {
        papel: "dono",
        texto: "Quanto vendemos no Natal de 2019?",
        ferramentas_usadas: null,
        restaurante_id: casaA,
      },
      {
        papel: "mentor",
        texto: "Não tenho esse dado agora, então prefiro não chutar um valor.",
        ferramentas_usadas: null,
        restaurante_id: casaA,
      },
    ]);
  });

  it("os trilhos cobrem as cinco regras fixas", () => {
    expect(TRILHOS).toMatch(/assunto/i);
    expect(TRILHOS).toMatch(/ferramenta/i);
    expect(TRILHOS).toMatch(/sugest/i);
    expect(TRILHOS).toMatch(/advogado/i);
    expect(TRILHOS).toMatch(/contador/i);
    expect(TRILHOS).toMatch(/invent/i);
    expect(TRILHOS).toMatch(/rob[oô]|relat[oó]rio/i);
  });
});

describe("continuar uma conversa", () => {
  it("manda o histórico salvo antes da pergunta nova e acrescenta as mensagens", async () => {
    const primeira = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "Primeira pergunta",
      provedor: provedorRoteirizado([texto("Primeira resposta")]).provedor,
    });
    expect(primeira.ok).toBe(true);
    if (!primeira.ok) return;
    const antes = await banco.query<{ ultima_em: Date }>(
      "select ultima_em from public.mentor_conversas where id = $1",
      [primeira.conversaId]
    );

    const { provedor, responder } = provedorRoteirizado([
      texto("Segunda resposta"),
    ]);
    const segunda = await responderNoMentor({
      restauranteId: casaA,
      conversaId: primeira.conversaId,
      mensagemDoDono: "Segunda pergunta",
      provedor,
    });
    expect(segunda).toEqual({
      ok: true,
      conversaId: primeira.conversaId,
      resposta: "Segunda resposta",
    });
    expect(responder.mock.calls[0]?.[0].historico).toEqual([
      { papel: "dono", texto: "Primeira pergunta" },
      { papel: "mentor", texto: "Primeira resposta" },
      { papel: "dono", texto: "Segunda pergunta" },
    ]);

    const mensagens = await mensagensDa(primeira.conversaId);
    expect(mensagens.map((m) => [m.papel, m.texto])).toEqual([
      ["dono", "Primeira pergunta"],
      ["mentor", "Primeira resposta"],
      ["dono", "Segunda pergunta"],
      ["mentor", "Segunda resposta"],
    ]);
    const depois = await banco.query<{ ultima_em: Date; titulo: string }>(
      "select ultima_em, titulo from public.mentor_conversas where id = $1",
      [primeira.conversaId]
    );
    expect(depois.rows[0]?.ultima_em.getTime()).toBeGreaterThan(
      antes.rows[0]?.ultima_em.getTime() ?? 0
    );
    expect(depois.rows[0]?.titulo).toBe("Primeira pergunta");
  });

  it("não aceita a conversa de outra casa, nem a de outra casa do mesmo login", async () => {
    const totalA = await contar("mentor_mensagens", casaA);
    for (const conversaId of [conversaB, conversaDupla, randomUUID(), "x"]) {
      const { provedor, responder } = provedorRoteirizado([texto("oi")]);
      const resultado = await responderNoMentor({
        restauranteId: casaA,
        conversaId,
        mensagemDoDono: "Posso entrar na conversa de outra casa?",
        provedor,
      });
      expect(resultado).toEqual({ ok: false, error: FRASE_CONVERSA });
      expect(responder).not.toHaveBeenCalled();
    }
    expect(await contar("mentor_mensagens", casaA)).toBe(totalA);
    expect(await contar("mentor_mensagens", casaB)).toBe(0);
    expect(await contar("mentor_mensagens", casaDupla)).toBe(0);
    expect(await mensagensDa(conversaB)).toHaveLength(0);
    expect(await mensagensDa(conversaDupla)).toHaveLength(0);
  });

  it("recusa mensagem vazia sem gastar o limite nem chamar o provedor", async () => {
    const usoAntes = await usoDeHoje(casaA);
    const { provedor, responder } = provedorRoteirizado([texto("oi")]);
    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "   \n ",
      provedor,
    });
    expect(resultado.ok).toBe(false);
    expect(responder).not.toHaveBeenCalled();
    expect(await usoDeHoje(casaA)).toBe(usoAntes);
  });

  it("aceita a pergunta de exatamente 4000 caracteres (depois de aparada) e recusa a de 4001", async () => {
    const usoAntes = await usoDeHoje(casaA);
    const longa = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: `  ${"a".repeat(4001)}  `,
      provedor: provedorRoteirizado([texto("não deveria")]).provedor,
    });
    expect(longa).toEqual({ ok: false, error: FRASE_LONGA });
    expect(await usoDeHoje(casaA)).toBe(usoAntes);
    expect(logError).not.toHaveBeenCalled();

    const { provedor, responder } = provedorRoteirizado([texto("Li tudo.")]);
    const limite = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: `  ${"a".repeat(4000)}  `,
      provedor,
    });
    expect(limite.ok).toBe(true);
    expect(responder.mock.calls[0]?.[0].historico).toEqual([
      { papel: "dono", texto: "a".repeat(4000) },
    ]);
  });

  it("mensagem que nem é texto vira frase de produto, nunca erro cru", async () => {
    const usoAntes = await usoDeHoje(casaA);
    for (const invalida of [undefined, null, 42, { texto: "oi" }]) {
      const { provedor, responder } = provedorRoteirizado([texto("oi")]);
      const resultado = await responderNoMentor({
        restauranteId: casaA,
        conversaId: null,
        mensagemDoDono: invalida as unknown as string,
        provedor,
      });
      expect(resultado).toEqual({ ok: false, error: FRASE_VAZIA });
      expect(responder).not.toHaveBeenCalled();
    }
    expect(await usoDeHoje(casaA)).toBe(usoAntes);
  });
});

describe("o limite diário", () => {
  it("com o teto cheio, barra antes de chamar o provedor, e a tentativa conta", async () => {
    estado.cliente = donoLimite;
    await fixarUsoDeHoje(casaLimite, TETO_DIARIO);
    const { provedor, responder } = provedorRoteirizado([texto("não deveria")]);

    const resultado = await responderNoMentor({
      restauranteId: casaLimite,
      conversaId: null,
      mensagemDoDono: "Mais uma pergunta",
      provedor,
    });

    expect(resultado).toEqual({ ok: false, error: FRASE_LIMITE });
    expect(responder).not.toHaveBeenCalled();
    expect(executarFerramentas).not.toHaveBeenCalled();
    expect(await contar("mentor_conversas", casaLimite)).toBe(0);
    expect(await contar("mentor_mensagens", casaLimite)).toBe(0);
    expect(await usoDeHoje(casaLimite)).toBe(TETO_DIARIO + 1);
    expect(logError).not.toHaveBeenCalled();
  });

  it("a última chamada dentro do teto passa; a seguinte é barrada", async () => {
    estado.cliente = donoLimite;
    await fixarUsoDeHoje(casaLimite, TETO_DIARIO - 1);

    const ultima = provedorRoteirizado([texto("Ainda deu.")]);
    const dentro = await responderNoMentor({
      restauranteId: casaLimite,
      conversaId: null,
      mensagemDoDono: "A última do dia",
      provedor: ultima.provedor,
    });
    expect(dentro.ok).toBe(true);
    expect(ultima.responder).toHaveBeenCalledTimes(1);
    expect(await usoDeHoje(casaLimite)).toBe(TETO_DIARIO);

    const barrada = provedorRoteirizado([texto("não deveria")]);
    const fora = await responderNoMentor({
      restauranteId: casaLimite,
      conversaId: null,
      mensagemDoDono: "Passou",
      provedor: barrada.provedor,
    });
    expect(fora).toEqual({ ok: false, error: FRASE_LIMITE });
    expect(barrada.responder).not.toHaveBeenCalled();
  });

  it("falha FECHADA se o contador der erro: frase de produto, sem vazar a mensagem, sem provedor", async () => {
    // O dono da casa A pede em nome da casa B: o banco recusa o contador (42501).
    const usoB = await usoDeHoje(casaB);
    const { provedor, responder } = provedorRoteirizado([texto("não deveria")]);
    const resultado = await responderNoMentor({
      restauranteId: casaB,
      conversaId: null,
      mensagemDoDono: "Pergunta em nome de outra casa",
      provedor,
    });

    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(JSON.stringify(resultado)).not.toMatch(
      /casa não encontrada|acesso|42501/i
    );
    expect(responder).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith("falha_mentor_limite");
    expect(await usoDeHoje(casaB)).toBe(usoB);
    expect(await contar("mentor_mensagens", casaB)).toBe(0);
  });
});

describe("quando algo dá errado", () => {
  it("provedor que lança: frase de produto, sem vazar o erro, nada gravado", async () => {
    const conversasAntes = await contar("mentor_conversas", casaA);
    const mensagensAntes = await contar("mentor_mensagens", casaA);
    const { provedor, responder } = provedorRoteirizado([
      new Error("chave sk-SEGREDO inválida na API do provedor"),
    ]);

    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "Pergunta sigilosa do dono sobre o caixa",
      provedor,
    });

    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(JSON.stringify(resultado)).not.toContain("SEGREDO");
    expect(responder).toHaveBeenCalledTimes(1);
    // Só o código vai para o log: nem o erro cru, nem a pergunta do dono.
    expect(logError.mock.calls).toEqual([["falha_mentor_provedor"]]);
    expect(await contar("mentor_conversas", casaA)).toBe(conversasAntes);
    expect(await contar("mentor_mensagens", casaA)).toBe(mensagensAntes);
  });

  it("provedor que lança na 2ª rodada (depois da ferramenta): nada é gravado", async () => {
    const conversasAntes = await contar("mentor_conversas", casaA);
    const mensagensAntes = await contar("mentor_mensagens", casaA);
    const { provedor } = provedorRoteirizado([
      pedir("faturamento"),
      new Error("503 do provedor"),
    ]);
    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "Como foi hoje?",
      provedor,
    });
    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(logError.mock.calls).toEqual([["falha_mentor_provedor"]]);
    expect(await contar("mentor_conversas", casaA)).toBe(conversasAntes);
    expect(await contar("mentor_mensagens", casaA)).toBe(mensagensAntes);
  });

  it("falha ao gravar a conversa nova: frase de produto, sem vazar o erro, nada gravado", async () => {
    estado.cliente = comFalhaNaGravacao(donoA, "mentor_conversas");
    const conversasAntes = await contar("mentor_conversas", casaA);
    const mensagensAntes = await contar("mentor_mensagens", casaA);
    const { provedor, responder } = provedorRoteirizado([
      texto("Resposta que nunca vai ser salva."),
    ]);

    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "Pergunta sigilosa antes da falha de gravação",
      provedor,
    });

    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(JSON.stringify(resultado)).not.toContain("forçada");
    expect(responder).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls).toEqual([["falha_mentor_geral"]]);
    expect(await contar("mentor_conversas", casaA)).toBe(conversasAntes);
    expect(await contar("mentor_mensagens", casaA)).toBe(mensagensAntes);
  });

  it("falha ao gravar as mensagens de uma conversa existente: ok false e nenhuma linha nova", async () => {
    const primeira = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "Pergunta que abre a conversa",
      provedor: provedorRoteirizado([texto("Resposta que abre")]).provedor,
    });
    expect(primeira.ok).toBe(true);
    if (!primeira.ok) return;
    logError.mockReset();

    const conversasAntes = await contar("mentor_conversas", casaA);
    const mensagensAntes = await contar("mentor_mensagens", casaA);
    estado.cliente = comFalhaNaGravacao(donoA, "mentor_mensagens");
    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: primeira.conversaId,
      mensagemDoDono: "Pergunta cuja gravação falha",
      provedor: provedorRoteirizado([texto("Resposta perdida")]).provedor,
    });

    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(JSON.stringify(resultado)).not.toContain("forçada");
    expect(logError.mock.calls).toEqual([["falha_mentor_geral"]]);
    // Relido no banco: nenhuma conversa nem mensagem nova, e o histórico antigo
    // segue como estava.
    expect(await contar("mentor_conversas", casaA)).toBe(conversasAntes);
    expect(await contar("mentor_mensagens", casaA)).toBe(mensagensAntes);
    expect(
      (await mensagensDa(primeira.conversaId)).map((m) => m.texto)
    ).toEqual(["Pergunta que abre a conversa", "Resposta que abre"]);
  });

  it("provedor que devolve texto vazio conta como indisponível e não grava", async () => {
    const mensagensAntes = await contar("mentor_mensagens", casaA);
    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "Oi",
      provedor: provedorRoteirizado([texto("   ")]).provedor,
    });
    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(await contar("mentor_mensagens", casaA)).toBe(mensagensAntes);
  });

  it("provedor que nunca para de pedir ferramenta: para na 5ª rodada e não grava", async () => {
    const mensagensAntes = await contar("mentor_mensagens", casaA);
    const { provedor, responder } = provedorRoteirizado(
      Array.from({ length: 12 }, () => pedir("faturamento"))
    );
    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "Pergunta que não acaba",
      provedor,
    });
    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(executarFerramentas).toHaveBeenCalledTimes(5);
    expect(responder).toHaveBeenCalledTimes(6);
    expect(logError.mock.calls).toEqual([["falha_mentor_geral"]]);
    expect(await contar("mentor_mensagens", casaA)).toBe(mensagensAntes);
  });

  it("resposta de ferramenta sem nenhum pedido falha fechado como defeito do provedor, sem laço", async () => {
    const mensagensAntes = await contar("mentor_mensagens", casaA);
    const { provedor, responder } = provedorRoteirizado([
      { tipo: "ferramenta", pedidos: [] },
      texto("não deveria chegar aqui"),
    ]);
    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "Pedido vazio",
      provedor,
    });
    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(responder).toHaveBeenCalledTimes(1);
    expect(executarFerramentas).not.toHaveBeenCalled();
    expect(logError.mock.calls).toEqual([["falha_mentor_provedor"]]);
    expect(await contar("mentor_mensagens", casaA)).toBe(mensagensAntes);
  });

  it("até 16 pedidos numa rodada rodam todos, sem erro (panorama pede muitas ferramentas)", async () => {
    const { provedor, responder } = provedorRoteirizado([
      pedir(...Array.from({ length: 9 }, () => "faturamento")),
      texto("Panorama pronto."),
    ]);
    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "Quero tudo",
      provedor,
    });
    expect(resultado.ok).toBe(true);
    expect(executarFerramentas).toHaveBeenCalledTimes(1);
    expect(executarFerramentas.mock.calls[0]?.[0]).toHaveLength(9);
    expect(responder.mock.calls[1]?.[0].resultados).toEqual(
      Array.from({ length: 9 }, () => ({
        nome: "faturamento",
        resultado: { valor: "1234.56" },
      }))
    );
    expect(logError).not.toHaveBeenCalled();
  });

  it("pedidos além de 16 não derrubam a conversa: os 16 primeiros rodam e os excedentes voltam com erro, na ordem", async () => {
    const pedidos: PedidoFerramenta[] = Array.from({ length: 20 }, (_, i) => ({
      nome: i < 16 ? "faturamento" : "mesas_abertas",
      argumentos: { n: i },
    }));
    const { provedor, responder } = provedorRoteirizado([
      { tipo: "ferramenta", pedidos },
      texto("Respondi com o que deu."),
    ]);
    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "Quero muito mais do que cabe",
      provedor,
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    // Só os 16 primeiros foram executados, com a casa da sessão.
    expect(executarFerramentas).toHaveBeenCalledTimes(1);
    expect(executarFerramentas).toHaveBeenCalledWith(
      pedidos.slice(0, 16),
      casaA
    );
    // O provedor recebe um resultado para CADA pedido (1:1, na ordem).
    expect(responder).toHaveBeenCalledTimes(2);
    const resultados = responder.mock.calls[1]?.[0].resultados ?? [];
    expect(resultados.map((r) => r.nome)).toEqual(pedidos.map((p) => p.nome));
    expect(resultados.slice(0, 16)).toEqual(
      pedidos
        .slice(0, 16)
        .map((p) => ({ nome: p.nome, resultado: { valor: "1234.56" } }))
    );
    expect(resultados.slice(16)).toEqual(
      pedidos.slice(16).map((p) => ({
        nome: p.nome,
        resultado: {
          erro: "pedido além do limite desta rodada; peça de novo se precisar",
        },
      }))
    );
    // Sem throw e sem gastar o laço: nenhuma falha no log, e a conversa foi gravada.
    expect(logError).not.toHaveBeenCalled();
    const mensagens = await mensagensDa(resultado.conversaId);
    expect(mensagens.map((m) => m.papel)).toEqual(["dono", "mentor"]);
    // "mesas_abertas" só apareceu nos excedentes, que não rodaram: não conta.
    expect(mensagens[1]?.ferramentas_usadas).toEqual(["faturamento"]);
  });

  it("a ferramenta que ficou de fora pode ser pedida de novo na rodada seguinte", async () => {
    // 16 de "faturamento" rodam; a 17ª ("mesas_abertas") só volta com erro.
    const pedidos: PedidoFerramenta[] = [
      ...Array.from({ length: 16 }, () => ({
        nome: "faturamento",
        argumentos: {},
      })),
      { nome: "mesas_abertas", argumentos: {} },
    ];
    const { provedor, responder } = provedorRoteirizado([
      { tipo: "ferramenta", pedidos },
      pedir("mesas_abertas"), // pede de novo o que ficou de fora
      texto("Agora sim."),
    ]);
    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "Faturamento e mesas",
      provedor,
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(responder).toHaveBeenCalledTimes(3);
    expect(executarFerramentas).toHaveBeenCalledTimes(2);
    expect(executarFerramentas.mock.calls[0]?.[0]).toHaveLength(16);
    expect(executarFerramentas.mock.calls[1]?.[0]).toEqual([
      { nome: "mesas_abertas", argumentos: {} },
    ]);
    const mensagens = await mensagensDa(resultado.conversaId);
    expect(mensagens[1]?.ferramentas_usadas).toEqual([
      "faturamento",
      "mesas_abertas",
    ]);
  });

  it("executor de ferramentas que lança (não devia) vira frase de produto e não grava", async () => {
    executarFerramentas.mockRejectedValue(
      new Error("rpc caiu: detalhe interno")
    );
    const mensagensAntes = await contar("mentor_mensagens", casaA);
    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "Como foi hoje?",
      provedor: provedorRoteirizado([pedir("faturamento")]).provedor,
    });
    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(JSON.stringify(resultado)).not.toContain("detalhe interno");
    expect(logError.mock.calls).toEqual([["falha_mentor_geral"]]);
    expect(await contar("mentor_mensagens", casaA)).toBe(mensagensAntes);
  });
});

describe("a cartilha", () => {
  it("sem cartilha ativa (nula), o mentor responde normalmente só com trilhos e dia de hoje", async () => {
    const ativas = await banco.query<{ id: string }>(
      "select id from public.mentor_cartilhas where ativa"
    );
    await banco.query("update public.mentor_cartilhas set ativa = false");
    try {
      const nula = await servico.rpc("mentor_cartilha_ativa");
      expect(nula.error).toBeNull();
      expect(nula.data).toBeNull();

      const { provedor, responder } = provedorRoteirizado([
        texto("Respondi sem cartilha."),
      ]);
      const resultado = await responderNoMentor({
        restauranteId: casaA,
        conversaId: null,
        mensagemDoDono: "Tudo bem por aí?",
        provedor,
      });

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      expect(resultado.resposta).toBe("Respondi sem cartilha.");
      const instrucoes = responder.mock.calls[0]?.[0].instrucoes ?? "";
      expect(instrucoes.startsWith(TRILHOS)).toBe(true);
      expect(instrucoes).toContain("Hoje é ");
      expect(instrucoes).not.toMatch(/null|undefined/);
      expect(instrucoes).not.toContain("\n\n\n");
      expect(await mensagensDa(resultado.conversaId)).toHaveLength(2);
    } finally {
      await banco.query(
        "update public.mentor_cartilhas set ativa = true where id = any($1::uuid[])",
        [ativas.rows.map((r) => r.id)]
      );
    }
  });

  it("erro ao ler a cartilha falha fechado (não responde sem a voz do mentor)", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave-invalida");
    const mensagensAntes = await contar("mentor_mensagens", casaA);
    const { provedor, responder } = provedorRoteirizado([texto("não deveria")]);
    const resultado = await responderNoMentor({
      restauranteId: casaA,
      conversaId: null,
      mensagemDoDono: "Oi",
      provedor,
    });
    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(responder).not.toHaveBeenCalled();
    expect(logError.mock.calls).toEqual([["falha_mentor_geral"]]);
    expect(await contar("mentor_mensagens", casaA)).toBe(mensagensAntes);
  });
});

describe("o dia de hoje que vai nas instruções", () => {
  it("diz o dia da semana e a data em português, com a data no formato das ferramentas", () => {
    const linha = contextoDeHoje("2026-10-30", "05:00:00");
    expect(linha).toContain("Hoje é sexta-feira, 30/10/2026");
    expect(linha).toContain("2026-10-30");
    expect(linha).toContain("05:00");
    expect(contextoDeHoje("2026-11-01", "05:00:00")).toContain(
      "domingo, 01/11/2026"
    );
    expect(contextoDeHoje("2026-11-02", "06:30:00")).toContain(
      "segunda-feira, 02/11/2026"
    );
  });
});
