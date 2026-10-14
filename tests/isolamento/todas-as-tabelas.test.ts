// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Fixture,
  comoAutenticado,
  conectarBanco,
  criarFixture,
  limparFixture,
} from "../helpers/supabase-local";

type Identidade = "clienteA" | "semAcesso" | "anon" | "admin";

type Tabela = {
  nome: string;
  /** Coluna que diz de quem é a linha. */
  dono: string;
  parametros: (f: Fixture) => unknown[];
  clienteVe: (f: Fixture) => string[];
  adminVe: number;
};

const doRestaurante = (f: Fixture) => [f.idsRestaurantes];
const soODele = (f: Fixture) => [f.restauranteA];
const nada = () => [];

const tabelas: Tabela[] = [
  {
    nome: "restaurantes",
    dono: "id",
    parametros: doRestaurante,
    clienteVe: soODele,
    adminVe: 2,
  },
  {
    nome: "acessos",
    dono: "restaurante_id",
    parametros: doRestaurante,
    clienteVe: soODele,
    adminVe: 2,
  },
  {
    nome: "admins_repply",
    dono: "user_id",
    parametros: (f) => [f.idsUsuarios],
    clienteVe: nada,
    adminVe: 1,
  },
  {
    nome: "tokens_envio",
    dono: "restaurante_id",
    parametros: doRestaurante,
    clienteVe: nada,
    adminVe: 2,
  },
  {
    nome: "envios",
    dono: "restaurante_id",
    parametros: doRestaurante,
    clienteVe: nada,
    adminVe: 2,
  },
  {
    nome: "sinal_de_vida",
    dono: "restaurante_id",
    parametros: doRestaurante,
    clienteVe: soODele,
    adminVe: 2,
  },
  {
    nome: "entradas",
    dono: "restaurante_id",
    parametros: doRestaurante,
    clienteVe: soODele,
    adminVe: 2,
  },
  {
    nome: "metas",
    dono: "restaurante_id",
    parametros: doRestaurante,
    clienteVe: soODele,
    adminVe: 2,
  },
];

type Tentativa = {
  descricao: string;
  sql: string;
  parametros: (f: Fixture) => unknown[];
  esperado: "recusa" | "zero linhas" | "uma linha";
};

const sufixo = randomUUID();
const a = (f: Fixture) => [f.restauranteA];
const b = (f: Fixture) => [f.restauranteB];

