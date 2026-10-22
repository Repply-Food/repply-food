import type { EstadoSinal } from "@/lib/painel/selo";
import { plural } from "./texto";

export type LinhaDaLista = {
  id: string;
  slug: string;
  nome: string;
  situacao: "ativo" | "suspenso";
  fuso: string;
  estado: EstadoSinal | null;
  ultimoEnvioOkEm: string | null;
  versaoScc: string | null;
  demonstracao: boolean;
};

export type GrupoDaLista = EstadoSinal | "suspenso";

/** Quem precisa de atenção primeiro, no celular e no computador (desenho §1.1). */
export const ORDEM_DE_ATENCAO: readonly GrupoDaLista[] = [
  "parado",
  "atrasado",
  "aguardando",
  "em_dia",
  "fechado",
  "suspenso",
];

const ORDEM_DOS_CONTADORES: readonly GrupoDaLista[] = [
  "em_dia",
  "atrasado",
  "parado",
  "aguardando",
  "fechado",
  "suspenso",
];

const ROTULOS: Record<GrupoDaLista, [string, string]> = {
  em_dia: ["em dia", "em dia"],
  atrasado: ["atrasado", "atrasados"],
  parado: ["parado", "parados"],
  aguardando: ["aguardando", "aguardando"],
  fechado: ["fechado", "fechados"],
  suspenso: ["suspenso", "suspensos"],
};

/** Suspenso vai para o fim seja qual for o estado; sem sinal é "aguardando". */
export function grupoDaLinha(
  l: Pick<LinhaDaLista, "situacao" | "estado">
): GrupoDaLista {
  if (l.situacao === "suspenso") return "suspenso";
  return l.estado ?? "aguardando";
}

export function ordenarParaAtencao<T extends LinhaDaLista>(
  linhas: readonly T[]
): T[] {
  return [...linhas].sort(
    (a, b) =>
      ORDEM_DE_ATENCAO.indexOf(grupoDaLinha(a)) -
        ORDEM_DE_ATENCAO.indexOf(grupoDaLinha(b)) ||
      a.nome.localeCompare(b.nome, "pt-BR")
  );
}

/** "5 cadastrados", "2 em dia", "1 atrasado"…: só os estados que existem. */
export function contadoresDaLista(linhas: readonly LinhaDaLista[]): string[] {
  const contagem = new Map<GrupoDaLista, number>();
  for (const linha of linhas) {
    const grupo = grupoDaLinha(linha);
    contagem.set(grupo, (contagem.get(grupo) ?? 0) + 1);
  }
  const textos = [plural(linhas.length, "cadastrado", "cadastrados")];
  for (const grupo of ORDEM_DOS_CONTADORES) {
    const total = contagem.get(grupo) ?? 0;
    if (total > 0) {
      const [um, varios] = ROTULOS[grupo];
      textos.push(plural(total, um, varios));
    }
  }
  return textos;
}
