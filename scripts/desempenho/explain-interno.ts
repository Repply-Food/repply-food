import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { comoAutenticado } from "../../tests/helpers/supabase-local.ts";
import {
  validarAmbienteBenchmark,
  validarBancoDescartavel,
  validarJobsCronInativos,
} from "./trava-nuvem.ts";

type ClienteSessao = { query: (sql: string) => Promise<unknown> };

export async function configurarAutoExplainAdministrativo(
  cliente: ClienteSessao
): Promise<void> {
  try {
    await cliente.query("load 'auto_explain'");
    await cliente.query("set auto_explain.log_min_duration = 0");
    await cliente.query("set auto_explain.log_analyze = on");
    await cliente.query("set auto_explain.log_buffers = on");
    await cliente.query("set auto_explain.log_timing = on");
    await cliente.query("set auto_explain.log_nested_statements = on");
    await cliente.query("set auto_explain.log_format = 'json'");
    await cliente.query("set client_min_messages = log");
  } catch {
    throw new Error(
      "auto_explain nested indisponível na instância descartável."
    );
  }
}

export async function configurarAutoExplain(
  cliente: ClienteSessao
): Promise<void> {
  try {
    await cliente.query("set local statement_timeout = '20000ms'");
  } catch {
    throw new Error(
      "auto_explain nested indisponível na instância descartável."
    );
  }
}

export async function coletarExplainInterno(opcoes: {
  httpUrl: string;
  dbUrl: string;
  usuarioId: string;
  restauranteId: string;
  saida: string;
}): Promise<void> {
  validarAmbienteBenchmark(opcoes);
  const cliente = new Client({
    connectionString: opcoes.dbUrl,
    connectionTimeoutMillis: 3000,
  });
  const avisos: string[] = [];
  cliente.on("notice", (aviso) => {
    if (aviso.message?.startsWith("duration:")) avisos.push(aviso.message);
  });
  await cliente.connect();
  try {
    await validarBancoDescartavel(cliente);
    await validarJobsCronInativos(cliente);
    await configurarAutoExplainAdministrativo(cliente);
    await comoAutenticado(cliente, opcoes.usuarioId, async () => {
      await configurarAutoExplain(cliente);
      await cliente.query(
        "select * from public.metrica_faturamento_do_dia($1::uuid, $2::timestamptz)",
        [opcoes.restauranteId, "2026-10-24T12:00:00.000Z"]
      );
      await cliente.query(
        "select * from public.metrica_comparacao_do_dia($1::uuid, $2::timestamptz)",
        [opcoes.restauranteId, "2026-10-24T12:00:00.000Z"]
      );
      await cliente.query(
        "select * from public.metrica_curva_do_dia($1::uuid, $2::timestamptz)",
        [opcoes.restauranteId, "2026-10-24T12:00:00.000Z"]
      );
      await cliente.query(
        "select * from public.metrica_resultados_resumo($1::uuid, $2::date, $3::date, $4::text)",
        [opcoes.restauranteId, "2026-07-27", "2026-10-24", "semana"]
      );
    });
    if (!avisos.length)
      throw new Error(
        "auto_explain não entregou planos nested à conexão; colete o log exclusivo da instância."
      );
    await mkdir(dirname(opcoes.saida), { recursive: true });
    await writeFile(
      opcoes.saida,
      JSON.stringify(
        {
          papel: "authenticated",
          fonte: "auto_explain nested",
          parametros: "redigidos",
          avisos,
        },
        null,
        2
      )
    );
  } finally {
    await cliente.end().catch(() => undefined);
  }
}

export async function main(): Promise<void> {
  await coletarExplainInterno({
    httpUrl: process.env.BENCH_HTTP_URL ?? "",
    dbUrl: process.env.BENCH_DB_URL ?? "",
    usuarioId: process.env.BENCH_USUARIO_ID ?? "",
    restauranteId: process.env.BENCH_RESTAURANTE_ID ?? "",
    saida:
      process.env.BENCH_EXPLAIN_SAIDA ??
      ".superpowers/desempenho/explain-interno.json",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error(
      JSON.stringify({
        erro: "EXPLAIN nested local bloqueado ou não coletado.",
      })
    );
    process.exitCode = 1;
  });