const escritasDoCliente: Tentativa[] = [
  {
    descricao: "criar restaurante",
    sql: "insert into public.restaurantes (slug, nome) values ($1, 'invasor')",
    parametros: () => [`invasor-${sufixo}`],
    esperado: "recusa",
  },
  {
    descricao: "alterar o próprio restaurante",
    sql: "update public.restaurantes set nome = 'invadido' where id = $1",
    parametros: a,
    esperado: "zero linhas",
  },
  {
    descricao: "alterar o restaurante B",
    sql: "update public.restaurantes set nome = 'invadido' where id = $1",
    parametros: b,
    esperado: "zero linhas",
  },
  {
    descricao: "excluir o próprio restaurante",
    sql: "delete from public.restaurantes where id = $1",
    parametros: a,
    esperado: "zero linhas",
  },
  {
    descricao: "excluir o restaurante B",
    sql: "delete from public.restaurantes where id = $1",
    parametros: b,
    esperado: "zero linhas",
  },
  {
    descricao: "dar a si mesmo acesso ao restaurante B",
    sql: "insert into public.acessos (user_id, restaurante_id) values ($1, $2)",
    parametros: (f) => [f.usuarioA, f.restauranteB],
    esperado: "recusa",
  },
  {
    descricao: "alterar o próprio acesso",
    sql: "update public.acessos set criado_em = now() where restaurante_id = $1",
    parametros: a,
    esperado: "zero linhas",
  },
  {
    descricao: "excluir o acesso do restaurante B",
    sql: "delete from public.acessos where restaurante_id = $1",
    parametros: b,
    esperado: "zero linhas",
  },
  {
    descricao: "virar admin da Repply",
    sql: "insert into public.admins_repply (user_id) values ($1)",
    parametros: (f) => [f.usuarioA],
    esperado: "recusa",
  },
  {
    descricao: "excluir um admin da Repply",
    sql: "delete from public.admins_repply where user_id = $1",
    parametros: (f) => [f.admin],
    esperado: "zero linhas",
  },
  {
    descricao: "criar token para o próprio restaurante",
    sql: "insert into public.tokens_envio (restaurante_id, hash, prefixo) values ($1, $2, 'inv')",
    parametros: (f) => [f.restauranteA, `hash-a-${sufixo}`],
    esperado: "recusa",
  },
  {
    descricao: "criar token para o restaurante B",
    sql: "insert into public.tokens_envio (restaurante_id, hash, prefixo) values ($1, $2, 'inv')",
    parametros: (f) => [f.restauranteB, `hash-b-${sufixo}`],
    esperado: "recusa",
  },
  {
    descricao: "revogar o token do restaurante B",
    sql: "update public.tokens_envio set revogado_em = now() where restaurante_id = $1",
    parametros: b,
    esperado: "zero linhas",
  },
  {
    descricao: "excluir o próprio token",
    sql: "delete from public.tokens_envio where restaurante_id = $1",
    parametros: a,
    esperado: "zero linhas",
  },
  {
    descricao: "inserir envio",
    sql: "insert into public.envios (restaurante_id, http_status) values ($1, 200)",
    parametros: a,
    esperado: "recusa",
  },
  {
    descricao: "alterar envio",
    sql: "update public.envios set erro = 'adulterado' where restaurante_id = $1",
    parametros: a,
    esperado: "zero linhas",
  },
  {
    descricao: "excluir envio do restaurante B",
    sql: "delete from public.envios where restaurante_id = $1",
    parametros: b,
    esperado: "zero linhas",
  },
  {
    descricao: "inserir sinal de vida",
    sql: "insert into public.sinal_de_vida (restaurante_id) values ($1)",
    parametros: a,
    esperado: "recusa",
  },
  {
    descricao: "alterar o próprio sinal de vida",
    sql: "update public.sinal_de_vida set estado = 'em_dia' where restaurante_id = $1",
    parametros: a,
    esperado: "zero linhas",
  },
  {
    descricao: "excluir o sinal de vida do restaurante B",
    sql: "delete from public.sinal_de_vida where restaurante_id = $1",
    parametros: b,
    esperado: "zero linhas",
  },
  {
    descricao: "inserir conta no próprio restaurante",
    sql: "insert into public.entradas (restaurante_id, cod_entrada, aberta_em, dia_operacao, valor_consumido, pago, hash_origem) values ($1, 2, now(), current_date, 1, true, 'inv')",
    parametros: a,
    esperado: "recusa",
  },
  {
    descricao: "alterar conta do próprio restaurante",
    sql: "update public.entradas set valor_consumido = 1 where restaurante_id = $1",
    parametros: a,
    esperado: "zero linhas",
  },
  {
    descricao: "excluir conta do restaurante B",
    sql: "delete from public.entradas where restaurante_id = $1",
    parametros: b,
    esperado: "zero linhas",
  },
  {
    descricao: "criar meta para o restaurante B",
    sql: "insert into public.metas (restaurante_id, mes, valor) values ($1, '2026-11-01', 1)",
    parametros: b,
    esperado: "recusa",
  },
  {
    descricao: "alterar a meta do restaurante B",
    sql: "update public.metas set valor = 1 where restaurante_id = $1",
    parametros: b,
    esperado: "zero linhas",
  },
  {
    descricao: "excluir a meta do restaurante B",
    sql: "delete from public.metas where restaurante_id = $1",
    parametros: b,
    esperado: "zero linhas",
  },
];

