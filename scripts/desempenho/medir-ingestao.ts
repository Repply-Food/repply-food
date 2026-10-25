import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { entrada, envelope } from "../../tests/helpers/supabase-local.ts";
import {
  type ClienteIngestao,
  RESERVAS_INGESTAO,
  type ReservaIngestao,
} from "./preparar-ingestao.ts";
import {
  validarAmbienteBenchmark,
  validarBancoDescartavel,
  validarJobsCronInativos,
} from "./trava-nuvem.ts";

const LIMITE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

export function validarEnvelopeIntegro(
  envelopeCompleto: unknown,
  limiteBytes: number
): number {
  const bytes = Buffer.byteLength(JSON.stringify(envelopeCompleto), "utf8");
  if (bytes > limiteBytes)
    throw new Error("Envelope íntegro ultrapassa o limite de 2 MB.");
  return bytes;
}

export async function validarTokenDaReserva(
  query: (
    sql: string,
    valores: string[]
  ) => Promise<{ rows: Array<{ valido: boolean }> }>,
  token: string,
  restauranteId: string,
  slug: string
): Promise<void> {
  const hash = createHash("sha256").update(token).digest("hex");
  const resultado = await query(
    `select exists (
       select 1 from public.tokens_envio t
       join public.restaurantes r on r.id = t.restaurante_id
        where t.restaurante_id = $1::uuid and r.slug = $2 and t.hash = $3
          and t.revogado_em is null
          and (t.expira_em is null or t.expira_em > now())
     ) as valido`,
    [restauranteId, slug, hash]
  );
  if (!resultado.rows[0]?.valido)
    throw new Error("O token não pertence à reserva exclusiva de ingestão.");
}

type ReservaComToken = ReservaIngestao & { token: string };
const CASOS = ["identico", "alteracao", "remocao", "reaparecimento"] as const;
type Caso = (typeof CASOS)[number] | "inicial";
type Fase = "preparo" | "aquecimento" | "medicao";
type Etapa =
  | "ambiente"
  | "reserva"
  | "envelope"
  | "pacing"
  | "http"
  | "resposta"
  | "estado";
type Estado = {
  cod_entrada: string;
  valor_itens: string;
  valor_consumido: string;
  removida_em: string | null;
  hash_origem: string;
  demais: string;
  restante_valido: boolean;
};
type Contagens = {
  recebidas: number;
  gravadas: number;
  inalteradas: number;
  removidas: number;
};
type Tentativa = {
  fase: Fase;
  ciclo: number;
  caso: Caso;
  status: number | null;
  duracaoMs: number | null;
  bytesEnviados: number;
  bytesRecebidos: number | null;
  valida: boolean;
  timeout: boolean;
  contagens: Contagens | null;
};
type Falha = {
  fase: Fase;
  ciclo: number;
  caso: Caso;
  etapa: Etapa;
  motivo: string;
  tipo: "timeout" | "erro-ou-violacao";
};
type Serie = {
  quantidade: number;
  chamadasHttp: number;
  tentativas: Tentativa[];
  casos: ReturnType<typeof resumirCasos>;
  falha: Falha | null;
  completa: boolean;
};
type Opcoes = {
  httpUrl: string;
  dbUrl: string;
  reservas: ReservaComToken[];
  criarCliente?: (dbUrl: string) => ClienteIngestao;
  fetcher?: typeof fetch;
  relogio?: () => number;
};

function conferirReservas(valor: unknown): asserts valor is ReservaComToken[] {
  if (!Array.isArray(valor) || valor.length !== RESERVAS_INGESTAO.length)
    throw new Error("Exigem-se as três reservas exclusivas de ingestão.");
  for (const fixa of RESERVAS_INGESTAO) {
    const correspondentes = valor.filter(
      (r) => r?.quantidade === fixa.quantidade
    );
    const r = correspondentes[0];
    if (
      correspondentes.length !== 1 ||
      r?.restauranteId !== fixa.restauranteId ||
      r.slug !== fixa.slug ||
      typeof r.token !== "string" ||
      !/^\S+$/.test(r.token)
    )
      throw new Error("Identidade ou token da reserva de ingestão inválidos.");
  }
}

