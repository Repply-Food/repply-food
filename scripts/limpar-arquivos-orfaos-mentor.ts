/**
 * Varredura de arquivos órfãos do mentor (`mentor-anexos`).
 *
 * O cofre só perde a ficha em alguns caminhos: a faxina aposenta a ficha de
 * 12 meses sem tocar no arquivo, apagar a casa leva as fichas em cascata
 * (também sem tocar no arquivo), e um tombo entre o `move` e o `update` do
 * vínculo deixa o arquivo novo sem ficha. O que sobra no cofre sem ficha é
 * órfão, e este script apaga.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/limpar-arquivos-orfaos-mentor.ts [--executar]
 * Sem `--executar` é dry-run: só lista os órfãos, sem apagar nada. Com
 * `--executar`, apaga do cofre os arquivos sem ficha.
 *
 * Trava de segurança: só roda contra o banco local (127.0.0.1, localhost ou
 * ::1), como `scripts/acesso-local.ts`. A chave de serviço vem de
 * SUPABASE_SERVICE_ROLE_KEY (nunca tem prefixo NEXT_PUBLIC_ nem vai ao git).
 */
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
  url: string;
  chave: string;
};

/**
 * Lê os argumentos e o ambiente. Dry-run é o padrão; `--executar` libera o
 * apagar. Recusa endereço fora desta máquina e falta da chave de serviço.
 */
export function lerConfig(
  argv: string[],
  ambiente: Record<string, string | undefined> = process.env
): Config {
  const url = ambiente.SUPABASE_URL ?? ambiente.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!enderecoLocal(url)) {
    throw new Error("Este comando só roda contra o banco local (127.0.0.1).");
  }
  const chave = ambiente.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!chave) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY no .env.local");
  }
  return { executar: argv.includes("--executar"), url, chave };
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

async function main(): Promise<void> {
  const config = lerConfig(process.argv.slice(2));
  const db = createClient(config.url, config.chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const resultado = await limparOrfaos(
    criarCofreReal(db),
    criarFichasReais(db),
    { executar: config.executar }
  );
  console.log(
    config.executar
      ? `[orfaos-mentor] apagados ${resultado.apagados} de ${resultado.orfaos.length} órfãos`
      : `[orfaos-mentor] dry-run: ${resultado.orfaos.length} órfãos (passe --executar para apagar)`
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