const escritasDoAdmin: Tentativa[] = [
  {
    descricao: "inserir envio",
    sql: "insert into public.envios (restaurante_id, http_status) values ($1, 200)",
    parametros: a,
    esperado: "recusa",
  },
  {
    descricao: "inserir sinal de vida",
    sql: "insert into public.sinal_de_vida (restaurante_id) values ($1)",
    parametros: a,
    esperado: "recusa",
  },
  {
    descricao: "tornar outro login admin",
    sql: "insert into public.admins_repply (user_id) values ($1)",
    parametros: (f) => [f.usuarioA],
    esperado: "recusa",
  },
  {
    descricao: "alterar envio",
    sql: "update public.envios set erro = 'adulterado' where restaurante_id = $1",
    parametros: a,
    esperado: "zero linhas",
  },
  {
    descricao: "alterar sinal de vida",
    sql: "update public.sinal_de_vida set estado = 'em_dia' where restaurante_id = $1",
    parametros: a,
    esperado: "zero linhas",
  },
  {
    descricao: "sair da lista de admins",
    sql: "delete from public.admins_repply where user_id = $1",
    parametros: (f) => [f.admin],
    esperado: "zero linhas",
  },
  {
    descricao: "alterar o cadastro do restaurante",
    sql: "update public.restaurantes set nome = nome where id = $1",
    parametros: a,
    esperado: "uma linha",
  },
  {
    descricao: "criar token de envio",
    sql: "insert into public.tokens_envio (restaurante_id, hash, prefixo) values ($1, $2, 'adm')",
    parametros: (f) => [f.restauranteA, `hash-admin-${sufixo}`],
    esperado: "uma linha",
  },
  {
    descricao: "dar acesso a um login",
    sql: "insert into public.acessos (user_id, restaurante_id) values ($1, $2)",
    parametros: (f) => [f.usuarioSemAcesso, f.restauranteB],
    esperado: "uma linha",
  },
];

