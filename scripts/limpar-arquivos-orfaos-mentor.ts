/**
 * Varredura de arquivos órfãos do mentor (`mentor-anexos`).
 *
 * O cofre só perde a ficha em alguns caminhos: a faxina aposenta a ficha de
 * 12 meses sem tocar no arquivo, apagar a casa leva as fichas em cascata
 * (também sem tocar no arquivo), e um tombo entre o `move` e o `update` do
 * vínculo deixa o arquivo novo sem ficha. O que sobra no cofre sem ficha é
 * órfão, e este script apaga.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/limpar-arquivos-orfaos-mentor.ts [--executar | --producao]
 * Sem flag é dry-run: só lista os órfãos, sem apagar nada — em qualquer
 * ambiente, inclusive na nuvem. Com `--executar`, apaga de verdade, mas só
 * contra o banco local. Com `--producao`, apaga no banco da SUPABASE_URL
 * atual (a nuvem): o script pede para digitar APAGAR e só apaga com a
 * confirmação exata.
 *
 * Trava de segurança: apagar pede URL de loopback (`--executar`, como
 * `scripts/acesso-local.ts`) ou URL fora dela COM confirmação digitada
 * (`--producao`); `--executar` na nuvem é recusado. A chave de serviço vem de
 * SUPABASE_SERVICE_ROLE_KEY (nunca tem prefixo NEXT_PUBLIC_ nem vai ao git).
 */
import { stdin as entradaPadrao, stdout as saidaPadrao } from "node:process";
import { createInterface } from "node:readline/promises";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { enderecoLocal } from "./gerador-dados-ficticios";

/** O cofre privado dos anexos do mentor (só a chave de serviço abre). */
export const COFRE_DOS_ANEXOS = "mentor-anexos";

const PAGINA = 1000;

/** O cofre apaga em lotes para não estourar a requisição. */
export const LOTE_REMOCAO = 500;

/** O mínimo do cofre que a varredura precisa (o dublado do teste entra aqui). */
export type CofreDoMentor = {
  listarCaminhos(): Promise<string[]>;
  remover(caminhos: string[]): Promise<void>;
};

/** O mínimo da tabela que a varredura precisa (o dublado do teste entra aqui). */
export type FichasDoMentor = {
  caminhosRegistrados(): Promise<Set<string>>;
};

export type ResultadoDaVarredura = {
  orfaos: string[];
  apagados: number;
};

type Config = {
  executar: boolean;
  producao: boolean;
  url: string;
  chave: string;
};

/** A palavra que libera o apagar em produção (comparação exata). */
export const CONFIRMACAO_APAGAR = "APAGAR";

/**
 * Confere a confirmação digitada no modo `--producao`: só a palavra exata
 * libera o apagar. Qualquer outra coisa (vazio, minúscula, com espaço)
 * recusa — o lado seguro para uma operação destrutiva.
 */
export function confirmarApagar(digitado: string | undefined): boolean {
  return digitado === CONFIRMACAO_APAGAR;
}

/**
 * Lê os argumentos e o ambiente. Dry-run é o padrão em qualquer ambiente
 * (só lista, sem apagar). `--executar` apaga, mas só contra o banco local;
 * na nuvem ele é recusado. `--producao` apaga na SUPABASE_URL atual (a
 * nuvem) e recusa URL local — a confirmação digitada acontece no `main`.
 */
export function lerConfig(
  argv: string[],
  ambiente: Record<string, string | undefined> = process.env
): Config {
  const producao = argv.includes("--producao");
  const url = ambiente.SUPABASE_URL ?? ambiente.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const chave = ambiente.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!chave) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY no .env.local");
  }
  if (producao) {
    if (enderecoLocal(url)) {
      throw new Error(
        "O modo --producao é para o banco da nuvem; no banco local use --executar."
      );
    }
    return { executar: true, producao: true, url, chave };
  }
  const executar = argv.includes("--executar");
  if (executar && !enderecoLocal(url)) {
    throw new Error(
      "Este comando só apaga contra o banco local (127.0.0.1). Na nuvem, confira em dry-run e use --producao."
    );
  }
  return { executar, producao: false, url, chave };
}

