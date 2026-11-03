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

// A cota diária do mentor não pode ser gasta por falha NOSSA: se a IA não foi
// alcançada (falha_mentor_provedor), o uso que o cérebro contou antes de
// chamar o provedor volta. Contra o banco local, com logins reais.
//
// Duas camadas, as duas conferidas RELENDO o banco:
//  1. a função mentor_devolver_uso: tira 1 do dia de operação da casa, nunca
//     abaixo de zero, só no dia e na casa pedidos, e só o serviço executa
//     (o dono nunca baixa o próprio contador: seria furar o teto de custo);
//  2. o cérebro: resposta boa conta; provedor que não responde devolve; falha
//     que NÃO é do provedor (a IA respondeu e gastou) não devolve; devolução
//     que falha não esconde o erro original nem derruba a conversa.
//
// O incremento continua ANTES do provedor (a checagem atômica do teto não
// muda), então só o contador de hoje é conferido aqui.

const { executarFerramentas, logError } = vi.hoisted(() => ({
  executarFerramentas: vi.fn(),
  logError: vi.fn(),
}));
const estado = vi.hoisted(() => ({
  cliente: null as unknown,
  // Quando ligado, o cliente de serviço do cérebro recusa SÓ a devolução.
  falharDevolucao: false,
}));

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
  ],
  executarFerramentas,
}));
// O cliente de serviço é o de verdade; com `falharDevolucao` ligado, só a
// chamada de mentor_devolver_uso volta com erro (a leitura da cartilha, que
// usa o mesmo cliente, segue funcionando).
vi.mock("@/lib/supabase/service", async (importarOriginal) => {
  const original =
    await importarOriginal<typeof import("@/lib/supabase/service")>();
  return {
    ...original,
    createServiceClient: () => {
      const cliente = original.createServiceClient();
      if (!estado.falharDevolucao) return cliente;
      return new Proxy(cliente, {
        get(alvo, propriedade) {
          const valor = Reflect.get(alvo, propriedade, alvo);
          if (propriedade !== "rpc" || typeof valor !== "function") {
            return typeof valor === "function" ? valor.bind(alvo) : valor;
          }
          return async (nome: string, argumentos?: object) =>
            nome === "mentor_devolver_uso"
              ? { data: null, error: { message: "falha forçada pelo teste" } }
              : Reflect.apply(valor, alvo, [nome, argumentos]);
        },
      });
    },
  };
});

import { responderNoMentor } from "@/lib/mentor/conversa";
import { TETO_DIARIO } from "@/lib/mentor/limite";
import type {
  PedidoFerramenta,
  ProvedorIA,
  RespostaIA,
} from "@/lib/mentor/provedor";

const FRASE_INDISPONIVEL = "o mentor está indisponível agora, tente de novo";

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
let casaDono = ""; // a casa do dono que conversa com o cérebro
let casaLimite = ""; // casa só do teste do teto
let casaBanco = ""; // casas só dos testes da função no banco
let casaOutra = "";
let donoDono: Cliente;
let donoLimite: Cliente;
let admin: Cliente;

/** O contador de hoje da casa (0 se ainda não há linha), lido pelo banco. */
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

/** Põe o contador de um dia da casa num valor exato, pelo cliente de serviço. */
async function fixarUso(casa: string, dia: string, contagem: number) {
  const gravado = await servico
    .from("mentor_uso")
    .upsert({ restaurante_id: casa, dia, contagem })
    .select("contagem");
  expect(gravado.error).toBeNull();
  expect(gravado.data).toHaveLength(1);
}

async function linhasDeUso(casa: string) {
  const r = await banco.query<{ dia: string; contagem: number }>(
    `select dia::text as dia, contagem from public.mentor_uso
      where restaurante_id = $1 order by dia`,
    [casa]
  );
  return r.rows;
}

async function contarMensagens(casa: string) {
  const r = await banco.query<{ total: number }>(
    "select count(*)::int as total from public.mentor_mensagens where restaurante_id = $1",
    [casa]
  );
  return r.rows[0]?.total ?? -1;
}

