import {
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
  startOfMonth,
  subDays,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";

export const ABAS_RESULTADOS = [
  "vendas",
  "horarios",
  "equipe",
  "descontos",
] as const;
export const COMPARACOES_RESULTADOS = ["anterior", "semana"] as const;
export const MAXIMO_DIAS_ESCOLHIDOS = 90;

const ATALHOS_RESULTADOS = ["hoje", "7d", "mes", "escolher"] as const;

type AbaResultados = (typeof ABAS_RESULTADOS)[number];
type ComparacaoResultados = (typeof COMPARACOES_RESULTADOS)[number];
type AtalhoResultados = (typeof ATALHOS_RESULTADOS)[number];
type ValorDeFiltro = string | string[] | undefined;

export type FiltrosResultados = {
  aba: AbaResultados;
  comparacao: ComparacaoResultados;
  atalho: AtalhoResultados;
  inicio: string;
  fim: string;
  quantidadeDias: number;
  rotuloPeriodo: string;
  query: string;
};

export type EntradaFiltrosResultados =
  | URLSearchParams
  | Record<string, ValorDeFiltro>;

function valor(
  entrada: EntradaFiltrosResultados,
  nome: string
): string | undefined {
  if (entrada instanceof URLSearchParams) {
    const valores = entrada.getAll(nome);
    return valores.length === 1 ? valores[0] : undefined;
  }

  const recebido = entrada[nome];
  return typeof recebido === "string" ? recebido : undefined;
}

function pertence<T extends readonly string[]>(
  valorRecebido: string | undefined,
  valores: T,
  padrao: T[number]
): T[number] {
  return valorRecebido && valores.includes(valorRecebido)
    ? (valorRecebido as T[number])
    : padrao;
}

function dataIso(data: string | undefined): Date | null {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;

  const convertida = parseISO(data);
  return isValid(convertida) && format(convertida, "yyyy-MM-dd") === data
    ? convertida
    : null;
}

function segundosDaVirada(horaVirada: string): number {
  const [hora = "0", minuto = "0", segundo = "0"] = horaVirada.split(":");
  return (
    Number.parseInt(hora, 10) * 60 * 60 +
    Number.parseInt(minuto, 10) * 60 +
    Number.parseInt(segundo, 10)
  );
}

function diaDeOperacao(agora: Date, fuso: string, horaVirada: string): Date {
  return new Date(
    toZonedTime(agora, fuso).getTime() - segundosDaVirada(horaVirada) * 1000
  );
}

function rotuloPeriodo(inicio: Date, fim: Date): string {
  const formato = "d 'de' MMMM 'de' yyyy";
  if (format(inicio, "yyyy") === format(fim, "yyyy")) {
    return `${format(inicio, "d 'de' MMMM", { locale: ptBR })} a ${format(fim, formato, { locale: ptBR })}`;
  }
  return `${format(inicio, formato, { locale: ptBR })} a ${format(fim, formato, { locale: ptBR })}`;
}

function queryCanonica(
  aba: AbaResultados,
  atalho: AtalhoResultados,
  inicio: string,
  fim: string,
  comparacao: ComparacaoResultados
): string {
  const query = new URLSearchParams({ aba, periodo: atalho });
  if (atalho === "escolher") {
    query.set("inicio", inicio);
    query.set("fim", fim);
  }
  query.set("comparacao", comparacao);
  return query.toString();
}

export function parseFiltrosResultados(
  entrada: EntradaFiltrosResultados,
  agora: Date,
  fuso: string,
  horaVirada: string
): FiltrosResultados {
  const aba = pertence(valor(entrada, "aba"), ABAS_RESULTADOS, "vendas");
  const comparacao = pertence(
    valor(entrada, "comparacao"),
    COMPARACOES_RESULTADOS,
    "anterior"
  );
  let atalho = pertence(valor(entrada, "periodo"), ATALHOS_RESULTADOS, "7d");
  const hoje = diaDeOperacao(agora, fuso, horaVirada);
  let inicio: Date;
  let fim: Date;

  if (atalho === "escolher") {
    const inicioEscolhido = dataIso(valor(entrada, "inicio"));
    const fimEscolhido = dataIso(valor(entrada, "fim"));
    const quantidadeDias =
      inicioEscolhido && fimEscolhido
        ? differenceInCalendarDays(fimEscolhido, inicioEscolhido) + 1
        : 0;

    if (
      !inicioEscolhido ||
      !fimEscolhido ||
      quantidadeDias < 1 ||
      quantidadeDias > MAXIMO_DIAS_ESCOLHIDOS
    ) {
      atalho = "7d";
      inicio = subDays(hoje, 6);
      fim = hoje;
    } else {
      inicio = inicioEscolhido;
      fim = fimEscolhido;
    }
  } else if (atalho === "hoje") {
    inicio = hoje;
    fim = hoje;
  } else if (atalho === "mes") {
    inicio = startOfMonth(hoje);
    fim = hoje;
  } else {
    inicio = subDays(hoje, 6);
    fim = hoje;
  }

  const inicioIso = format(inicio, "yyyy-MM-dd");
  const fimIso = format(fim, "yyyy-MM-dd");

  return {
    aba,
    comparacao,
    atalho,
    inicio: inicioIso,
    fim: fimIso,
    quantidadeDias: differenceInCalendarDays(fim, inicio) + 1,
    rotuloPeriodo: rotuloPeriodo(inicio, fim),
    query: queryCanonica(aba, atalho, inicioIso, fimIso, comparacao),
  };
}
