import type { Database } from "@/types/database.types";
import type { DadosDoHoje } from "./tipos";

/**
 * Junta as linhas das seis funções `metrica_*` no `DadosDoHoje` da tela.
 *
 * É só transcrição de campos: nenhuma métrica é calculada aqui (CLAUDE.md §5).
 * Fica fora de `hoje.ts` para poder ser testada sem sessão nem banco.
 */

type Funcoes = Database["public"]["Functions"];
type Linha<Nome extends keyof Funcoes> =
  Funcoes[Nome]["Returns"] extends (infer L)[] ? L : never;

/**
 * O gerador de tipos do Supabase marca toda coluna de função como não nula.
 * Estas podem vir `null` de verdade (divisão por zero, sem histórico, sem meta),
 * então o leitor trata o que o banco realmente devolve.
 */
type ComNulos<L, Colunas extends keyof L> = Omit<L, Colunas> & {
  [C in Colunas]: L[C] | null;
};

export type LinhasDoHoje = {
  faturamento: readonly Linha<"metrica_faturamento_do_dia">[];
  comparacao: readonly ComNulos<
    Linha<"metrica_comparacao_do_dia">,
    | "por_pessoa_hoje"
    | "media_faturamento"
    | "media_por_pessoa"
    | "variacao_faturamento"
    | "variacao_por_pessoa"
  >[];
  mesasAbertas: readonly Linha<"metrica_mesas_abertas">[];
  curva: readonly ComNulos<
    Linha<"metrica_curva_do_dia">,
    "acumulado_hoje" | "acumulado_tipico"
  >[];
  contasEsquecidas: readonly ComNulos<
    Linha<"metrica_contas_esquecidas">,
    "cod_cartao_mesa"
  >[];
  meta: readonly ComNulos<
    Linha<"metrica_meta_do_mes">,
    "meta" | "andamento" | "projecao"
  >[];
};

/**
 * Faturamento e mesas abertas são agregados: sempre 1 linha. Sem ela o
 * contrato do banco quebrou, e a tela de erro é melhor que um zero inventado.
 */
function umaLinha<L>(linhas: readonly L[]): L {
  const [linha] = linhas;
  if (!linha) throw new Error("linha_ausente");
  return linha;
}

export function montarDadosDoHoje(linhas: LinhasDoHoje): DadosDoHoje {
  const fat = umaLinha(linhas.faturamento);
  const mesas = umaLinha(linhas.mesasAbertas);
  // Comparação e meta vêm sem linha para uma casa inacessível. A página só chama
  // com a casa já conferida, então é um caso de defesa: vira "sem dado", não erro.
  const [cmp] = linhas.comparacao;
  const [meta] = linhas.meta;

  return {
    faturamento: {
      valor: fat.faturamento,
      media: cmp?.media_faturamento ?? null,
      variacao: cmp?.variacao_faturamento ?? null,
      taxaServico: fat.taxa_servico,
      contasPagas: fat.contas_pagas,
      pessoasPagas: fat.pessoas_pagas,
    },
    porPessoa: {
      valor: cmp?.por_pessoa_hoje ?? null,
      media: cmp?.media_por_pessoa ?? null,
      variacao: cmp?.variacao_por_pessoa ?? null,
    },
    mesasAbertas: {
      quantidade: mesas.quantidade,
      valorEmAberto: mesas.valor_em_aberto,
      pessoasNaCasa: mesas.pessoas_na_casa,
    },
    curva: linhas.curva.map((ponto) => ({
      minuto: ponto.minuto_do_dia,
      hoje: ponto.acumulado_hoje,
      tipico: ponto.acumulado_tipico,
    })),
    contasEsquecidas: linhas.contasEsquecidas.map((conta) => ({
      cod: conta.cod_entrada,
      mesa: conta.cod_cartao_mesa,
      abertaEm: conta.aberta_em,
      abertaHa: conta.aberta_ha,
      valor: conta.valor_em_aberto,
    })),
    meta: {
      faturamentoMes: meta?.faturamento_mes ?? "0",
      meta: meta?.meta ?? null,
      andamento: meta?.andamento ?? null,
      projecao: meta?.projecao ?? null,
      projecaoDisponivel: meta?.projecao_disponivel ?? false,
    },
  };
}