beforeAll(async () => {
  vi.stubEnv("SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", chaveLocal("service_role"));

  banco = await conectarBanco();
  const casas = await banco.query<{ id: string; slug: string }>(
    `insert into public.restaurantes (slug, nome)
     values ($1, 'Casa do dono da devolução'), ($2, 'Casa do teto da devolução'),
            ($3, 'Casa do banco da devolução'), ($4, 'Casa outra da devolução')
     returning id, slug`,
    [
      `dev-dono-${sufixo}`,
      `dev-limite-${sufixo}`,
      `dev-banco-${sufixo}`,
      `dev-outra-${sufixo}`,
    ]
  );
  const idDe = (slug: string) =>
    casas.rows.find((c) => c.slug === `${slug}-${sufixo}`)?.id ?? "";
  casaDono = idDe("dev-dono");
  casaLimite = idDe("dev-limite");
  casaBanco = idDe("dev-banco");
  casaOutra = idDe("dev-outra");

  const loginDono = await criarLoginLogado("dono-dono");
  const loginLimite = await criarLoginLogado("dono-limite");
  const loginAdmin = await criarLoginLogado("admin");
  donoDono = loginDono.cliente;
  donoLimite = loginLimite.cliente;
  admin = loginAdmin.cliente;
  await banco.query(
    `insert into public.acessos (user_id, restaurante_id)
     values ($1, $2), ($3, $4), ($1, $5)`,
    [loginDono.id, casaDono, loginLimite.id, casaLimite, casaBanco]
  );
  await banco.query("insert into public.admins_repply (user_id) values ($1)", [
    loginAdmin.id,
  ]);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  try {
    if (!banco) return;
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
  estado.cliente = donoDono;
  estado.falharDevolucao = false;
  executarFerramentas.mockReset();
  executarFerramentas.mockImplementation(async (pedidos: PedidoFerramenta[]) =>
    pedidos.map((p) => ({ nome: p.nome, resultado: { valor: "1234.56" } }))
  );
  logError.mockReset();
});

describe("a função mentor_devolver_uso (só o serviço executa)", () => {
  beforeEach(async () => {
    await banco.query(
      "delete from public.mentor_uso where restaurante_id = any($1::uuid[])",
      [[casaBanco, casaOutra]]
    );
  });

  it("tira 1 do contador de hoje por chamada e para em zero (nunca negativo)", async () => {
    const hoje = await diaDaCasa(casaBanco);
    await fixarUso(casaBanco, hoje, 2);

    const primeira = await servico.rpc("mentor_devolver_uso", {
      p_restaurante_id: casaBanco,
    });
    expect(primeira.error).toBeNull();
    expect(primeira.data).toBe(1);
    expect(await usoDeHoje(casaBanco)).toBe(1);

    const segunda = await servico.rpc("mentor_devolver_uso", {
      p_restaurante_id: casaBanco,
    });
    expect(segunda.data).toBe(0);

    // Já em zero: o piso segura, sem erro e sem número negativo.
    const terceira = await servico.rpc("mentor_devolver_uso", {
      p_restaurante_id: casaBanco,
    });
    expect(terceira.error).toBeNull();
    expect(terceira.data).toBe(0);
    expect(await linhasDeUso(casaBanco)).toEqual([{ dia: hoje, contagem: 0 }]);
  });

  it("mexe só no dia de hoje e só na casa pedida", async () => {
    const hoje = await diaDaCasa(casaBanco);
    await fixarUso(casaBanco, "2020-01-15", 7);
    await fixarUso(casaBanco, hoje, 4);
    await fixarUso(casaOutra, await diaDaCasa(casaOutra), 5);

    const devolvida = await servico.rpc("mentor_devolver_uso", {
      p_restaurante_id: casaBanco,
    });
    expect(devolvida.error).toBeNull();
    expect(devolvida.data).toBe(3);

    expect(await linhasDeUso(casaBanco)).toEqual([
      { dia: "2020-01-15", contagem: 7 },
      { dia: hoje, contagem: 3 },
    ]);
    expect(await usoDeHoje(casaOutra)).toBe(5);
  });

  it("casa sem uso hoje, ou que não existe: devolve 0 e não cria linha nenhuma", async () => {
    const semUso = await servico.rpc("mentor_devolver_uso", {
      p_restaurante_id: casaBanco,
    });
    expect(semUso.error).toBeNull();
    expect(semUso.data).toBe(0);

    const inexistente = await servico.rpc("mentor_devolver_uso", {
      p_restaurante_id: randomUUID(),
    });
    expect(inexistente.error).toBeNull();
    expect(inexistente.data).toBe(0);

    expect(await linhasDeUso(casaBanco)).toEqual([]);
  });

  it("anon e authenticated não têm EXECUTE; só o serviço", async () => {
    const privilegios = await banco.query<{
      anon: boolean;
      authenticated: boolean;
      servico: boolean;
    }>(
      `select has_function_privilege('anon', 'public.mentor_devolver_uso(uuid)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.mentor_devolver_uso(uuid)', 'execute') as authenticated,
              has_function_privilege('service_role', 'public.mentor_devolver_uso(uuid)', 'execute') as servico`
    );
    expect(privilegios.rows[0]).toEqual({
      anon: false,
      authenticated: false,
      servico: true,
    });

    const definicao = await banco.query<{
      prosecdef: boolean;
      proconfig: string[] | null;
    }>(
      `select prosecdef, proconfig from pg_proc
        where oid = 'public.mentor_devolver_uso(uuid)'::regprocedure`
    );
    expect(definicao.rows[0]?.prosecdef).toBe(true);
    expect(definicao.rows[0]?.proconfig).toEqual(
      expect.arrayContaining(['search_path=""', "row_security=off"])
    );
  });

  it("o dono, o admin e quem não fez login levam 42501 e o contador não baixa", async () => {
    const hoje = await diaDaCasa(casaBanco);
    await fixarUso(casaBanco, hoje, 5);

    // O dono da casa é quem teria interesse em baixar o próprio contador.
    const peloDono = await donoDono.rpc("mentor_devolver_uso", {
      p_restaurante_id: casaBanco,
    });
    expect(peloDono.data).toBeNull();
    expect(peloDono.error?.code).toBe("42501");

    const peloAdmin = await admin.rpc("mentor_devolver_uso", {
      p_restaurante_id: casaBanco,
    });
    expect(peloAdmin.data).toBeNull();
    expect(peloAdmin.error?.code).toBe("42501");

    const peloAnonimo = await novoCliente().rpc("mentor_devolver_uso", {
      p_restaurante_id: casaBanco,
    });
    expect(peloAnonimo.data).toBeNull();
    expect(peloAnonimo.error?.code).toBe("42501");

    expect(await usoDeHoje(casaBanco)).toBe(5);
  });
});

describe("o cérebro e a cota quando a IA não é alcançada", () => {
  it("resposta de sucesso conta 1 na cota do dia", async () => {
    const antes = await usoDeHoje(casaDono);
    const resultado = await responderNoMentor({
      restauranteId: casaDono,
      conversaId: null,
      mensagemDoDono: "Como foi o dia?",
      provedor: provedorRoteirizado([texto("Foi bem.")]).provedor,
    });
    expect(resultado.ok).toBe(true);
    expect(await usoDeHoje(casaDono)).toBe(antes + 1);
    expect(logError).not.toHaveBeenCalled();
  });

  it("provedor fora do ar: o dono recebe a frase de indisponível e a cota volta ao que era", async () => {
    const antes = await usoDeHoje(casaDono);
    const mensagensAntes = await contarMensagens(casaDono);
    const { provedor, responder } = provedorRoteirizado([
      new Error("503 do provedor"),
    ]);

    const resultado = await responderNoMentor({
      restauranteId: casaDono,
      conversaId: null,
      mensagemDoDono: "O Gemini caiu?",
      provedor,
    });

    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(responder).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls).toEqual([["falha_mentor_provedor"]]);
    expect(await usoDeHoje(casaDono)).toBe(antes);
    expect(await contarMensagens(casaDono)).toBe(mensagensAntes);
  });

  it("provedor que cai na 2ª rodada (depois da ferramenta) também devolve a cota", async () => {
    const antes = await usoDeHoje(casaDono);
    const resultado = await responderNoMentor({
      restauranteId: casaDono,
      conversaId: null,
      mensagemDoDono: "Como foi hoje?",
      provedor: provedorRoteirizado([
        pedir("faturamento"),
        new Error("503 do provedor"),
      ]).provedor,
    });
    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(logError.mock.calls).toEqual([["falha_mentor_provedor"]]);
    expect(await usoDeHoje(casaDono)).toBe(antes);
  });

  it("provedor que devolve texto vazio (sem resposta para o dono) devolve a cota", async () => {
    const antes = await usoDeHoje(casaDono);
    const resultado = await responderNoMentor({
      restauranteId: casaDono,
      conversaId: null,
      mensagemDoDono: "Oi",
      provedor: provedorRoteirizado([texto("   ")]).provedor,
    });
    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(logError.mock.calls).toEqual([["falha_mentor_provedor"]]);
    expect(await usoDeHoje(casaDono)).toBe(antes);
  });

  it("falha que NÃO é do provedor (a IA respondeu e gastou) não devolve a cota", async () => {
    const antes = await usoDeHoje(casaDono);
    // O provedor nunca para de pedir ferramenta: para na 5ª rodada, e a cota
    // foi gasta de verdade (falha_mentor_geral, não falha_mentor_provedor).
    const resultado = await responderNoMentor({
      restauranteId: casaDono,
      conversaId: null,
      mensagemDoDono: "Pergunta que não acaba",
      provedor: provedorRoteirizado(
        Array.from({ length: 12 }, () => pedir("faturamento"))
      ).provedor,
    });
    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(logError.mock.calls).toEqual([["falha_mentor_geral"]]);
    expect(await usoDeHoje(casaDono)).toBe(antes + 1);
  });

  it("no teto do dia, a falha do provedor não trava o dono: ele pode tentar de novo", async () => {
    estado.cliente = donoLimite;
    const hoje = await diaDaCasa(casaLimite);
    await fixarUso(casaLimite, hoje, TETO_DIARIO - 1);

    // A última do dia cai por culpa nossa: a cota volta a TETO - 1.
    const caiu = await responderNoMentor({
      restauranteId: casaLimite,
      conversaId: null,
      mensagemDoDono: "A última do dia",
      provedor: provedorRoteirizado([new Error("503 do provedor")]).provedor,
    });
    expect(caiu).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(await usoDeHoje(casaLimite)).toBe(TETO_DIARIO - 1);

    // A mesma pergunta, agora com o provedor de pé, passa (não foi barrada).
    const voltou = await responderNoMentor({
      restauranteId: casaLimite,
      conversaId: null,
      mensagemDoDono: "A última do dia",
      provedor: provedorRoteirizado([texto("Agora foi.")]).provedor,
    });
    expect(voltou.ok).toBe(true);
    expect(await usoDeHoje(casaLimite)).toBe(TETO_DIARIO);
  });

  it("se a própria devolução falhar, o erro original não some, o dono vê a mesma frase e o log leva os dois códigos", async () => {
    estado.falharDevolucao = true;
    const antes = await usoDeHoje(casaDono);

    const resultado = await responderNoMentor({
      restauranteId: casaDono,
      conversaId: null,
      mensagemDoDono: "Pergunta com devolução quebrada",
      provedor: provedorRoteirizado([new Error("503 do provedor")]).provedor,
    });

    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(JSON.stringify(resultado)).not.toContain("forçada");
    // Sem devolução, a tentativa fica contada (falha fechada, nunca "a mais").
    expect(await usoDeHoje(casaDono)).toBe(antes + 1);
    expect(logError).toHaveBeenCalledTimes(2);
    expect(logError.mock.calls.map((chamada) => chamada[0]).sort()).toEqual([
      "falha_mentor_limite",
      "falha_mentor_provedor",
    ]);
  });
});
