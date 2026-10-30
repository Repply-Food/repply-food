import "server-only";
import { logError } from "@/lib/logger";
import {
  COMPARACOES_RESULTADOS,
  MAXIMO_DIAS_ESCOLHIDOS,
} from "@/lib/metricas/resultados/filtros";
import { createClient } from "@/lib/supabase/server";
import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import type {
  DefinicaoFerramenta,
  PedidoFerramenta,
  ResultadoFerramenta,
} from "./provedor/tipos";

/**
 * As ferramentas do mentor: as mesmas funções SQL `metrica_*` que alimentam as
 * telas Hoje e Resultados (CLAUDE.md §5: nunca se recalcula métrica em TS).
 *
 * SEGURANÇA: o `restaurante_id` de toda consulta vem do parâmetro
 * `restauranteId` do executor (a sessão), nunca dos argumentos que o modelo
 * manda. O catálogo nem declara esse campo ao modelo, e cada ferramenta lê dos
 * argumentos só os campos de negócio que conhece (datas, comparação). A RLS de
 * `entradas` é a segunda camada, mas aqui não se confia no modelo.
 */

type Cliente = Awaited<ReturnType<typeof createClient>>;
type Argumentos = Record<string, unknown>;
/** O pedaço da resposta do Supabase que o mentor lê (data e error). */
type RespostaRpc = { data: unknown; error: unknown };

/**
 * Monta a consulta de uma ferramenta, ou devolve a frase que explica por que os
 * argumentos do modelo não servem (aí o banco nem é consultado).
 */
type Consulta = (
  cliente: Cliente,
  restauranteId: string,
  argumentos: Argumentos,
  agora: string
) => PromiseLike<RespostaRpc> | string;

type Ferramenta = { definicao: DefinicaoFerramenta; consultar: Consulta };

// Por enquanto o mentor usa o padrão das contas esquecidas (M04), não o
// `limite_conta_esquecida` ajustado de cada casa.
const LIMITE_CONTA_ESQUECIDA = "04:00:00";

const MENSAGEM_FALHA =
  "Não consegui esse número agora. Diga ao dono que não deu para consultar isso neste momento e não invente valores.";
const MENSAGEM_DESCONHECIDA =
  "Ferramenta desconhecida. Use só as ferramentas disponíveis.";
const MENSAGEM_PERIODO = `O período pedido é inválido. Informe inicio e fim como datas reais no formato AAAA-MM-DD, com o fim no mesmo dia ou depois do início e no máximo ${MAXIMO_DIAS_ESCOLHIDOS} dias.`;
const MENSAGEM_COMPARACAO = `A comparação pedida não existe. Use ${COMPARACOES_RESULTADOS.map((c) => `"${c}"`).join(" ou ")}.`;

const SEM_PARAMETROS = { type: "object", properties: {} };

const PARAMETROS_DE_PERIODO = {
  type: "object",
  properties: {
    inicio: {
      type: "string",
      description:
        "Primeiro dia do período, no formato AAAA-MM-DD (dia de operação da casa).",
    },
    fim: {
      type: "string",
      description: `Último dia do período, inclusive, no formato AAAA-MM-DD. Não pode ser antes do início, e o período vai até ${MAXIMO_DIAS_ESCOLHIDOS} dias.`,
    },
  },
  required: ["inicio", "fim"],
};

function comoObjeto(valor: unknown): Argumentos {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Argumentos)
    : {};
}

/** Uma data AAAA-MM-DD que existe de verdade (nada de 30 de fevereiro). */
function lerDia(valor: unknown): Date | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return null;
  }
  const dia = parseISO(valor);
  return isValid(dia) && format(dia, "yyyy-MM-dd") === valor ? dia : null;
}

type Periodo = { p_inicio: string; p_fim: string };

/** Só devolve os dois campos de período: nada mais do modelo passa por aqui. */
function lerPeriodo(argumentos: Argumentos): Periodo | null {
  const inicio = lerDia(argumentos.inicio);
  const fim = lerDia(argumentos.fim);
  if (!inicio || !fim) return null;
  const dias = differenceInCalendarDays(fim, inicio) + 1;
  if (dias < 1 || dias > MAXIMO_DIAS_ESCOLHIDOS) return null;
  return {
    p_inicio: format(inicio, "yyyy-MM-dd"),
    p_fim: format(fim, "yyyy-MM-dd"),
  };
}

type ParametrosDePeriodo = Periodo & { p_restaurante_id: string };

/** Ferramenta de Resultados que só precisa do período. */
function porPeriodo(
  nome: string,
  descricao: string,
  chamar: (
    cliente: Cliente,
    parametros: ParametrosDePeriodo
  ) => PromiseLike<RespostaRpc>
): Ferramenta {
  return {
    definicao: { nome, descricao, parametros: PARAMETROS_DE_PERIODO },
    consultar: (cliente, restauranteId, argumentos) => {
      const periodo = lerPeriodo(argumentos);
      if (!periodo) return MENSAGEM_PERIODO;
      // O restaurante da sessão vem por último: vence qualquer outro campo.
      return chamar(cliente, { ...periodo, p_restaurante_id: restauranteId });
    },
  };
}

