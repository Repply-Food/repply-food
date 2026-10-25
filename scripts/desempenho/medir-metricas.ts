import { execFileSync } from "node:child_process";
import { cpus, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { comoAutenticado } from "../../tests/helpers/supabase-local.ts";
import { gerarCenarios } from "./cenarios.ts";
import {
  validarAmbienteBenchmark,
  validarBancoDescartavel,
  validarJobsCronInativos,
} from "./trava-nuvem.ts";

export interface OpcoesMedicao {
  httpUrl: string;
  dbUrl: string;
  restauranteId: string;
  usuarioId: string;
  dataReferencia: string;
  aquecimentos?: number;
  amostras?: number;
  papel?: PapelBenchmark;
  operacoes?: string[];
  dataInicio?: string;
  dataFim?: string;
  timeoutMs?: number;
  perfilMassa?: string;
}

export interface ResumoDuracoes {
  p50: number | null;
  p95: number | null;
}

export interface AmostrasParciais {
  duracoes: number[];
  falhas: number;
  tentativas: number;
  completa: boolean;
  motivoFalha: string | null;
}

export type PapelBenchmark = "dono" | "admin";

export interface PerfilDeMassa {
  nome: "vazio" | "esparso" | "365d_x500";
  restauranteA: string;
  restauranteB: string;
  dias: number;
  contasPorDia: number;
  lacunaACadaDias?: number;
}

export interface ResultadoCenario extends ResumoDuracoes {
  nome: string;
  amostras: number;
  chamadas: number;
  linhas: number;
  loops?: number;
  buffers?: number;
  tempoRaizDoPlanoMs?: number;
  bytes: number;
  erros: number;
  bloqueado: false;
  duracoesBrutas: number[];
  dispersaoMs: number | null;
  falhasParciais: number;
  completa: boolean;
  motivoFalha: string | null;
}

export interface BaselineResultado {
  commit: string;
  workingTreeSuja: boolean;
  timestamp: string;
  dataReferencia: string;
  massaSintetica: {
    perfil: string;
  };
  distribuicaoDados: {
    entradas: number;
    codigosUnicos: number;
    pagas: number;
    abertas: number;
    removidas: number;
    diasComDados: number;
    lacunasDeDias: number;
    primeiroDia: string | null;
    ultimoDia: string | null;
  };
  ambiente: Record<string, string | number>;
  cenarioSintetico: ReturnType<typeof gerarCenarios>;
  cenarios: ResultadoCenario[];
  probeHttp: { status: number; duracaoMs: number };
  migrationsAplicadas: string[];
  bloqueado: false;
}

type Operacao = {
  nome: string;
  sql: string;
  parametros: unknown[];
  explicar?: boolean;
};

const DATA_REFERENCIA_PADRAO = "2026-10-24T12:00:00.000Z";
const AMOSTRAS_PADRAO = 30;
const AQUECIMENTOS_PADRAO = 5;

export async function medirAmostras(
  executar: () => Promise<void>,
  aquecimentos: number,
  amostras: number,
  relogio: () => number = () => performance.now()
): Promise<number[]> {
  if (!Number.isInteger(aquecimentos) || aquecimentos < 0) {
    throw new Error("Número de aquecimentos inválido.");
  }
  if (!Number.isInteger(amostras) || amostras < 1) {
    throw new Error("Número de amostras inválido.");
  }

  for (let i = 0; i < aquecimentos; i++) await executar();

  const duracoes: number[] = [];
  for (let i = 0; i < amostras; i++) {
    const inicio = relogio();
    await executar();
    duracoes.push(relogio() - inicio);
  }
  return duracoes;
}

/** Mantém as amostras já obtidas quando a série falha, sem fabricar duração. */
export async function medirAmostrasParciais(
  executar: () => Promise<void>,
  aquecimentos: number,
  amostras: number,
  relogio: () => number = () => performance.now()
): Promise<AmostrasParciais> {
  const duracoes: number[] = [];
  let falhas = 0;
  let tentativas = 0;
  for (let indice = 0; indice < aquecimentos + amostras; indice++) {
    const medida = indice >= aquecimentos;
    const inicio = medida ? relogio() : 0;
    try {
      tentativas++;
      await executar();
      if (medida) duracoes.push(relogio() - inicio);
    } catch {
      falhas++;
      return {
        duracoes,
        falhas,
        tentativas,
        completa: false,
        motivoFalha: "erro ou timeout da operação",
      };
    }
  }
  return { duracoes, falhas, tentativas, completa: true, motivoFalha: null };
}

export async function confirmarPapel(
  consultar: (sql: string) => Promise<{ rows: Array<{ admin: boolean }> }>,
  solicitado: PapelBenchmark
): Promise<PapelBenchmark> {
  const resultado = await consultar(
    "select exists (select 1 from public.admins_repply where user_id = auth.uid()) as admin"
  );
  const real: PapelBenchmark = resultado.rows[0]?.admin ? "admin" : "dono";
  if (real !== solicitado) {
    throw new Error(
      "O papel solicitado não corresponde ao usuário autenticado."
    );
  }
  return real;
}

export function criarPerfisDeMassa(): PerfilDeMassa[] {
  return [
    {
      nome: "vazio",
      restauranteA: "00000000-0000-4000-8000-000000000110",
      restauranteB: "00000000-0000-4000-8000-000000000111",
      dias: 0,
      contasPorDia: 0,
    },
    {
      nome: "esparso",
      restauranteA: "00000000-0000-4000-8000-000000000120",
      restauranteB: "00000000-0000-4000-8000-000000000121",
      dias: 365,
      contasPorDia: 12,
      lacunaACadaDias: 7,
    },
    {
      nome: "365d_x500",
      restauranteA: "00000000-0000-4000-8000-000000000130",
      restauranteB: "00000000-0000-4000-8000-000000000131",
      dias: 365,
      contasPorDia: 500,
    },
  ];
}

export function resumirDuracoes(duracoes: number[]): ResumoDuracoes {
  if (
    duracoes.length === 0 ||
    duracoes.some((valor) => !Number.isFinite(valor))
  ) {
    return { p50: null, p95: null };
  }
  const ordenadas = [...duracoes].sort((a, b) => a - b);
  const percentil = (p: number) =>
    ordenadas[Math.max(0, Math.ceil((p / 100) * ordenadas.length) - 1)] ?? 0;
  return { p50: percentil(50), p95: percentil(95) };
}

function dataIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function criarOperacoes(
  restauranteId: string,
  referencia: Date,
  dataInicioForcada?: string
): Operacao[] {
  const hoje = dataIso(referencia);
  const inicioHoje = new Date(`${hoje}T00:00:00.000Z`);
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const operacoes: Operacao[] = [
    {
      nome: "hoje_faturamento",
      sql: "select * from public.metrica_faturamento_do_dia($1::uuid, $2::timestamptz)",
      parametros: [restauranteId, referencia.toISOString()],
    },
    {
      nome: "hoje_mesas_abertas",
      sql: "select * from public.metrica_mesas_abertas($1::uuid, $2::timestamptz)",
      parametros: [restauranteId, referencia.toISOString()],
    },
    {
      nome: "hoje_contas_esquecidas",
      sql: "select * from public.metrica_contas_esquecidas($1::uuid, $2::timestamptz, $3::interval)",
      parametros: [restauranteId, referencia.toISOString(), "4 hours"],
    },
    {
      nome: "hoje_curva",
      sql: "select * from public.metrica_curva_do_dia($1::uuid, $2::timestamptz)",
      parametros: [restauranteId, referencia.toISOString()],
      explicar: true,
    },
    {
      nome: "hoje_comparacao",
      sql: "select * from public.metrica_comparacao_do_dia($1::uuid, $2::timestamptz)",
      parametros: [restauranteId, referencia.toISOString()],
    },
    {
      nome: "hoje_meta_mes",
      sql: "select * from public.metrica_meta_do_mes($1::uuid, $2::timestamptz)",
      parametros: [restauranteId, referencia.toISOString()],
    },
  ];

  for (const dias of [1, 7, 30, 90]) {
    const inicio = new Date(inicioHoje);
    inicio.setUTCDate(inicio.getUTCDate() - dias + 1);
    const de = dataInicioForcada ?? dataIso(inicio);
    for (const comparacao of ["anterior", "semana"]) {
      operacoes.push({
        nome: `resultados_${dias}d_${comparacao}`,
        sql: "select * from public.metrica_resultados_resumo($1::uuid, $2::date, $3::date, $4::text)",
        parametros: [restauranteId, de, hoje, comparacao],
        explicar: dias === 90 && comparacao === "semana",
      });
    }
  }

  operacoes.push({
    nome: "resultados_vendas_diarias_mes",
    sql: "select * from public.metrica_resultados_vendas_diarias($1::uuid, $2::date, $3::date)",
    parametros: [restauranteId, inicioMes, hoje],
  });
  return operacoes;
}

async function executarComoDono<T>(
  cliente: Client,
  usuarioId: string,
  executar: () => Promise<T>
): Promise<T> {
  return comoAutenticado(cliente, usuarioId, executar);
}

function lerPlano(explain: unknown): {
  linhas?: number;
  loops?: number;
  buffers?: number;
  tempoRaizDoPlanoMs?: number;
} {
  if (
    !Array.isArray(explain) ||
    !explain[0] ||
    typeof explain[0] !== "object"
  ) {
    return {};
  }
  const registro = explain[0] as Record<string, unknown>;
  const plano = Array.isArray(registro["QUERY PLAN"])
    ? (registro["QUERY PLAN"][0] as Record<string, unknown> | undefined)
    : undefined;
  const raiz = plano?.Plan as Record<string, unknown> | undefined;
  if (!raiz) return {};
  const buffers =
    Number(raiz["Shared Hit Blocks"] ?? 0) +
    Number(raiz["Shared Read Blocks"] ?? 0);
  return {
    linhas: Number(raiz["Actual Rows"] ?? 0),
    loops: Number(raiz["Actual Loops"] ?? 0),
    buffers,
    tempoRaizDoPlanoMs: Number(raiz["Actual Total Time"] ?? 0),
  };
}

function calcularBytes(valor: unknown): number {
  return Buffer.byteLength(JSON.stringify(valor), "utf8");
}

function identificarCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "desconhecido";
  }
}