export async function lerReservasSecretas(
  caminhoInformado = ".superpowers/desempenho/ingestao-acessos.local.json"
): Promise<ReservaComToken[]> {
  try {
    const raiz = await realpath(process.cwd());
    const caminho = resolve(raiz, caminhoInformado);
    const diferenca = relative(join(raiz, ".superpowers"), caminho);
    if (
      !diferenca ||
      diferenca === ".." ||
      diferenca.startsWith(`..${sep}`) ||
      isAbsolute(diferenca)
    )
      throw new Error("caminho");
    let atual = raiz;
    for (const parte of relative(raiz, caminho).split(sep)) {
      atual = join(atual, parte);
      const estado = await lstat(atual);
      if (
        estado.isSymbolicLink() ||
        (atual !== caminho && !estado.isDirectory())
      )
        throw new Error("caminho");
    }
    const relativo = relative(raiz, caminho);
    const rastreado = execFileSync("git", ["ls-files", "--", relativo], {
      cwd: raiz,
      encoding: "utf8",
      stdio: "pipe",
    });
    if (rastreado.trim()) throw new Error("rastreado");
    execFileSync("git", ["check-ignore", "--quiet", "--", relativo], {
      cwd: raiz,
      stdio: "pipe",
    });
    const arquivo = await open(
      caminho,
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    try {
      const estado = await arquivo.stat();
      if (
        !estado.isFile() ||
        (estado.mode & 0o777) !== 0o600 ||
        estado.nlink !== 1 ||
        estado.size > 64 * 1024 ||
        (process.getuid && estado.uid !== process.getuid())
      )
        throw new Error("permissao");
      const configuracao: unknown = JSON.parse(await arquivo.readFile("utf8"));
      if (!objeto(configuracao)) throw new Error("formato");
      conferirReservas(configuracao.reservas);
      return configuracao.reservas;
    } finally {
      await arquivo.close();
    }
  } catch {
    throw new Error("Configuração secreta de ingestão inválida.");
  }
}

function inicioCodigo(reserva: ReservaIngestao): number {
  return 9_000_000 + reserva.quantidade * 10_000;
}

function conferirFaixa(
  estado: Estado[],
  reserva: ReservaIngestao,
  completo: boolean
): void {
  const inicio = BigInt(inicioCodigo(reserva));
  const fim = inicio + BigInt(reserva.quantidade - 1);
  const codigos = new Set<string>();
  if (completo && estado.length !== reserva.quantidade)
    throw new Error("estado");
  for (const linha of estado) {
    if (!/^\d+$/.test(linha.cod_entrada)) throw new Error("estado");
    const codigo = BigInt(linha.cod_entrada);
    if (codigo < inicio || codigo > fim || codigos.has(linha.cod_entrada))
      throw new Error("estado");
    codigos.add(linha.cod_entrada);
  }
}

async function lerEstado(
  banco: ClienteIngestao,
  reserva: ReservaIngestao
): Promise<Estado[]> {
  // Sem filtro de faixa: um código estranho à reserva também deve bloquear.
  const resultado = await banco.query<Estado>(
    `select e.cod_entrada::text, e.valor_itens::text, e.valor_consumido::text,
            e.removida_em::text, e.hash_origem,
            (to_jsonb(e) - array['restaurante_id', 'cod_entrada', 'valor_itens',
              'valor_consumido', 'hash_origem', 'removida_em', 'recebida_em', 'atualizada_em'])::text as demais,
            (e.aberta_em = '2026-10-09T15:10:00Z'::timestamptz
             and e.fechada_em = '2026-10-09T16:05:00Z'::timestamptz
             and e.dia_operacao = '2026-10-09'::date
             and e.cod_cartao_mesa is null and e.cod_garcom is null and e.cod_cliente is null
             and e.cod_operador_abertura is null and e.cod_operador_fechamento is null
             and e.valor_descontos = 0 and e.valor_acrescimos = 0 and e.taxa_servico = 10
             and e.complemento = 0 and e.pago and e.numero_ocupantes = 2
             and e.tipo_ocupacao = 'MESA' and e.tipo_cartao = '' and e.extras = '{}'::jsonb
            ) as restante_valido
       from public.entradas e where e.restaurante_id = $1::uuid order by e.cod_entrada`,
    [reserva.restauranteId]
  );
  return resultado.rows;
}

// numeric(12,2) pode retornar 111.00 ou 111; comparação decimal exata, sem Number.
function decimal(valor: string): string {
  if (!/^\d+(?:\.\d{1,2})?$/.test(valor)) throw new Error("estado");
  const [inteiro, fracao = ""] = valor.split(".");
  return `${BigInt(inteiro ?? "")}.${fracao.padEnd(2, "0")}`;
}

function conferirEstado(
  atual: Estado[],
  anterior: Estado[],
  original: Estado[] | null,
  reserva: ReservaIngestao,
  caso: Caso
): void {
  conferirFaixa(atual, reserva, true);
  const originais = new Map(
    original?.map((linha) => [linha.cod_entrada, linha])
  );
  const anteriores = new Map(
    anterior.map((linha) => [linha.cod_entrada, linha])
  );
  for (const linha of atual) {
    const primeira = linha.cod_entrada === String(inicioCodigo(reserva));
    const alterada = primeira && (caso === "alteracao" || caso === "remocao");
    if (
      decimal(linha.valor_itens) !== (alterada ? "101.00" : "100.00") ||
      decimal(linha.valor_consumido) !== (alterada ? "111.00" : "110.00") ||
      !/^[a-f0-9]{32}$/.test(linha.hash_origem) ||
      linha.restante_valido !== true ||
      (primeira && caso === "remocao"
        ? !linha.removida_em
        : linha.removida_em !== null)
    )
      throw new Error("estado");
    const base = originais.get(linha.cod_entrada);
    const previa = anteriores.get(linha.cod_entrada);
    if (
      base &&
      (linha.demais !== base.demais ||
        (alterada
          ? linha.hash_origem === base.hash_origem
          : linha.hash_origem !== base.hash_origem))
    )
      throw new Error("estado");
    if (
      caso === "remocao" &&
      previa &&
      linha.hash_origem !== previa.hash_origem
    )
      throw new Error("estado");
  }
}

function contagensEsperadas(
  caso: Caso,
  quantidade: number,
  anterior: Estado[],
  atual: Estado[]
): Contagens {
  if (caso === "inicial") {
    const previos = new Map(
      anterior.map((linha) => [linha.cod_entrada, linha.hash_origem])
    );
    const inalteradas = atual.filter(
      (linha) => previos.get(linha.cod_entrada) === linha.hash_origem
    ).length;
    return {
      recebidas: quantidade,
      gravadas: quantidade - inalteradas,
      inalteradas,
      removidas: 0,
    };
  }
  if (caso === "remocao")
    return {
      recebidas: quantidade - 1,
      gravadas: 0,
      inalteradas: quantidade - 1,
      removidas: 1,
    };
  const gravadas = caso === "identico" ? 0 : 1;
  return {
    recebidas: quantidade,
    gravadas,
    inalteradas: quantidade - gravadas,
    removidas: 0,
  };
}

function objeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

function conferirResposta(valor: unknown, esperado: Contagens): void {
  if (
    !objeto(valor) ||
    valor.ok !== true ||
    !objeto(valor.janela_confirmada) ||
    valor.janela_confirmada.desde !== "2026-10-09" ||
    valor.janela_confirmada.ate !== "2026-10-10" ||
    !Number.isInteger(valor.proximo_envio_em_segundos) ||
    (valor.proximo_envio_em_segundos as number) <= 0 ||
    (valor.reenviar_desde !== undefined &&
      (typeof valor.reenviar_desde !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(valor.reenviar_desde)))
  )
    throw new Error("resposta");
  for (const chave of [
    "recebidas",
    "gravadas",
    "inalteradas",
    "removidas",
  ] as const) {
    if (valor[chave] !== esperado[chave]) throw new Error("resposta");
  }
}

function resumirCasos(tentativas: Tentativa[]) {
  return CASOS.map((caso) => {
    const chamadas = tentativas.filter((item) => item.caso === caso);
    const duracoesBrutas = chamadas
      .filter((item) => item.fase === "medicao" && item.valida)
      .map((item) => item.duracaoMs as number);
    const ordenadas = [...duracoesBrutas].sort((a, b) => a - b);
    const percentil = (p: number) =>
      ordenadas.length
        ? (ordenadas[Math.ceil(p * ordenadas.length) - 1] ?? null)
        : null;
    return {
      caso,
      duracoesBrutas,
      p50: percentil(0.5),
      p95: percentil(0.95),
      dispersaoMs: ordenadas.length
        ? (ordenadas.at(-1) as number) - (ordenadas[0] as number)
        : null,
      chamadasHttp: chamadas.length,
      erros: chamadas.filter((item) => !item.valida).length,
      bytesEnviados: chamadas.reduce(
        (soma, item) => soma + item.bytesEnviados,
        0
      ),
      bytesRecebidosConhecidos: chamadas.reduce(
        (soma, item) => soma + (item.bytesRecebidos ?? 0),
        0
      ),
      respostasSemTamanho: chamadas.filter(
        (item) => item.bytesRecebidos === null
      ).length,
    };
  });
}

function criarCliente(dbUrl: string): ClienteIngestao {
  const cliente = new Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 3000,
    query_timeout: TIMEOUT_MS,
  });
  return {
    connect: async () => {
      await cliente.connect();
    },
    end: () => cliente.end(),
    query: async (sql, valores) =>
      cliente.query(sql, valores ? [...valores] : undefined),
  };
}

