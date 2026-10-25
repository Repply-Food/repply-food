import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import {
  validarAmbienteBenchmark,
  validarBancoDescartavel,
  validarJobsCronInativos,
} from "./trava-nuvem.ts";

const AQUECIMENTOS_PADRAO = 5;
const AMOSTRAS_PADRAO = 30;
const TIMEOUT_MS = 20_000;

type OperacaoRpc = {
  nome: string;
  funcao: string;
  args: Record<string, string>;
};
type FiltrosResultados = {
  inicio: string;
  fim: string;
  comparacao: string;
  atalho: "mes" | "periodo";
  limiteEsquecida: string;
};
type MedidaOperacao = {
  nome: string;
  duracaoMs: number | null;
  bytes: number | null;
  status: number | null;
  codigo: "ok" | "rpc_erro" | "timeout" | "transporte";
};
type Rodada = {
  paredeMs: number | null;
  operacoes: MedidaOperacao[];
  falhou: boolean;
};
type RespostaRpc = { data: unknown; error: unknown };
type ClienteRpc = {
  rpc: (
    funcao: string,
    args: Record<string, string>
  ) => { abortSignal: (sinal: AbortSignal) => Promise<RespostaRpc> };
};
export type ResultadoEscala = {
  concorrencia: number;
  timeout: boolean;
  operacoes: MedidaOperacao[];
  rodadas: Rodada[];
  interrompidaPor: string | null;
};

export function criarOperacoesDaTela(
  restauranteId: string,
  agora: string,
  filtros: FiltrosResultados
): { hoje: OperacaoRpc[]; resultados: OperacaoRpc[] } {
  const parametros = {
    p_restaurante_id: restauranteId,
    p_inicio: filtros.inicio,
    p_fim: filtros.fim,
  };
  return {
    hoje: [
      {
        nome: "hoje_faturamento",
        funcao: "metrica_faturamento_do_dia",
        args: { p_restaurante_id: restauranteId, p_ate: agora },
      },
      {
        nome: "hoje_comparacao",
        funcao: "metrica_comparacao_do_dia",
        args: { p_restaurante_id: restauranteId, p_agora: agora },
      },
      {
        nome: "hoje_mesas_abertas",
        funcao: "metrica_mesas_abertas",
        args: { p_restaurante_id: restauranteId, p_agora: agora },
      },
      {
        nome: "hoje_curva",
        funcao: "metrica_curva_do_dia",
        args: { p_restaurante_id: restauranteId, p_agora: agora },
      },
      {
        nome: "hoje_contas_esquecidas",
        funcao: "metrica_contas_esquecidas",
        args: {
          p_restaurante_id: restauranteId,
          p_agora: agora,
          p_limite: filtros.limiteEsquecida,
        },
      },
      {
        nome: "hoje_meta",
        funcao: "metrica_meta_do_mes",
        args: { p_restaurante_id: restauranteId, p_agora: agora },
      },
    ],
    resultados: [
      {
        nome: "resultados_resumo",
        funcao: "metrica_resultados_resumo",
        args: { ...parametros, p_comparacao: filtros.comparacao },
      },
      ...[
        "vendas_diarias",
        "ocupacao",
        "horas",
        "mapa_calor",
        "turnos",
        "equipe",
        "descontos",
      ].map((nome) => ({
        nome: `resultados_${nome}`,
        funcao: `metrica_resultados_${nome}`,
        args: parametros,
      })),
      {
        nome: "resultados_meta",
        funcao: "metrica_meta_do_mes",
        args: { p_restaurante_id: restauranteId, p_agora: agora },
      },
    ],
  };
}

export async function executarRodadasSequenciais<T extends { falhou: boolean }>(
  amostras: number,
  concorrencia: number,
  executarTela: () => Promise<T>
): Promise<T[][]> {
  const rodadas: T[][] = [];
  for (let indice = 0; indice < amostras; indice++) {
    const rodada = await Promise.all(
      Array.from({ length: concorrencia }, executarTela)
    );
    rodadas.push(rodada);
    if (rodada.some((resultado) => resultado.falhou)) break;
  }
  return rodadas;
}