type EntradaDoCofre = {
  name: string;
  id?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Lista tudo do cofre, descendo as pastas (`pendente/`, `{casa}/...`). */
export function criarCofreReal(db: SupabaseClient): CofreDoMentor {
  async function listarDentro(prefixo: string): Promise<string[]> {
    const achados: string[] = [];
    let deslocamento = 0;
    for (;;) {
      const pagina = await db.storage
        .from(COFRE_DOS_ANEXOS)
        .list(prefixo === "" ? undefined : prefixo, {
          limit: PAGINA,
          offset: deslocamento,
        });
      if (pagina.error) throw new Error("não listou o cofre dos anexos");
      const itens = (pagina.data ?? []) as unknown as EntradaDoCofre[];
      for (const item of itens) {
        const caminho = prefixo === "" ? item.name : `${prefixo}/${item.name}`;
        // Pasta (o cofre devolve sem id): desce nela em vez de listar.
        if (item.id == null) {
          achados.push(...(await listarDentro(caminho)));
        } else {
          achados.push(caminho);
        }
      }
      if (itens.length < PAGINA) break;
      deslocamento += PAGINA;
    }
    return achados;
  }

  return {
    listarCaminhos: () => listarDentro(""),
    remover: async (caminhos: string[]) => {
      for (let i = 0; i < caminhos.length; i += LOTE_REMOCAO) {
        const lote = caminhos.slice(i, i + LOTE_REMOCAO);
        const saida = await db.storage.from(COFRE_DOS_ANEXOS).remove(lote);
        if (saida.error) throw new Error("não apagou os órfãos do cofre");
      }
    },
  };
}

/** Lê todos os `caminho` da tabela (paginado, para não estourar a resposta). */
export function criarFichasReais(db: SupabaseClient): FichasDoMentor {
  return {
    caminhosRegistrados: async () => {
      const vinculados = new Set<string>();
      let deslocamento = 0;
      for (;;) {
        const pagina = await db
          .from("mentor_anexos")
          .select("caminho")
          .range(deslocamento, deslocamento + PAGINA - 1);
        if (pagina.error) throw new Error("não leu as fichas dos anexos");
        for (const linha of pagina.data ?? []) vinculados.add(linha.caminho);
        if ((pagina.data ?? []).length < PAGINA) break;
        deslocamento += PAGINA;
      }
      return vinculados;
    },
  };
}

/** Os arquivos do cofre sem ficha na tabela, em ordem alfabética. */
export async function apurarOrfaos(
  cofre: CofreDoMentor,
  fichas: FichasDoMentor
): Promise<string[]> {
  const [arquivos, vinculados] = await Promise.all([
    cofre.listarCaminhos(),
    fichas.caminhosRegistrados(),
  ]);
  return arquivos.filter((caminho) => !vinculados.has(caminho)).sort();
}

/**
 * Apura e, só com `executar: true`, apaga os órfãos do cofre. Nunca toca no
 * arquivo com ficha. Sem órfão, nem chama o apagar.
 */
export async function limparOrfaos(
  cofre: CofreDoMentor,
  fichas: FichasDoMentor,
  opcoes: { executar: boolean }
): Promise<ResultadoDaVarredura> {
  const orfaos = await apurarOrfaos(cofre, fichas);
  if (!opcoes.executar || orfaos.length === 0) {
    return { orfaos, apagados: 0 };
  }
  await cofre.remover(orfaos);
  return { orfaos, apagados: orfaos.length };
}

async function pedirConfirmacao(pergunta: string): Promise<string> {
  const leitor = createInterface({
    input: entradaPadrao,
    output: saidaPadrao,
  });
  try {
    return await leitor.question(pergunta);
  } finally {
    leitor.close();
  }
}

async function main(): Promise<void> {
  const config = lerConfig(process.argv.slice(2));
  if (config.producao) {
    const digitado = await pedirConfirmacao(
      "[orfaos-mentor] ATENÇÃO: vai APAGAR órfãos do cofre em PRODUÇÃO. Digite APAGAR para confirmar: "
    );
    if (!confirmarApagar(digitado)) {
      console.error("[orfaos-mentor] confirmação inválida; nada foi apagado");
      process.exit(1);
    }
  }
  const db = createClient(config.url, config.chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const resultado = await limparOrfaos(
    criarCofreReal(db),
    criarFichasReais(db),
    { executar: config.executar }
  );
  const onde = config.producao ? " (produção)" : "";
  console.log(
    config.executar
      ? `[orfaos-mentor] apagados ${resultado.apagados} de ${resultado.orfaos.length} órfãos${onde}`
      : `[orfaos-mentor] dry-run: ${resultado.orfaos.length} órfãos${onde} (passe --executar para apagar)`
  );
  for (const caminho of resultado.orfaos) console.log(`  ${caminho}`);
}

if (process.argv[1]?.endsWith("limpar-arquivos-orfaos-mentor.ts")) {
  main().catch((erro: unknown) => {
    console.error(
      "[orfaos-mentor]",
      erro instanceof Error ? erro.message : "falhou"
    );
    process.exit(1);
  });
}
