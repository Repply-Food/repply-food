// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";
import {
  conectarBanco,
  envelhecerSinal,
  envelope,
  enviar,
} from "../helpers/supabase-local";

const estado = vi.hoisted(() => ({
  cliente: null as unknown,
  sessao: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "http://127.0.0.1:3000" }),
}));
// O admin de verdade, logado no Auth local: a RLS do banco vale de verdade.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => estado.cliente,
}));
vi.mock("@/lib/auth/sessao", () => ({
  exigirAdmin: async () => estado.sessao,
  obterSessao: async () => estado.sessao,
}));

import {
  cadastrarRestauranteAction,
  criarLoginAction,
  editarRestauranteAction,
  gerarTokenAction,
  mudarSituacaoAction,
  pedirReenvioAction,
  redefinirSenhaAction,
  revogarTokensAction,
  trocarEmailAction,
} from "@/lib/admin/actions";
import { detalheDoRestaurante, listarRestaurantes } from "@/lib/admin/dados";
import { hojeNaCasa, somarDias } from "@/lib/admin/datas";
import { DIA_FECHADO } from "@/lib/admin/horario";
import { registrarAberturaDoPainel } from "@/lib/admin/registro";
import type { RestauranteInput } from "@/lib/admin/schemas";

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const servico = criarCliente<Database>(
  URL_LOCAL,
  chaveLocal("service_role"),
  opcoes
);
const sufixo = randomUUID().slice(0, 8);
const email = (quem: string) => `${quem}-${sufixo}@teste.repply.local`;
const senhaDoAdmin = `admin-${randomUUID()}`;
const CNPJ = "13.579.246/0001-01";
const registros: string[] = [];
const segredos: string[] = [];

let banco: Client;
let adminId = "";
let clienteDoAdmin: unknown = null;
let casaA = "";
let casaB = "";
let donoId = "";
let senhaDoDono = "";

function cadastro(nome: string, cnpj = ""): RestauranteInput {
  const dias = Array.from({ length: 7 }, () => ({ ...DIA_FECHADO }));
  dias[2] = { ...DIA_FECHADO, modo: "um" };
  return { nome, cnpj, fuso: "America/Fortaleza", horaVirada: "5", dias };
}

async function entrar(emailDaConta: string, senha: string) {
  const cliente = criarCliente<Database>(URL_LOCAL, chaveLocal("anon"), opcoes);
  const { data, error } = await cliente.auth.signInWithPassword({
    email: emailDaConta,
    password: senha,
  });
  return { cliente, sessao: data.session, error };
}

beforeAll(async () => {
  vi.stubEnv("SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", chaveLocal("service_role"));
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  // Tudo o que o código escrever no registro do servidor fica guardado para o
  // último teste conferir que nenhuma senha nem token vazou.
  for (const metodo of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      registros.push(JSON.stringify(args));
    });
  }
  banco = await conectarBanco();
  const { data, error } = await servico.auth.admin.createUser({
    email: email("admin"),
    password: senhaDoAdmin,
    email_confirm: true,
    user_metadata: { nome: "Admin de Teste" },
  });
  if (error || !data.user) throw new Error("não criou o admin de teste");
  adminId = data.user.id;
  await banco.query("insert into public.admins_repply (user_id) values ($1)", [
    adminId,
  ]);
  const { cliente, error: erroDeEntrada } = await entrar(
    email("admin"),
    senhaDoAdmin
  );
  if (erroDeEntrada) throw new Error("o admin de teste não entrou");
  clienteDoAdmin = cliente;
  estado.cliente = cliente;
  estado.sessao = {
    userId: adminId,
    email: email("admin"),
    ehAdmin: true,
    precisaTrocarSenha: false,
    casas: [],
  };
});

afterAll(async () => {
  try {
    await banco.query("delete from public.restaurantes where slug like $1", [
      `%${sufixo}%`,
    ]);
    const contas = await banco.query<{ id: string }>(
      "select id from auth.users where email like $1",
      [`%-${sufixo}@teste.repply.local`]
    );
    for (const { id } of contas.rows) await servico.auth.admin.deleteUser(id);
  } finally {
    await banco.end();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  }
});