const CATALOGO: Ferramenta[] = [
  // Hoje
  {
    definicao: {
      nome: "faturamento_de_hoje",
      descricao:
        "Quanto a casa faturou hoje, até agora: faturamento (sem a taxa de serviço), taxa de serviço (os 10%, sempre separada), contas pagas e pessoas atendidas. Hoje é o dia de operação da casa, que só vira na hora de virada (padrão 5h), não à meia-noite.",
      parametros: SEM_PARAMETROS,
    },
    consultar: (cliente, restauranteId, _argumentos, agora) =>
      cliente.rpc("metrica_faturamento_do_dia", {
        p_restaurante_id: restauranteId,
        p_ate: agora,
      }),
  },
  {
    definicao: {
      nome: "comparacao_de_hoje",
      descricao:
        "Compara o faturamento de hoje até este horário com a média das últimas 4 ocorrências do mesmo dia da semana até o mesmo horário (nunca com o dia inteiro). Traz também o valor por pessoa e as variações em relação à média (fração: 0,1 é 10% a mais). Com menos de 2 ocorrências no histórico, as médias e variações vêm vazias: diga que ainda não há histórico para comparar.",
      parametros: SEM_PARAMETROS,
    },
    consultar: (cliente, restauranteId, _argumentos, agora) =>
      cliente.rpc("metrica_comparacao_do_dia", {
        p_restaurante_id: restauranteId,
        p_agora: agora,
      }),
  },
  {
    definicao: {
      nome: "mesas_abertas_agora",
      descricao:
        "As mesas e contas abertas neste momento: quantidade, valor em aberto (ainda não pago) e pessoas na casa.",
      parametros: SEM_PARAMETROS,
    },
    consultar: (cliente, restauranteId, _argumentos, agora) =>
      cliente.rpc("metrica_mesas_abertas", {
        p_restaurante_id: restauranteId,
        p_agora: agora,
      }),
  },
  {
    definicao: {
      nome: "curva_de_hoje",
      descricao:
        "O faturamento acumulado de hoje, de 30 em 30 minutos desde a hora de virada do dia (minuto_do_dia), ao lado do acumulado típico: a média das últimas 4 ocorrências do mesmo dia da semana. Serve para ver se o dia está acima ou abaixo do normal em cada horário. acumulado_hoje vem vazio nos horários que ainda não chegaram, e acumulado_tipico vem vazio quando há pouco histórico.",
      parametros: SEM_PARAMETROS,
    },
    consultar: (cliente, restauranteId, _argumentos, agora) =>
      cliente.rpc("metrica_curva_do_dia", {
        p_restaurante_id: restauranteId,
        p_agora: agora,
      }),
  },
  {
    definicao: {
      nome: "contas_esquecidas",
      descricao:
        "Contas abertas há mais de 4 horas e ainda não fechadas, que podem ter sido esquecidas: o cartão ou mesa (cod_cartao_mesa), o código da conta, quando abriu, há quanto tempo está aberta e o valor em aberto.",
      parametros: SEM_PARAMETROS,
    },
    consultar: (cliente, restauranteId, _argumentos, agora) =>
      cliente.rpc("metrica_contas_esquecidas", {
        p_restaurante_id: restauranteId,
        p_agora: agora,
        p_limite: LIMITE_CONTA_ESQUECIDA,
      }),
  },
  {
    definicao: {
      nome: "meta_do_mes",
      descricao:
        "Como o mês está em relação à meta de faturamento: faturamento do mês até agora, a meta (vazia se a casa não definiu uma), o andamento (fração da meta atingida: 0,5 é metade) e a projeção para o fim do mês, que só existe quando projecao_disponivel é verdadeiro.",
      parametros: SEM_PARAMETROS,
    },
    consultar: (cliente, restauranteId, _argumentos, agora) =>
      cliente.rpc("metrica_meta_do_mes", {
        p_restaurante_id: restauranteId,
        p_agora: agora,
      }),
  },

  // Resultados
  {
    definicao: {
      nome: "resumo_do_periodo",
      descricao:
        "Resumo de um período: faturamento (sem a taxa de serviço), taxa de serviço, contas, pessoas, ticket médio por conta e por pessoa, total de descontos e o percentual de descontos sobre o faturamento. Compara com uma referência: anterior (o período logo antes, do mesmo tamanho) ou semana (a média das últimas 4 ocorrências dos mesmos dias da semana). Os campos referencia_* e variacao_* (fração: 0,1 é 10% a mais) vêm vazios quando não há base de comparação.",
      parametros: {
        ...PARAMETROS_DE_PERIODO,
        properties: {
          ...PARAMETROS_DE_PERIODO.properties,
          comparacao: {
            type: "string",
            enum: [...COMPARACOES_RESULTADOS],
            description:
              "Com o que comparar: anterior (padrão) ou semana. Opcional.",
          },
        },
      },
    },
    consultar: (cliente, restauranteId, argumentos) => {
      const periodo = lerPeriodo(argumentos);
      if (!periodo) return MENSAGEM_PERIODO;
      const pedida = argumentos.comparacao ?? "anterior";
      const comparacao = COMPARACOES_RESULTADOS.find((c) => c === pedida);
      if (!comparacao) return MENSAGEM_COMPARACAO;
      return cliente.rpc("metrica_resultados_resumo", {
        ...periodo,
        p_comparacao: comparacao,
        p_restaurante_id: restauranteId,
      });
    },
  },
  porPeriodo(
    "vendas_por_dia",
    "Faturamento e taxa de serviço de cada dia de operação do período, um registro por dia (os dias sem venda aparecem com zero).",
    (cliente, parametros) =>
      cliente.rpc("metrica_resultados_vendas_diarias", parametros)
  ),
  porPeriodo(
    "mesa_e_balcao",
    "Faturamento do período por tipo de ocupação: Mesa, Balcão e Outros, com a participação de cada um no total (fração: 0,25 é 25%).",
    (cliente, parametros) =>
      cliente.rpc("metrica_resultados_ocupacao", parametros)
  ),
  porPeriodo(
    "faturamento_por_hora",
    "Faturamento do período somado por hora do dia em que a conta foi aberta (hora de 0 a 23, no horário da casa). Mostra em que horas a casa mais fatura.",
    (cliente, parametros) => cliente.rpc("metrica_resultados_horas", parametros)
  ),
  porPeriodo(
    "mapa_de_calor_do_movimento",
    "Média de contas abertas por dia da semana e por hora no período (dia_semana: 0 é domingo e 6 é sábado; hora de 0 a 23, no horário da casa). Mostra quando a casa costuma ter mais movimento.",
    (cliente, parametros) =>
      cliente.rpc("metrica_resultados_mapa_calor", parametros)
  ),
  porPeriodo(
    "almoco_e_jantar",
    "Faturamento, número de contas e permanência média por turno (Almoço e Jantar) no período. O corte entre os turnos é o horário que a casa configurou (padrão 17h).",
    (cliente, parametros) =>
      cliente.rpc("metrica_resultados_turnos", parametros)
  ),
  porPeriodo(
    "desempenho_da_equipe",
    "Desempenho por garçom no período, do maior faturamento para o menor: faturamento, contas, pessoas, ticket por conta e por pessoa e taxa de serviço. O garçom vem só pelo código do caixa (cod_garcom): chame de Garçom 27, nunca invente nomes. cod_garcom vazio é conta sem garçom informado.",
    (cliente, parametros) =>
      cliente.rpc("metrica_resultados_equipe", parametros)
  ),
  porPeriodo(
    "descontos_por_operador",
    "Total de descontos dados no período por operador de caixa que fechou a conta, do maior para o menor. O operador vem só pelo código do caixa (cod_operador_fechamento): chame de Operador 3, nunca invente nomes. Código vazio é operador não informado.",
    (cliente, parametros) =>
      cliente.rpc("metrica_resultados_descontos", parametros)
  ),
];

