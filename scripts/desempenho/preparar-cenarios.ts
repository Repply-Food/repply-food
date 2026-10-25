import { pathToFileURL } from "node:url";
import { Client } from "pg";
import {
  type Fixture,
  type IdentificadoresFixture,
  criarFixture,
} from "../../tests/helpers/supabase-local.ts";
import { SEMENTE_CENARIO } from "./cenarios.ts";
import {
  validarBancoDescartavel,
  validarJobsCronInativos,
  validarPostgresLocalBenchmark,
} from "./trava-nuvem.ts";

const DB_URL = process.env.BENCH_DB_URL ?? "";
const DIAS = 90;
const CONTAS_POR_DIA = 100;
const DATA_INICIAL = "2026-07-27";
const IDENTIFICADORES: IdentificadoresFixture = {
  restauranteA: "00000000-0000-4000-8000-000000000100",
  restauranteB: "00000000-0000-4000-8000-000000000101",
  usuarioA: "00000000-0000-4000-8000-000000000200",
  usuarioB: "00000000-0000-4000-8000-000000000201",
  usuarioSemAcesso: "00000000-0000-4000-8000-000000000202",
  admin: "00000000-0000-4000-8000-000000000203",
};

async function popularRestaurante(
  cliente: Client,
  restauranteId: string
): Promise<void> {
  await cliente.query(
    `insert into public.entradas (
       restaurante_id, cod_entrada, cod_garcom, aberta_em, fechada_em,
       dia_operacao, valor_itens, valor_descontos, taxa_servico,
       valor_consumido, pago, numero_ocupantes, tipo_ocupacao, hash_origem,
       removida_em, recebida_em, atualizada_em
     )
     select
       $1::uuid,
       g.n::bigint,
       1 + ((g.n + $5::int) % 12)::int,
        ((($2::date + ((g.n - 1) / $3)::int) + time '11:00'
           + case when g.n % $3 = 0 then interval '0 minutes'
                  else ((g.n - 1) % $3)::int * interval '5 minutes' end)::timestamp
           at time zone 'America/Fortaleza'),
       case when g.n % $3 = 0 then null else
         ((($2::date + ((g.n - 1) / $3)::int) + time '11:00'
            + ((g.n - 1) % $3)::int * interval '5 minutes' + interval '55 minutes')::timestamp
            at time zone 'America/Fortaleza') end,
       $2::date + ((g.n - 1) / $3)::int,
       100, 0, 10, 110,
       ((g.n + $5::int) % 10 <> 0) and (g.n % $3 <> 0),
       1 + ((g.n + $5::int) % 6)::int,
       case when (g.n + $5::int) % 2 = 0 then 'Mesa' else 'Balcão' end,
       md5($1::text || ':' || g.n::text || ':' || $5::text),
       case when g.n % 50 = 0 and g.n % 100 <> 0
            then timestamptz '2026-10-25 00:00:00+00' else null end,
       timestamptz '2026-10-25 00:00:00+00',
       timestamptz '2026-10-25 00:00:00+00'
     from generate_series(1, $3::int * $4::int) as g(n)`,
    [restauranteId, DATA_INICIAL, CONTAS_POR_DIA, DIAS, SEMENTE_CENARIO]
  );
}

async function criarCenarios(): Promise<
  Pick<Fixture, "restauranteA" | "restauranteB" | "usuarioA" | "usuarioB">
> {
  if (!validarPostgresLocalBenchmark(DB_URL)) {
    throw new Error("O preparador aceita apenas PostgreSQL local em loopback.");
  }
  const cliente = new Client({
    connectionString: DB_URL,
    connectionTimeoutMillis: 3000,
  });
  await cliente.connect();
  try {
    await validarBancoDescartavel(cliente);
    await validarJobsCronInativos(cliente);
    await cliente.query("begin");
    const fixture = await criarFixture(cliente, {
      transacaoExterna: true,
      identificadores: IDENTIFICADORES,
      tokenA: "rf_benchmark_token_a_ficticio",
      tokenB: "rf_benchmark_token_b_ficticio",
    });
    await cliente.query(
      `update public.restaurantes
          set slug = case id when $1::uuid then 'benchmark-a-20261025'
                             when $2::uuid then 'benchmark-b-20261025' end
        where id = any($3::uuid[])`,
      [fixture.restauranteA, fixture.restauranteB, fixture.idsRestaurantes]
    );
    await cliente.query(
      `update auth.users
          set email = case id
            when $1::uuid then 'benchmark-a@teste.repply.local'
            when $2::uuid then 'benchmark-b@teste.repply.local'
            when $3::uuid then 'benchmark-sem-acesso@teste.repply.local'
            when $4::uuid then 'benchmark-admin@teste.repply.local'
          end
        where id = any($5::uuid[])`,
      [
        fixture.usuarioA,
        fixture.usuarioB,
        fixture.usuarioSemAcesso,
        fixture.admin,
        fixture.idsUsuarios,
      ]
    );
    await popularRestaurante(cliente, fixture.restauranteA);
    await popularRestaurante(cliente, fixture.restauranteB);
    await cliente.query(
      `insert into public.metas (restaurante_id, mes, valor)
       values ($1, date '2026-10-01', 25000)`,
      [fixture.restauranteA]
    );
    await cliente.query("commit");
    return {
      restauranteA: fixture.restauranteA,
      restauranteB: fixture.restauranteB,
      usuarioA: fixture.usuarioA,
      usuarioB: fixture.usuarioB,
    };
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    await cliente.end();
  }
}

export async function main(): Promise<void> {
  try {
    const fixture = await criarCenarios();
    console.log(
      JSON.stringify(
        {
          tipo: "dados_sinteticos",
          dias: DIAS,
          contasPorDiaPorCasa: CONTAS_POR_DIA,
          dataInicial: DATA_INICIAL,
          semente: SEMENTE_CENARIO,
          relogioUtc: "2026-10-25T00:00:00.000Z",
          fixtures: fixture,
          nenhumaInformacaoPessoal: true,
        },
        null,
        2
      )
    );
  } catch (erro: unknown) {
    const codigo =
      erro && typeof erro === "object" && "code" in erro
        ? String((erro as { code: unknown }).code)
        : "erro_interno";
    const mensagem =
      erro instanceof Error
        ? erro.message
            .split("\n", 1)[0]
            ?.replaceAll(/postgres(?:ql)?:\/\/\S+/gi, "[redigido]")
        : "falha sem mensagem";
    console.error(
      JSON.stringify({
        erro: "Não foi possível preparar cenários locais sintéticos.",
        codigo,
        mensagem,
      })
    );
    process.exitCode = 1;
  }
}

const caminhoExecucao = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : "";
if (import.meta.url === caminhoExecucao) {
  void main();
}