describe("funções do servidor do admin contra o banco e o Auth locais", () => {
  it("cadastra duas casas com o mesmo nome: a segunda ganha número no endereço", async () => {
    const primeira = await cadastrarRestauranteAction(
      cadastro(`Casa Ação ${sufixo}`, CNPJ)
    );
    const segunda = await cadastrarRestauranteAction(
      cadastro(`Casa Ação ${sufixo}`)
    );
    casaA = (primeira.ok && primeira.data?.id) || "";
    casaB = (segunda.ok && segunda.data?.id) || "";
    const { rows } = await banco.query<{
      slug: string;
      cnpj: string | null;
      horario: unknown;
    }>(
      `select slug, cnpj, horario_funcionamento as horario from public.restaurantes
        where id = any($1::uuid[]) order by criado_em`,
      [[casaA, casaB]]
    );
    expect(rows.map((r) => r.slug)).toEqual([
      `casa-acao-${sufixo}`,
      `casa-acao-${sufixo}-2`,
    ]);
    expect(rows[0]?.cnpj).toBe("13579246000101");
    expect(rows[0]?.horario).toEqual([
      { dia: 2, abre: "11:00", fecha: "15:00" },
    ]);
  });

  it("CNPJ repetido é recusado com frase do produto", async () => {
    expect(
      await cadastrarRestauranteAction(cadastro(`Outra ${sufixo}`, CNPJ))
    ).toEqual({
      ok: false,
      error: "Já existe um restaurante com este CNPJ.",
    });
  });

  it("gera o token: aparece uma vez e a recepção aceita", async () => {
    const gerado = await gerarTokenAction(casaA, "agora");
    if (!gerado.ok || !gerado.data) throw new Error("não gerou o token");
    segredos.push(gerado.data.token);
    expect(gerado.data.token).toMatch(/^rf_[0-9A-Za-z]{32}$/);
    expect(gerado.data.instrucoes).toContain(gerado.data.token);
    expect(gerado.data.instrucoes).toContain(
      "http://127.0.0.1:54321/functions/v1/receber-envio"
    );
    expect((await enviar(gerado.data.token, envelope([]))).status).toBe(200);
  });

  it("'em 24 h': o antigo e o novo valem juntos; revogar para os dois", async () => {
    const antigo = segredos[0] ?? "";
    const novo = await gerarTokenAction(casaA, "24h");
    if (!novo.ok || !novo.data) throw new Error("não gerou o token");
    segredos.push(novo.data.token);
    await envelhecerSinal(banco, casaA);
    expect((await enviar(antigo, envelope([]))).status).toBe(200);
    await envelhecerSinal(banco, casaA);
    expect((await enviar(novo.data.token, envelope([]))).status).toBe(200);
    expect(await revogarTokensAction(casaA)).toEqual({ ok: true });
    expect((await enviar(novo.data.token, envelope([]))).status).toBe(401);
    expect(await revogarTokensAction(casaA)).toEqual({
      ok: false,
      error: "Esta casa não tem token válido para revogar.",
    });
  });

  it("cria o login com e-mail novo: senha provisória e troca obrigatória", async () => {
    const criado = await criarLoginAction(casaA, {
      email: email("dono").toUpperCase(),
    });
    if (!criado.ok || criado.data?.tipo !== "novo")
      throw new Error("não criou o login");
    senhaDoDono = criado.data.senha;
    segredos.push(senhaDoDono);
    expect(criado.data.email).toBe(email("dono"));
    expect(senhaDoDono).toHaveLength(12);
    expect(criado.data.mensagem).toContain(senhaDoDono);
    expect(criado.data.mensagem).toContain("http://127.0.0.1:3000");
    const { data } = await servico.rpc("id_do_login_por_email", {
      p_email: email("dono"),
    });
    donoId = data ?? "";
    const conta = await servico.auth.admin.getUserById(donoId);
    expect(conta.data.user?.app_metadata?.precisa_trocar_senha).toBe(true);
    expect((await entrar(email("dono"), senhaDoDono)).error).toBeNull();
  });

  it("o mesmo e-mail na segunda casa liga a conta, sem mudar a senha (D-10)", async () => {
    expect(await criarLoginAction(casaB, { email: email("dono") })).toEqual({
      ok: true,
      data: { tipo: "ligado", email: email("dono"), outrasCasas: 1 },
    });
    expect((await entrar(email("dono"), senhaDoDono)).error).toBeNull();
  });

  it("ligar de novo na mesma casa e ligar um admin são recusados", async () => {
    expect(await criarLoginAction(casaB, { email: email("dono") })).toEqual({
      ok: false,
      error: "Este e-mail já tem acesso a esta casa.",
    });
    expect(await criarLoginAction(casaB, { email: email("admin") })).toEqual({
      ok: false,
      error: "Este e-mail é de um admin da Repply.",
    });
  });

  it("redefinir a senha desconecta os aparelhos e liga a troca obrigatória (D-55)", async () => {
    const aberto = await entrar(email("dono"), senhaDoDono);
    if (!aberto.sessao) throw new Error("o dono não entrou");
    const nova = await redefinirSenhaAction(casaA, donoId);
    if (!nova.ok || !nova.data) throw new Error("não redefiniu");
    segredos.push(nova.data.senha);
    expect(nova.data.outrasCasas).toBe(1);
    expect(nova.data.mensagem).toContain(nova.data.senha);
    expect(
      (await servico.auth.getUser(aberto.sessao.access_token)).data.user
    ).toBeNull();
    expect((await entrar(email("dono"), senhaDoDono)).error?.code).toBe(
      "invalid_credentials"
    );
    expect((await entrar(email("dono"), nova.data.senha)).error).toBeNull();
    const conta = await servico.auth.admin.getUserById(donoId);
    expect(conta.data.user?.app_metadata?.precisa_trocar_senha).toBe(true);
    senhaDoDono = nova.data.senha;
  });

  it("não mexe em login que não é da casa (nem no do admin)", async () => {
    expect(await redefinirSenhaAction(casaA, adminId)).toEqual({
      ok: false,
      error: "Este login não é desta casa.",
    });
  });

  it("troca o e-mail na hora, sem confirmação, e recusa e-mail de outro login", async () => {
    expect(
      await trocarEmailAction(casaA, donoId, { email: email("admin") })
    ).toEqual({
      ok: false,
      error: "Este e-mail já é de outro login.",
    });
    expect(
      await trocarEmailAction(casaA, donoId, { email: email("novo") })
    ).toEqual({
      ok: true,
      data: { outrasCasas: 1 },
    });
    expect((await entrar(email("novo"), senhaDoDono)).error).toBeNull();
  });

  it("pede reenvio dentro do limite e recusa data fora dele", async () => {
    const hoje = hojeNaCasa(new Date(), "America/Fortaleza");
    expect(
      await pedirReenvioAction(casaA, { desde: somarDias(hoje, 1) })
    ).toEqual({
      ok: false,
      error: "A data não pode ser no futuro.",
    });
    expect(
      await pedirReenvioAction(casaA, { desde: somarDias(hoje, -121) })
    ).toEqual({
      ok: false,
      error: "A data não pode ser anterior a 120 dias.",
    });
    expect(
      await pedirReenvioAction(casaA, { desde: somarDias(hoje, -3) })
    ).toEqual({ ok: true });
    const { rows } = await banco.query<{ desde: string }>(
      "select pedido_reenvio_desde::text as desde from public.restaurantes where id = $1",
      [casaA]
    );
    expect(rows[0]?.desde).toBe(somarDias(hoje, -3));
  });

  it("suspende e reativa (D-57)", async () => {
    expect(await mudarSituacaoAction(casaB, "suspenso")).toEqual({ ok: true });
    const lido = await banco.query(
      "select situacao from public.restaurantes where id = $1",
      [casaB]
    );
    expect(lido.rows[0]).toEqual({ situacao: "suspenso" });
    expect(await mudarSituacaoAction(casaB, "ativo")).toEqual({ ok: true });
  });

  it("editar a virada recalcula o dia de operação das contas", async () => {
    // Conta aberta às 03:00 de 10/10 em Fortaleza: com a virada às 5h é do dia
    // 09; com a virada às 2h passa a ser do dia 10.
    await banco.query(
      `insert into public.entradas (restaurante_id, cod_entrada, aberta_em, dia_operacao, valor_consumido, pago, hash_origem)
       values ($1, 1, '2026-10-10T06:00:00Z', '2026-10-09', 10, true, 'teste-virada')`,
      [casaA]
    );
    expect(
      await editarRestauranteAction(casaA, {
        ...cadastro(`Casa Ação ${sufixo}`, CNPJ),
        horaVirada: "2",
      })
    ).toEqual({ ok: true, data: { recalculou: true, mudouFuso: false } });
    const { rows } = await banco.query<{ dia: string }>(
      "select dia_operacao::text as dia from public.entradas where restaurante_id = $1",
      [casaA]
    );
    expect(rows[0]?.dia).toBe("2026-10-10");
  });

  it("o detalhe junta tudo, sem o hash do token, com o nome de quem fez", async () => {
    const gerado = await gerarTokenAction(casaA, "agora");
    if (gerado.ok && gerado.data) segredos.push(gerado.data.token);
    const detalhe = await detalheDoRestaurante(casaA);
    if (!detalhe) throw new Error("sem detalhe");
    expect(detalhe.restaurante.horaVirada).toBe("02:00");
    expect(detalhe.restaurante.pedidoReenvioDesde).not.toBeNull();
    expect(detalhe.tokens).toHaveLength(1);
    expect(Object.keys(detalhe.tokens[0] ?? {})).not.toContain("hash");
    expect(detalhe.tokens[0]?.criadoPor).toBe("Admin de Teste");
    expect(detalhe.logins).toEqual([
      expect.objectContaining({
        userId: donoId,
        email: email("novo"),
        precisaTrocarSenha: true,
        outrasCasas: 1,
      }),
    ]);
    expect(detalhe.envios.length).toBeGreaterThan(0);
    expect(detalhe.historico.map((h) => h.acao)).toEqual(
      expect.arrayContaining([
        "cadastrou",
        "gerou_token",
        "revogou_token",
        "criou_login",
        "redefiniu_senha",
        "trocou_email",
        "pediu_reenvio",
        "editou_dados",
      ])
    );
    expect(detalhe.historico.every((h) => h.autor === "Admin de Teste")).toBe(
      true
    );
    expect(await detalheDoRestaurante(randomUUID())).toBeNull();
    expect(await detalheDoRestaurante("nao-e-uuid")).toBeNull();
  });

  it("a lista traz as casas novas com a versão do SCC", async () => {
    const minhas = (await listarRestaurantes()).filter((l) =>
      l.slug.includes(sufixo)
    );
    expect(minhas.map((l) => l.id).sort()).toEqual([casaA, casaB].sort());
    expect(minhas.find((l) => l.id === casaA)?.versaoScc).toBe("teste-1.0");
  });

  it("'abriu o painel' entra uma vez por hora", async () => {
    await registrarAberturaDoPainel(casaB);
    await registrarAberturaDoPainel(casaB);
    const { rows } = await banco.query<{ total: number }>(
      "select count(*)::int as total from public.registro_admin where restaurante_id = $1 and acao = 'abriu_painel'",
      [casaB]
    );
    expect(rows[0]?.total).toBe(1);
  });

  it("o histórico não guarda senha, token nem e-mail completo (D-59)", async () => {
    const { rows } = await banco.query<{ detalhe: string | null }>(
      "select detalhe from public.registro_admin where restaurante_id = any($1::uuid[])",
      [[casaA, casaB]]
    );
    const tudo = rows.map((r) => r.detalhe ?? "").join("\n");
    for (const segredo of [...segredos, email("dono"), email("novo")]) {
      expect(tudo).not.toContain(segredo);
    }
  });

  it("nenhuma senha nem token foi para o registro do servidor", () => {
    expect(segredos.length).toBeGreaterThanOrEqual(5);
    const tudo = registros.join("\n");
    for (const segredo of segredos) expect(tudo).not.toContain(segredo);
  });
});