/** O catálogo que o provedor de IA mostra ao modelo. */
export const FERRAMENTAS: DefinicaoFerramenta[] = CATALOGO.map(
  (ferramenta) => ferramenta.definicao
);

function resposta(nome: string, resultado: unknown): ResultadoFerramenta {
  return { nome, resultado };
}

function erro(nome: string, mensagem: string): ResultadoFerramenta {
  return resposta(nome, { erro: mensagem });
}

async function executarUma(
  pedido: PedidoFerramenta,
  restauranteId: string,
  agora: string
): Promise<ResultadoFerramenta> {
  const ferramenta = CATALOGO.find((f) => f.definicao.nome === pedido.nome);
  if (!ferramenta) return erro(pedido.nome, MENSAGEM_DESCONHECIDA);

  try {
    const supabase = await createClient();
    const consulta = ferramenta.consultar(
      supabase,
      restauranteId,
      comoObjeto(pedido.argumentos),
      agora
    );
    if (typeof consulta === "string") return erro(pedido.nome, consulta);

    const { data, error } = await consulta;
    if (error) {
      logError("falha_ferramenta_mentor");
      return erro(pedido.nome, MENSAGEM_FALHA);
    }
    return resposta(pedido.nome, data ?? []);
  } catch {
    logError("falha_ferramenta_mentor");
    return erro(pedido.nome, MENSAGEM_FALHA);
  }
}

/**
 * Roda os pedidos do modelo, na ordem em que vieram, todos com o mesmo "agora".
 * Nunca lança: ferramenta desconhecida, argumento inválido ou erro do banco
 * viram um resultado com frase de produto (nunca o texto do Postgres).
 *
 * `restauranteId` é o da SESSÃO. Nenhum campo dos `argumentos` do modelo chega
 * à consulta sem passar pela leitura da ferramenta, e nenhuma lê restaurante.
 */
export async function executarFerramentas(
  pedidos: PedidoFerramenta[],
  restauranteId: string
): Promise<ResultadoFerramenta[]> {
  const agora = new Date().toISOString();
  return Promise.all(
    pedidos.map((pedido) => executarUma(pedido, restauranteId, agora))
  );
}