export async function executarEscalas(
  executar: (concorrencia: number) => Promise<ResultadoEscala>,
  escalas = [1, 5, 20]
): Promise<ResultadoEscala[]> {
  const resultados: ResultadoEscala[] = [];
  for (const concorrencia of escalas) {
    const resultado = await executar(concorrencia);
    resultados.push({ ...resultado, concorrencia });
    if (resultado.interrompidaPor || resultado.timeout) break;
  }
  return resultados;
}

function resumir(valores: number[]): {
  p50: number | null;
  p95: number | null;
  dispersaoMs: number | null;
} {
  if (!valores.length) return { p50: null, p95: null, dispersaoMs: null };
  const ordenados = [...valores].sort((a, b) => a - b);
  const percentil = (p: number) =>
    ordenados[Math.ceil((p / 100) * ordenados.length) - 1] ?? null;
  return {
    p50: percentil(50),
    p95: percentil(95),
    dispersaoMs:
      valores.length > 1 ? Math.max(...valores) - Math.min(...valores) : null,
  };
}

async function validarAntesDoLogin(
  dbUrl: string,
  usuarioId: string,
  restauranteId: string,
  papel: "dono" | "admin"
): Promise<void> {
  const banco = new Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 3000,
  });
  await banco.connect();
  try {
    await validarBancoDescartavel(banco);
    await validarJobsCronInativos(banco);
    const vinculo = await banco.query<{ encontrado: boolean }>(
      `select exists (select 1 from auth.users u where u.id = $1::uuid)
       and case when $3::text = 'admin' then exists (select 1 from public.admins_repply a where a.user_id = $1::uuid)
                else exists (select 1 from public.acessos ac where ac.user_id = $1::uuid and ac.restaurante_id = $2::uuid) end as encontrado`,
      [usuarioId, restauranteId, papel]
    );
    if (!vinculo.rows[0]?.encontrado)
      throw new Error(
        "Fixture local não corresponde ao papel ou restaurante solicitado."
      );
  } finally {
    await banco.end().catch(() => undefined);
  }
}

async function executarTela(
  cliente: ClienteRpc,
  operacoes: { hoje: OperacaoRpc[]; resultados: OperacaoRpc[] }
): Promise<Rodada> {
  const inicio = performance.now();
  const todas = [...operacoes.hoje, ...operacoes.resultados];
  const medidas = await Promise.all(
    todas.map(async (operacao): Promise<MedidaOperacao> => {
      const operacaoInicio = performance.now();
      try {
        const resposta = await cliente
          .rpc(operacao.funcao, operacao.args)
          .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
        if (resposta.error)
          return {
            nome: operacao.nome,
            duracaoMs: performance.now() - operacaoInicio,
            bytes: null,
            status: null,
            codigo: "rpc_erro",
          };
        return {
          nome: operacao.nome,
          duracaoMs: performance.now() - operacaoInicio,
          bytes: Buffer.byteLength(JSON.stringify(resposta.data), "utf8"),
          status: 200,
          codigo: "ok",
        };
      } catch (erro) {
        const timeout =
          erro instanceof DOMException && erro.name === "TimeoutError";
        return {
          nome: operacao.nome,
          duracaoMs: performance.now() - operacaoInicio,
          bytes: null,
          status: null,
          codigo: timeout ? "timeout" : "transporte",
        };
      }
    })
  );
  const falhou = medidas.some((medida) => medida.codigo !== "ok");
  return {
    paredeMs: falhou ? null : performance.now() - inicio,
    operacoes: medidas,
    falhou,
  };
}

