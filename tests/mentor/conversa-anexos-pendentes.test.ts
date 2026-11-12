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

// Órfão pendente quando o provedor ou a gravação falha DEPOIS da subida
// (Fase 4, I-2): a subida deixa ficha + arquivo em `pendente/` antes de chamar
// a IA, e um tombo depois disso não pode deixar resto no cofre nem na tabela.
// O cérebro apaga os pendentes (melhor esforço, sem mascarar o erro) antes de
// propagar. Contra o banco e o cofre locais, com logins reais — SEM dublê de
// `@/lib/mentor/anexos`: a subida é de verdade, e o assert RELE a tabela e o
// cofre. Só o provedor (que lança) e as fichas da memória são dublês.

const { executarFerramentas, logError, carregarFichas, extrairEgravarFichas } =
  vi.hoisted(() => ({
    executarFerramentas: vi.fn(),
    logError: vi.fn(),
    carregarFichas: vi.fn(),
    extrairEgravarFichas: vi.fn(),
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
  ],
  executarFerramentas,
}));
// As fichas são dublê: a extração real chamaria o provedor de verdade.
vi.mock("@/lib/mentor/memoria", () => ({
  carregarFichas,
  extrairEgravarFichas,
}));

import { responderNoMentor } from "@/lib/mentor/conversa";
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

function fotoDoTeste(): File {
  return new File([new TextEncoder().encode("bytes-da-foto")], "cardapio.png", {
    type: "image/png",
  });
}

let banco: Client;
let casa = "";
let dono: Cliente;

/** O contador de hoje da casa (0 se ainda não há linha), lido pelo banco. */
async function usoDeHoje(casaId: string) {
  const r = await banco.query<{ contagem: number }>(
    `select u.contagem from public.mentor_uso u
        join public.restaurantes r on r.id = u.restaurante_id
       where u.restaurante_id = $1
         and u.dia = public.dia_operacao_de(now(), r.fuso, r.hora_virada)`,
    [casaId]
  );
  return r.rows[0]?.contagem ?? 0;
}

async function contarAnexos(casaId: string) {
  const r = await banco.query<{ total: number }>(
    "select count(*)::int as total from public.mentor_anexos where restaurante_id = $1",
    [casaId]
  );
  return r.rows[0]?.total ?? -1;
}

/** Nomes de arquivo dentro de uma pasta do cofre (ex.: "pendente"). */
async function nomesEm(pasta: string): Promise<string[]> {
  const lista = await servico.storage
    .from("mentor-anexos")
    .list(pasta, { limit: 1000 });
  if (lista.error || !lista.data) return [];
  return lista.data.map((item) => item.name).sort();
}

/**
 * O mesmo dono logado, mas com a GRAVAÇÃO (insert) de uma tabela recusada: o
 * banco "devolve erro" como se a RLS ou a rede tivesse barrado.
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

/** Apaga as fichas da casa e os arquivos que elas apontam (melhor esforço). */
async function varrerRestosDaCasa(): Promise<void> {
  if (!banco || !casa) return;
  const fichas = await banco.query<{ caminho: string }>(
    "select caminho from public.mentor_anexos where restaurante_id = $1",
    [casa]
  );
  const caminhos = fichas.rows.map((linha) => linha.caminho);
  if (caminhos.length > 0) {
    await servico.storage.from("mentor-anexos").remove(caminhos);
  }
  await banco.query(
    "delete from public.mentor_anexos where restaurante_id = $1",
    [casa]
  );
}

beforeAll(async () => {
  vi.stubEnv("SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", chaveLocal("service_role"));

  banco = await conectarBanco();
  const casas = await banco.query<{ id: string }>(
    `insert into public.restaurantes (slug, nome)
      values ($1, 'Casa do pendente orfao') returning id`,
    [`pendente-orfao-${sufixo}`]
  );
  casa = casas.rows[0]?.id ?? "";

  const login = await criarLoginLogado("dono-pendente");
  dono = login.cliente;
  await banco.query(
    "insert into public.acessos (user_id, restaurante_id) values ($1, $2)",
    [login.id, casa]
  );
});

afterAll(async () => {
  vi.unstubAllEnvs();
  try {
    if (!banco) return;
    await varrerRestosDaCasa();
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
  estado.cliente = dono;
  executarFerramentas.mockReset();
  executarFerramentas.mockImplementation(async (pedidos: PedidoFerramenta[]) =>
    pedidos.map((p) => ({ nome: p.nome, resultado: { valor: "1234.56" } }))
  );
  logError.mockReset();
  carregarFichas.mockReset();
  carregarFichas.mockResolvedValue([]);
  extrairEgravarFichas.mockReset();
  extrairEgravarFichas.mockResolvedValue(undefined);
});

// Mesmo com falha, nada da casa fica para trás: a varredura do `afterEach`
// não teria o que apagar se o teste passar.
afterEach(async () => {
  await varrerRestosDaCasa();
});

describe("o pendente orfao quando a resposta falha depois da subida", () => {
  it("provedor que lança com anexos pendentes: erro fechado, 0 fichas, 0 arquivos no cofre e uso devolvido", async () => {
    const usoAntes = await usoDeHoje(casa);
    const pendenteAntes = await nomesEm("pendente");
    const fichasAntes = await contarAnexos(casa);
    const { provedor, responder } = provedorRoteirizado([
      new Error("503 do provedor"),
    ]);

    const resultado = await responderNoMentor({
      restauranteId: casa,
      conversaId: null,
      mensagemDoDono: "Olha meu cardápio",
      arquivos: [fotoDoTeste()],
      provedor,
    });

    expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
    expect(JSON.stringify(resultado)).not.toContain("503");
    expect(responder).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls).toEqual([["falha_mentor_provedor"]]);
    // Nada para trás: nem ficha na tabela, nem arquivo no cofre...
    expect(await contarAnexos(casa)).toBe(fichasAntes);
    expect(await nomesEm("pendente")).toEqual(pendenteAntes);
    // ...e a cota voltou (falha nossa, antes da resposta).
    expect(await usoDeHoje(casa)).toBe(usoAntes);
  });

  it("gravacao que falha apos a subida: erro fechado, 0 fichas, 0 arquivos, e o uso conta (a IA gastou)", async () => {
    estado.cliente = comFalhaNaGravacao(dono, "mentor_conversas");
    try {
      const usoAntes = await usoDeHoje(casa);
      const pendenteAntes = await nomesEm("pendente");
      const fichasAntes = await contarAnexos(casa);

      const resultado = await responderNoMentor({
        restauranteId: casa,
        conversaId: null,
        mensagemDoDono: "Olha meu cardápio",
        arquivos: [fotoDoTeste()],
        provedor: provedorRoteirizado([texto("Vi tudo.")]).provedor,
      });

      expect(resultado).toEqual({ ok: false, error: FRASE_INDISPONIVEL });
      expect(JSON.stringify(resultado)).not.toContain("forçada");
      expect(logError.mock.calls).toEqual([["falha_mentor_geral"]]);
      expect(await contarAnexos(casa)).toBe(fichasAntes);
      expect(await nomesEm("pendente")).toEqual(pendenteAntes);
      // A IA respondeu e gastou: o uso fica contado, sem devolução.
      expect(await usoDeHoje(casa)).toBe(usoAntes + 1);
    } finally {
      estado.cliente = dono;
    }
  });
});