function verificarWorktreeSuja(): boolean {
  try {
    return (
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim().length > 0
    );
  } catch {
    return true;
  }
}

export async function medirMetricas(
  opcoes: OpcoesMedicao
): Promise<BaselineResultado> {
  validarAmbienteBenchmark(opcoes);
  if (!opcoes.restauranteId || !opcoes.usuarioId) {
    throw new Error("Informe IDs de fixtures sintéticas do banco descartável.");
  }
  const referencia = new Date(opcoes.dataReferencia);
  if (Number.isNaN(referencia.getTime())) {
    throw new Error("Data de referência inválida.");
  }

  const cliente = new Client({
    connectionString: opcoes.dbUrl,
    connectionTimeoutMillis: 3000,
    query_timeout: opcoes.timeoutMs ?? 20_000,
  });
  try {
    await cliente.connect();
    await validarBancoDescartavel(cliente);
    await validarJobsCronInativos(cliente);
    const inicioHttp = performance.now();
    let probeHttp: BaselineResultado["probeHttp"];
    try {
      const url = new URL("/auth/v1/health", opcoes.httpUrl);
      const resposta = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        redirect: "manual",
      });
      probeHttp = {
        status: resposta.status,
        duracaoMs: performance.now() - inicioHttp,
      };
      await resposta.body?.cancel();
      if (!resposta.ok) throw new Error("probe HTTP indisponível");
    } catch {
      throw new Error("Probe HTTP local falhou; nenhuma medição foi iniciada.");
    }

    const info = await cliente.query<{ versao: string }>(
      "select current_setting('server_version') as versao"
    );
    const migrations = await cliente.query<{ version: string }>(
      "select version from supabase_migrations.schema_migrations order by version"
    );
    const distribuicao = await cliente.query<{
      entradas: string;
      codigos_unicos: string;
      pagas: string;
      abertas: string;
      removidas: string;
      dias_com_dados: string;
      lacunas_de_dias: string;
      primeiro_dia: string | null;
      ultimo_dia: string | null;
    }>(
      `with dias as (
         select distinct dia_operacao from public.entradas
          where restaurante_id = $1::uuid and removida_em is null
       ), faixa as (
         select min(dia_operacao) as primeiro, max(dia_operacao) as ultimo from dias
       )
       select count(*)::text as entradas,
              count(distinct cod_entrada)::text as codigos_unicos,
              count(*) filter (where pago)::text as pagas,
              count(*) filter (where fechada_em is null and removida_em is null)::text as abertas,
              count(*) filter (where removida_em is not null)::text as removidas,
              (select count(*)::text from dias) as dias_com_dados,
              case when faixa.primeiro is null then '0'
                   else ((faixa.ultimo - faixa.primeiro + 1) - (select count(*) from dias))::text end as lacunas_de_dias,
              faixa.primeiro::text as primeiro_dia,
              faixa.ultimo::text as ultimo_dia
         from public.entradas cross join faixa
        where restaurante_id = $1::uuid
        group by faixa.primeiro, faixa.ultimo`,
      [opcoes.restauranteId]
    );
    const contagens = distribuicao.rows[0];
    const papel = opcoes.papel ?? "dono";
    await executarComoDono(cliente, opcoes.usuarioId, () =>
      confirmarPapel((sql) => cliente.query(sql), papel)
    );
    const operacoes = criarOperacoes(
      opcoes.restauranteId,
      referencia,
      opcoes.dataInicio
    ).filter(
      (operacao) =>
        !opcoes.operacoes?.length || opcoes.operacoes.includes(operacao.nome)
    );
    const resultados: ResultadoCenario[] = [];
    const aquecimentos = opcoes.aquecimentos ?? AQUECIMENTOS_PADRAO;
    const amostras = opcoes.amostras ?? AMOSTRAS_PADRAO;

    for (const operacao of operacoes) {
      let linhas = 0;
      let bytes = 0;
      const executar = () =>
        executarComoDono(cliente, opcoes.usuarioId, async () => {
          await cliente.query(
            "select set_config('statement_timeout', $1, true)",
            [String(opcoes.timeoutMs ?? 20_000)]
          );
          const resposta = await cliente.query(
            operacao.sql,
            operacao.parametros
          );
          linhas = resposta.rowCount ?? resposta.rows.length;
          bytes = calcularBytes(resposta.rows);
        });
      const serie = await medirAmostrasParciais(
        executar,
        aquecimentos,
        amostras
      );
      const resumo = resumirDuracoes(serie.duracoes);
      const metadados: ResultadoCenario = {
        nome: operacao.nome,
        ...resumo,
        amostras: serie.duracoes.length,
        chamadas: serie.tentativas,
        linhas,
        bytes,
        erros: serie.falhas,
        bloqueado: false,
        duracoesBrutas: serie.duracoes,
        dispersaoMs:
          serie.duracoes.length > 1
            ? Math.max(...serie.duracoes) - Math.min(...serie.duracoes)
            : null,
        falhasParciais: serie.falhas,
        completa: serie.completa,
        motivoFalha: serie.motivoFalha,
      };

      if (operacao.explicar && serie.completa) {
        const explainSql = `explain (analyze, buffers, format json) ${operacao.sql}`;
        const plano = await executarComoDono(
          cliente,
          opcoes.usuarioId,
          async () => {
            await cliente.query(
              "select set_config('statement_timeout', $1, true)",
              [String(opcoes.timeoutMs ?? 20_000)]
            );
            const resposta = await cliente.query(
              explainSql,
              operacao.parametros
            );
            return lerPlano(resposta.rows);
          }
        ).catch(() => null);
        if (plano) Object.assign(metadados, plano);
        else metadados.motivoFalha ??= "EXPLAIN indisponível após a série";
      }
      resultados.push(metadados);
    }

    return {
      commit: identificarCommit(),
      workingTreeSuja: verificarWorktreeSuja(),
      timestamp: new Date().toISOString(),
      dataReferencia: referencia.toISOString(),
      massaSintetica: {
        perfil: opcoes.perfilMassa ?? "não informado",
      },
      distribuicaoDados: {
        entradas: Number(contagens?.entradas ?? 0),
        codigosUnicos: Number(contagens?.codigos_unicos ?? 0),
        pagas: Number(contagens?.pagas ?? 0),
        abertas: Number(contagens?.abertas ?? 0),
        removidas: Number(contagens?.removidas ?? 0),
        diasComDados: Number(contagens?.dias_com_dados ?? 0),
        lacunasDeDias: Number(contagens?.lacunas_de_dias ?? 0),
        primeiroDia: contagens?.primeiro_dia ?? null,
        ultimoDia: contagens?.ultimo_dia ?? null,
      },
      ambiente: {
        node: process.version,
        plataforma: process.platform,
        kernel: release(),
        cpuModelo: cpus()[0]?.model ?? "desconhecido",
        cpusLogicas: cpus().length,
        memoriaTotalBytes: totalmem(),
        postgres: info.rows[0]?.versao ?? "desconhecida",
        papelSql: `authenticated com papel confirmado: ${papel}`,
        aquecimentos,
        amostras: amostras,
      },
      cenarioSintetico: gerarCenarios(),
      cenarios: resultados,
      probeHttp,
      migrationsAplicadas: migrations.rows.map(
        (migration) => migration.version
      ),
      bloqueado: false,
    };
  } finally {
    await cliente.end().catch(() => undefined);
  }
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const chave = arg.slice(2);
    const proximo = argv[i + 1];
    if (proximo && !proximo.startsWith("--")) {
      args[chave] = proximo;
      i++;
    }
  }
  return args;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const httpUrl = args["http-url"] ?? process.env.BENCH_HTTP_URL ?? "";
  const dbUrl = args["db-url"] ?? process.env.BENCH_DB_URL ?? "";
  try {
    const resultado = await medirMetricas({
      httpUrl,
      dbUrl,
      restauranteId:
        args["restaurante-id"] ?? process.env.BENCH_RESTAURANTE_ID ?? "",
      usuarioId: args["usuario-id"] ?? process.env.BENCH_USUARIO_ID ?? "",
      dataReferencia:
        args["data-fim"] ??
        args["data-referencia"] ??
        process.env.BENCH_DATA_REFERENCIA ??
        DATA_REFERENCIA_PADRAO,
      aquecimentos: Number(
        args.aquecimentos ??
          process.env.BENCH_AQUECIMENTOS ??
          AQUECIMENTOS_PADRAO
      ),
      amostras: Number(
        args.amostras ?? process.env.BENCH_AMOSTRAS ?? AMOSTRAS_PADRAO
      ),
      papel: (args.papel as PapelBenchmark | undefined) ?? "dono",
      operacoes: args.operacoes?.split(",").filter(Boolean),
      dataInicio: args["data-inicio"],
      dataFim: args["data-fim"],
      timeoutMs: Number(args.timeout ?? process.env.BENCH_TIMEOUT_MS ?? 20_000),
      perfilMassa: args.perfil ?? process.env.BENCH_PERFIL_MASSA,
    });
    console.log(JSON.stringify(resultado, null, 2));
  } catch {
    console.error(
      JSON.stringify(
        {
          erro: "Benchmark local não executado; confira os parâmetros e a disponibilidade do ambiente descartável.",
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  }
}

const caminhoExecucao = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : "";
if (import.meta.url === caminhoExecucao) {
  main().catch(() => {
    console.error(
      JSON.stringify({
        erro: "Benchmark local falhou sem expor detalhes de conexão.",
      })
    );
    process.exitCode = 1;
  });
}