/*
 * Contrapartida da revisão da Tarefa 3: a consulta das casas do login (a
 * `obterSessao` de verdade, com o `!inner` em `acessos`) contra o banco e o
 * Auth locais. Antes do `!inner`, o admin carregava TODAS as casas por causa da
 * RLS de leitura dele (pendência 43). O mock do arquivo troca só a sessão das
 * funções do admin; aqui a `obterSessao` é a original, lendo pelo cliente
 * logado de cada caso.
 */
describe("a consulta das casas do login (obterSessao de verdade, banco local)", () => {
  async function sessaoReal() {
    const real =
      await vi.importActual<typeof import("@/lib/auth/sessao")>(
        "@/lib/auth/sessao"
      );
    return real.obterSessao();
  }

  it("dono: vê só a casa dele, não as outras casas do banco", async () => {
    const senha = `dono-${randomUUID()}`;
    const { data, error } = await servico.auth.admin.createUser({
      email: email("so-um"),
      password: senha,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error("não criou o dono de teste");
    await banco.query(
      "insert into public.acessos (user_id, restaurante_id) values ($1, $2)",
      [data.user.id, casaB]
    );
    const { cliente, error: erroDeEntrada } = await entrar(
      email("so-um"),
      senha
    );
    if (erroDeEntrada) throw new Error("o dono de teste não entrou");
    estado.cliente = cliente;
    try {
      const sessao = await sessaoReal();
      expect(sessao?.ehAdmin).toBe(false);
      expect(sessao?.casas.map((c) => c.id)).toEqual([casaB]);
    } finally {
      estado.cliente = clienteDoAdmin;
    }
  });

  it("admin sem casa ligada: vê lista vazia, mesmo lendo todas as casas pela RLS", async () => {
    const sessao = await sessaoReal();
    expect(sessao?.ehAdmin).toBe(true);
    expect(sessao?.casas).toEqual([]);
    // Prova de que a RLS do admin enxerga as casas: sem o !inner viriam todas.
    const { data } = await (
      clienteDoAdmin as ReturnType<typeof criarCliente<Database>>
    )
      .from("restaurantes")
      .select("id")
      .in("id", [casaA, casaB]);
    expect(data).toHaveLength(2);
  });

  it("admin com casa ligada: vê só a ligada", async () => {
    await banco.query(
      "insert into public.acessos (user_id, restaurante_id) values ($1, $2)",
      [adminId, casaA]
    );
    try {
      const sessao = await sessaoReal();
      expect(sessao?.ehAdmin).toBe(true);
      expect(sessao?.casas.map((c) => c.id)).toEqual([casaA]);
    } finally {
      await banco.query(
        "delete from public.acessos where user_id = $1 and restaurante_id = $2",
        [adminId, casaA]
      );
    }
  });
});