export async function medirIngestao(opcoes: Opcoes) {
  validarAmbienteBenchmark(opcoes);
  // URL normaliza 127.1/inteiros; aqui a API precisa ser raiz literal, sem query.
  if (!/^https?:\/\/(?:127\.0\.0\.1|\[::1\]):55421\/?$/.test(opcoes.httpUrl))
    throw new Error(
      "API de ingestão exige raiz com IP literal e porta isolada."
    );
  if (
    !/^postgres(?:ql)?:\/\/(?:[^/?#@]+@)?(?:127\.0\.0\.1|\[::1\]):55422\/[^?#]*$/.test(
      opcoes.dbUrl
    )
  )
    throw new Error("Banco de ingestão exige IP literal e porta isolada.");
  conferirReservas(opcoes.reservas);
  const banco = (opcoes.criarCliente ?? criarCliente)(opcoes.dbUrl);
  const fetcher = opcoes.fetcher ?? fetch;
  const relogio = opcoes.relogio ?? (() => performance.now());
  const resultados: Serie[] = [];
  let falhaAmbiente = false;
  try {
    await banco.connect();
    await validarBancoDescartavel({
      query: (sql, valores) => banco.query<{ marcador: string }>(sql, valores),
    });
    await validarJobsCronInativos({
      query: (sql) => banco.query<{ ativos: string | number }>(sql),
    });
    for (const fixa of RESERVAS_INGESTAO) {
      const reserva = opcoes.reservas.find(
        (item) => item.quantidade === fixa.quantidade
      ) as ReservaComToken;
      const serie: Serie = {
        quantidade: reserva.quantidade,
        chamadasHttp: 0,
        tentativas: [],
        casos: [],
        falha: null,
        completa: false,
      };
      resultados.push(serie);
      let etapa: Etapa = "reserva";
      let fase: Fase = "preparo";
      let ciclo = 0;
      let caso: Caso = "inicial";
      try {
        const guard = await banco.query<{ valida: boolean }>(
          `select exists (select 1 from public.restaurantes where id = $1::uuid and slug = $2
            and fuso = 'America/Fortaleza' and hora_virada = '05:00'::time) as valida`,
          [reserva.restauranteId, reserva.slug]
        );
        if (guard.rows[0]?.valida !== true) throw new Error("reserva");
        await validarTokenDaReserva(
          (sql, valores) => banco.query<{ valido: boolean }>(sql, valores),
          reserva.token,
          reserva.restauranteId,
          reserva.slug
        );
        let anterior = await lerEstado(banco, reserva);
        conferirFaixa(anterior, reserva, false);
        let original: Estado[] | null = null;
        const dados = Array.from({ length: reserva.quantidade }, (_, i) =>
          entrada(inicioCodigo(reserva) + i)
        );
        const alterados = dados.map((item, i) =>
          i === 0 ? { ...item, ValorItens: 101, ValorConsumido: 111 } : item
        );
        const corpos = {
          inicial: envelope(dados),
          identico: envelope(dados),
          alteracao: envelope(alterados),
          remocao: envelope(dados.slice(1)),
          reaparecimento: envelope(dados),
        };
        etapa = "envelope";
        for (const corpo of Object.values(corpos))
          validarEnvelopeIntegro(corpo, LIMITE_BYTES);
        const executarCaso = async () => {
          etapa = "pacing";
          const pacing = await banco.query(
            `update public.sinal_de_vida set ultimo_envio_em = now() - interval '21 seconds' where restaurante_id = $1::uuid`,
            [reserva.restauranteId]
          );
          if (
            pacing.rowCount !== 1 &&
            !(fase === "preparo" && pacing.rowCount === 0)
          )
            throw new Error("pacing");
          const texto = JSON.stringify(corpos[caso]);
          const tentativa: Tentativa = {
            fase,
            ciclo,
            caso,
            status: null,
            duracaoMs: null,
            timeout: false,
            bytesEnviados: Buffer.byteLength(texto, "utf8"),
            bytesRecebidos: null,
            valida: false,
            contagens: null,
          };
          serie.tentativas.push(tentativa);
          etapa = "http";
          const inicio = relogio();
          serie.chamadasHttp++;
          let resposta: Response;
          let textoResposta: string;
          try {
            resposta = await fetcher(
              new URL("/functions/v1/receber-envio", opcoes.httpUrl),
              {
                method: "POST",
                redirect: "error",
                headers: {
                  authorization: `Bearer ${reserva.token}`,
                  "content-type": "application/json",
                },
                body: texto,
                signal: AbortSignal.timeout(TIMEOUT_MS),
              }
            );
            tentativa.status = resposta.status;
            textoResposta = await resposta.text();
            tentativa.bytesRecebidos = Buffer.byteLength(textoResposta, "utf8");
          } catch (erro) {
            tentativa.timeout =
              erro instanceof Error &&
              (erro.name === "TimeoutError" || erro.name === "AbortError");
            throw erro;
          } finally {
            tentativa.duracaoMs = relogio() - inicio;
          }
          etapa = "resposta";
          if (resposta.status !== 200) throw new Error("resposta");
          let conteudo: unknown;
          try {
            conteudo = JSON.parse(textoResposta);
          } catch {
            throw new Error("resposta");
          }
          // No preparo, os contadores dependem da reserva já usada; os hashes pós-POST
          // determinam gravadas/inalteradas sem exigir reset SQL ou presumir inserção fria.
          etapa = "estado";
          const atual = await lerEstado(banco, reserva);
          conferirEstado(atual, anterior, original, reserva, caso);
          const esperado = contagensEsperadas(
            caso,
            reserva.quantidade,
            anterior,
            atual
          );
          etapa = "resposta";
          conferirResposta(conteudo, esperado);
          tentativa.contagens = esperado;
          tentativa.valida = true;
          if (caso === "inicial") original = atual;
          anterior = atual;
        };
        await executarCaso();
        for (let indice = 0; indice < 35; indice++) {
          fase = indice < 5 ? "aquecimento" : "medicao";
          ciclo = indice < 5 ? indice + 1 : indice - 4;
          for (const transicao of CASOS) {
            caso = transicao;
            await executarCaso();
          }
        }
        serie.completa = true;
      } catch {
        serie.falha = {
          fase,
          ciclo,
          caso,
          etapa,
          tipo: serie.tentativas.at(-1)?.timeout
            ? "timeout"
            : "erro-ou-violacao",
          motivo: `Falha na etapa ${etapa}; escalas seguintes interrompidas.`,
        };
      }
      serie.casos = resumirCasos(serie.tentativas);
      if (!serie.completa) break;
    }
  } catch {
    falhaAmbiente = true;
  } finally {
    await banco.end().catch(() => {
      falhaAmbiente = true;
    });
  }
  return {
    completa:
      !falhaAmbiente &&
      resultados.length === 3 &&
      resultados.every((item) => item.completa),
    falhaAmbiente,
    resultados,
    pacingSintetico: true,
    aquecimentos: 5,
    ciclosMedidos: 30,
    timeoutHttpMs: TIMEOUT_MS,
    observacao:
      "Preparo separado; pacing sintético fora do HTTP. Não mede ritmo natural nem inserção fria. Dispersão = máximo menos mínimo; percentis nearest-rank.",
  };
}

export async function main(): Promise<void> {
  const reservas = await lerReservasSecretas(process.env.BENCH_INGEST_CONFIG);
  const resultado = await medirIngestao({
    httpUrl: process.env.BENCH_HTTP_URL ?? "",
    dbUrl: process.env.BENCH_DB_URL ?? "",
    reservas,
  });
  console.log(JSON.stringify(resultado, null, 2));
  if (!resultado.completa) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error(
      JSON.stringify({ erro: "Medição de ingestão local não executada." })
    );
    process.exitCode = 1;
  });
