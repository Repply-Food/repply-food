import { pathToFileURL } from "node:url";
import { Client } from "pg";
import {
  type IdentificadoresFixture,
  criarFixture,
} from "../../tests/helpers/supabase-local.ts";
import { criarPerfisDeMassa } from "./medir-metricas.ts";
import {
  validarBancoDescartavel,
  validarJobsCronInativos,
  validarPostgresLocalBenchmark,
} from "./trava-nuvem.ts";

function identificadoresDoPerfil(
  indice: number,
  restauranteA: string,
  restauranteB: string
): IdentificadoresFixture {
  const base = 210 + indice * 10;
  return {
    restauranteA,
    restauranteB,
    usuarioA: `00000000-0000-4000-8000-000000000${base}`,
    usuarioB: `00000000-0000-4000-8000-000000000${base + 1}`,
    usuarioSemAcesso: `00000000-0000-4000-8000-000000000${base + 2}`,
    admin: `00000000-0000-4000-8000-000000000${base + 3}`,
  };
}

async function inserirMassa(
  cliente: Client,
  restauranteId: string,
  dias: number,
  contasPorDia: number,
  lacuna?: number
): Promise<void> {
  if (dias === 0) return;
  await cliente.query(
    `insert into public.entradas (
       restaurante_id, cod_entrada, aberta_em, fechada_em, dia_operacao,
       valor_itens, valor_descontos, taxa_servico, valor_consumido, pago,
       numero_ocupantes, tipo_ocupacao, hash_origem, recebida_em, atualizada_em
     )
     select $1::uuid, g.n, (date '2025-10-25' + ((g.n - 1) / $3)::int + time '12:00') at time zone 'America/Fortaleza',
       (date '2025-10-25' + ((g.n - 1) / $3)::int + time '13:00') at time zone 'America/Fortaleza',
       date '2025-10-25' + ((g.n - 1) / $3)::int, 100, 0, 10, 110, true, 2, 'Mesa',
       md5($1::text || g.n::text), timestamptz '2026-10-25 00:00:00+00', timestamptz '2026-10-25 00:00:00+00'
     from generate_series(1, $2::int * $3::int) g(n)
     where $4::int = 0 or ((g.n - 1) / $3)::int % $4::int <> 0`,
    [restauranteId, dias, contasPorDia, lacuna ?? 0]
  );
}

export async function prepararPerfil(
  nome: string,
  dbUrl: string
): Promise<void> {
  if (!validarPostgresLocalBenchmark(dbUrl))
    throw new Error(
      "O preparador aceita somente o PostgreSQL descartável local."
    );
  const indice = criarPerfisDeMassa().findIndex(
    (perfil) => perfil.nome === nome
  );
  const perfil = criarPerfisDeMassa()[indice];
  if (!perfil) throw new Error("Perfil de massa desconhecido.");
  const cliente = new Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 3000,
  });
  await cliente.connect();
  try {
    await validarBancoDescartavel(cliente);
    await validarJobsCronInativos(cliente);
    await cliente.query("begin");
    const fixture = await criarFixture(cliente, {
      transacaoExterna: true,
      identificadores: identificadoresDoPerfil(
        indice,
        perfil.restauranteA,
        perfil.restauranteB
      ),
      tokenA: `rf_benchmark_${perfil.nome}_a_ficticio`,
      tokenB: `rf_benchmark_${perfil.nome}_b_ficticio`,
    });
    await inserirMassa(
      cliente,
      fixture.restauranteA,
      perfil.dias,
      perfil.contasPorDia,
      perfil.lacunaACadaDias
    );
    await inserirMassa(
      cliente,
      fixture.restauranteB,
      perfil.dias,
      perfil.contasPorDia,
      perfil.lacunaACadaDias
    );
    await cliente.query("commit");
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    await cliente.end();
  }
}

export async function main(): Promise<void> {
  const perfil = process.argv[2];
  if (!perfil)
    throw new Error("Informe o perfil: vazio, esparso ou 365d_x500.");
  await prepararPerfil(perfil, process.env.BENCH_DB_URL ?? "");
  console.log(JSON.stringify({ preparado: perfil, transacional: true }));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    console.error(JSON.stringify({ erro: "Perfil local não preparado." }));
    process.exitCode = 1;
  });
}