describe("isolamento nas 8 tabelas", () => {
  let banco: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    banco = await conectarBanco();
    fixture = await criarFixture(banco);
    const ids = [fixture.restauranteA, fixture.restauranteB];
    await banco.query(
      `insert into public.entradas (
         restaurante_id, cod_entrada, aberta_em, dia_operacao, valor_consumido, pago, hash_origem
       ) values ($1, 1, now(), current_date, 100, true, 'iso-a'),
                ($2, 1, now(), current_date, 100, true, 'iso-b')`,
      ids
    );
    await banco.query(
      "insert into public.metas (restaurante_id, mes, valor) values ($1, '2026-10-01', 1000), ($2, '2026-10-01', 2000)",
      ids
    );
    await banco.query(
      "insert into public.envios (restaurante_id, http_status) values ($1, 200), ($2, 200)",
      ids
    );
    await banco.query(
      "insert into public.sinal_de_vida (restaurante_id) values ($1), ($2)",
      ids
    );
  });

  afterAll(async () => {
    try {
      if (fixture) await limparFixture(banco, fixture);
    } finally {
      await banco?.end();
    }
  });

  async function ler(
    identidade: Identidade,
    tabela: Tabela
  ): Promise<string[]> {
    const sql = `select ${tabela.dono}::text as dono from public.${tabela.nome} where ${tabela.dono} = any($1::uuid[]) order by 1`;
    const parametros = tabela.parametros(fixture);
    if (identidade === "anon") {
      await banco.query("begin");
      try {
        await banco.query("set local role anon");
        const anonimo = await banco.query<{ dono: string }>(sql, parametros);
        return anonimo.rows.map((linha) => linha.dono);
      } finally {
        await banco.query("rollback");
      }
    }
    const usuario = {
      clienteA: fixture.usuarioA,
      semAcesso: fixture.usuarioSemAcesso,
      admin: fixture.admin,
    }[identidade];
    const resultado = await comoAutenticado(banco, usuario, () =>
      banco.query<{ dono: string }>(sql, parametros)
    );
    return resultado.rows.map((linha) => linha.dono);
  }

  /** Executa `executar` como visitante sem login (papel anon), no padrão do `ler`. */
  async function comoAnon<T>(executar: () => Promise<T>): Promise<T> {
    await banco.query("begin");
    try {
      await banco.query("set local role anon");
      const resultado = await executar();
      await banco.query("commit");
      return resultado;
    } catch (erro) {
      await banco.query("rollback");
      throw erro;
    }
  }

  /** `quem` é o id de um login ou "anon", o visitante sem login. */
  async function tentar(
    quem: string | "anon",
    tentativa: Tentativa
  ): Promise<void> {
    const consulta = () =>
      banco.query(tentativa.sql, tentativa.parametros(fixture));
    const executar = () =>
      quem === "anon"
        ? comoAnon(consulta)
        : comoAutenticado(banco, quem, consulta);
    if (tentativa.esperado === "recusa") {
      await expect(executar()).rejects.toMatchObject({ code: "42501" });
      return;
    }
    expect((await executar()).rowCount).toBe(
      tentativa.esperado === "uma linha" ? 1 : 0
    );
  }

  it.each(tabelas)("$nome: cada um lê só o que é seu", async (tabela) => {
    expect(await ler("clienteA", tabela)).toEqual(tabela.clienteVe(fixture));
    expect(await ler("semAcesso", tabela)).toEqual([]);
    expect(await ler("anon", tabela)).toEqual([]);
    expect(await ler("admin", tabela)).toHaveLength(tabela.adminVe);
  });

  it.each(escritasDoCliente)(
    "o cliente A não consegue $descricao ($esperado)",
    async (tentativa) => {
      await tentar(fixture.usuarioA, tentativa);
    }
  );

  it.each(escritasDoCliente)(
    "o login sem acesso não consegue $descricao ($esperado)",
    async (tentativa) => {
      await tentar(fixture.usuarioSemAcesso, tentativa);
    }
  );

  it.each(escritasDoCliente)(
    "sem login ninguém consegue $descricao ($esperado)",
    async (tentativa) => {
      await tentar("anon", tentativa);
    }
  );

  it("depois de todas as tentativas de quem não é admin, nada mudou", async () => {
    const estado = await banco.query(
      `select
         (select string_agg(nome, '|' order by nome) from public.restaurantes where id = any($1::uuid[])) as restaurantes,
         (select count(*)::int from public.acessos where restaurante_id = any($1::uuid[])) as acessos,
         (select count(*)::int from public.admins_repply where user_id = any($2::uuid[])) as admins,
         (select count(*)::int from public.tokens_envio where restaurante_id = any($1::uuid[]) and revogado_em is null) as tokens,
         (select count(*)::int from public.envios where restaurante_id = any($1::uuid[]) and erro is null) as envios,
         (select count(*)::int from public.sinal_de_vida where restaurante_id = any($1::uuid[]) and estado = 'aguardando') as sinais,
         (select sum(valor_consumido)::text from public.entradas where restaurante_id = any($1::uuid[])) as entradas,
         (select sum(valor)::text from public.metas where restaurante_id = any($1::uuid[])) as metas`,
      [fixture.idsRestaurantes, fixture.idsUsuarios]
    );
    expect(estado.rows[0]).toEqual({
      restaurantes: "Casa de teste A|Casa de teste B",
      acessos: 2,
      admins: 1,
      tokens: 2,
      envios: 2,
      sinais: 2,
      entradas: "200.00",
      metas: "3000.00",
    });
  });

  it.each(escritasDoAdmin)(
    "o admin ao $descricao: $esperado",
    async (tentativa) => {
      await tentar(fixture.admin, tentativa);
    }
  );
});
