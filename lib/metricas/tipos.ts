/**
 * Tipos do que a tela "Hoje" recebe das funções SQL `metrica_*`.
 *
 * Dinheiro é sempre `string` (o banco devolve `::text`): nunca `number` para
 * centavos. Pode vir "0", "0.00" ou "580.00". Quem formata é `formatarBRL`.
 * `null` quer dizer "sem dado" e a tela mostra "—" (divisão por zero, sem
 * histórico, sem meta).
 */

export type Comparacao<Valor extends string | null = string> = {
  /** Dinheiro de hoje, ex.: "8420.00". */
  valor: Valor;
  /** Média das últimas ocorrências do mesmo dia da semana; null = sem histórico. */
  media: string | null;
  /** Variação contra a média; 0.13 = +13%. null = sem histórico. */
  variacao: number | null;
};

export type PontoDaCurva = {
  /** Minutos desde a hora de virada do dia (0, 30, 60, ...). */
  minuto: number;
  /** Acumulado de hoje; null nas faixas que ainda não chegaram. */
  hoje: string | null;
  /** Acumulado do dia típico; null sem histórico. */
  tipico: string | null;
};

export type ContaEsquecida = {
  cod: number;
  /** Código do cartão ou da mesa; a tela mostra "Mesa N" ou "Cartão N". */
  mesa: number | null;
  /** Momento da abertura (timestamptz em texto). */
  abertaEm: string;
  /** Há quanto tempo está aberta (interval em texto, ex.: "05:12:00"). */
  abertaHa: string;
  valor: string;
};

export type Meta = {
  faturamentoMes: string;
  /** null = a casa ainda não definiu meta. */
  meta: string | null;
  /** faturamento do mês ÷ meta; 0.62 = 62%. null = sem meta. */
  andamento: number | null;
  /**
   * A previsão do mês. Independe da meta: pode vir com valor mesmo sem meta.
   * Mostrá-la só quando há meta é regra da tela.
   */
  projecao: string | null;
  projecaoDisponivel: boolean;
};

export type DadosDoHoje = {
  faturamento: Comparacao & {
    taxaServico: string;
    contasPagas: number;
    pessoasPagas: number;
  };
  /** `valor` é null quando ainda não há pessoa paga (divisão por zero). */
  porPessoa: Comparacao<string | null>;
  mesasAbertas: {
    quantidade: number;
    valorEmAberto: string;
    pessoasNaCasa: number;
  };
  curva: PontoDaCurva[];
  /** Todas as esquecidas, da mais antiga para a mais nova. A tela corta em 3. */
  contasEsquecidas: ContaEsquecida[];
  meta: Meta;
};