async function executarSerie(
  url: string,
  anonKey: string,
  email: string,
  senha: string,
  restauranteId: string,
  aquecimentos: number,
  amostras: number,
  concorrencia: number
): Promise<ResultadoEscala> {
  const cliente = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await cliente.auth.signInWithPassword({
    email,
    password: senha,
    options: { captchaToken: undefined },
  });
  if (login.error || !login.data.session)
    throw new Error("Login local da fixture recusado.");
  const usuarioId = process.env.BENCH_USUARIO_ID ?? "";
  if (login.data.user.id !== usuarioId)
    throw new Error(
      "A sessão HTTP não pertence ao usuário confirmado no banco."
    );
  const cabecalhos = {
    apikey: anonKey,
    authorization: `Bearer ${login.data.session.access_token}`,
  };
  const [papelApi, casaApi] = await Promise.all([
    fetch(new URL("/rest/v1/rpc/eh_admin_repply", url), {
      method: "POST",
      headers: cabecalhos,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
    fetch(
      new URL(
        `/rest/v1/restaurantes?id=eq.${encodeURIComponent(restauranteId)}&select=id,slug`,
        url
      ),
      { headers: cabecalhos, signal: AbortSignal.timeout(TIMEOUT_MS) }
    ),
  ]);
  const adminApi = await papelApi.json().catch(() => null);
  const casasApi = await casaApi.json().catch(() => null);
  const adminEsperado = process.env.BENCH_PAPEL === "admin";
  if (
    !papelApi.ok ||
    !casaApi.ok ||
    adminApi !== adminEsperado ||
    !Array.isArray(casasApi) ||
    casasApi.length !== 1 ||
    casasApi[0]?.id !== restauranteId
  )
    throw new Error(
      "A API local não confirmou papel e casa da fixture marcada."
    );
  const clienteRpc = cliente as unknown as ClienteRpc;
  const filtros: FiltrosResultados = {
    inicio: process.env.BENCH_DATA_INICIO ?? "2026-10-01",
    fim: process.env.BENCH_DATA_FIM ?? "2026-10-24",
    comparacao: process.env.BENCH_COMPARACAO ?? "semana",
    atalho: "mes",
    limiteEsquecida: "04:00:00",
  };
  const operacoes = criarOperacoesDaTela(
    restauranteId,
    process.env.BENCH_AGORA ?? "2026-10-24T12:00:00.000Z",
    filtros
  );
  for (let indice = 0; indice < aquecimentos; indice++) {
    const rodada = await executarTela(clienteRpc, operacoes);
    if (rodada.falhou)
      return {
        concorrencia,
        timeout: rodada.operacoes.some((item) => item.codigo === "timeout"),
        operacoes: rodada.operacoes,
        rodadas: [],
        interrompidaPor: "falha_no_aquecimento",
      };
  }
  const rodadas = await executarRodadasSequenciais(amostras, concorrencia, () =>
    executarTela(clienteRpc, operacoes)
  );
  const planas = rodadas.flat();
  const operacoesMedidas = planas.flatMap((rodada) => rodada.operacoes);
  const falha = planas.find((rodada) => rodada.falhou);
  return {
    concorrencia,
    timeout: Boolean(
      falha?.operacoes.some((item) => item.codigo === "timeout")
    ),
    operacoes: operacoesMedidas,
    rodadas: planas,
    interrompidaPor: falha ? "falha_rpc_ou_transporte" : null,
  };
}

export async function main(): Promise<void> {
  const url = process.env.BENCH_HTTP_URL ?? "";
  const dbUrl = process.env.BENCH_DB_URL ?? "";
  const anonKey = process.env.BENCH_ANON_KEY ?? "";
  const email = process.env.BENCH_LOGIN_EMAIL ?? "";
  const senha = process.env.BENCH_LOGIN_SENHA ?? "";
  const restauranteId = process.env.BENCH_RESTAURANTE_ID ?? "";
  const usuarioId = process.env.BENCH_USUARIO_ID ?? "";
  const papel = process.env.BENCH_PAPEL === "admin" ? "admin" : "dono";
  validarAmbienteBenchmark({ httpUrl: url, dbUrl });
  if (!anonKey || !email || !senha || !restauranteId || !usuarioId)
    throw new Error("Faltam credenciais ou fixture locais do benchmark.");
  await validarAntesDoLogin(dbUrl, usuarioId, restauranteId, papel);
  const resultados = await executarEscalas((concorrencia) =>
    executarSerie(
      url,
      anonKey,
      email,
      senha,
      restauranteId,
      AQUECIMENTOS_PADRAO,
      AMOSTRAS_PADRAO,
      concorrencia
    )
  );
  console.log(
    JSON.stringify(
      {
        papel,
        aquecimentos: AQUECIMENTOS_PADRAO,
        amostras: AMOSTRAS_PADRAO,
        resultados: resultados.map((resultado) => ({
          ...resultado,
          parede: resumir(
            resultado.rodadas
              .map((rodada) => rodada.paredeMs)
              .filter((valor): valor is number => valor !== null)
          ),
          operacoes: resultado.operacoes,
        })),
      },
      null,
      2
    )
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error(
      JSON.stringify({ erro: "Medição HTTP local não executada." })
    );
    process.exitCode = 1;
  });
