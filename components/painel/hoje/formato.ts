import { FUSO_PADRAO } from "@/lib/admin/fusos";

/**
 * Textos de exibição da tela "Hoje": dia da semana, mês, hora e duração.
 *
 * NÃO é cálculo de métrica (CLAUDE.md §5): aqui só se formata o que vai na
 * legenda da curva ("sexta típica"), no chip ("vs. sextas até 21h40"), no
 * título da meta ("Meta de outubro") e no alerta ("Mesa 12 · 4h20"). Tudo no
 * fuso da CASA, nunca no do servidor nem no do navegador (CLAUDE.md §5). Fuso
 * inválido cai no padrão, como em `lib/admin/datas.ts`.
 */

const DIAS = [
  { singular: "domingo", plural: "domingos" },
  { singular: "segunda", plural: "segundas" },
  { singular: "terça", plural: "terças" },
  { singular: "quarta", plural: "quartas" },
  { singular: "quinta", plural: "quintas" },
  { singular: "sexta", plural: "sextas" },
  { singular: "sábado", plural: "sábados" },
] as const;

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

type PartesDoFuso = {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: string;
};

function partesNoFuso(momento: Date, fuso: string): PartesDoFuso {
  const formatar = (zona: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: zona,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(momento);
  let lista: Intl.DateTimeFormatPart[];
  try {
    lista = formatar(fuso);
  } catch {
    lista = formatar(FUSO_PADRAO);
  }
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    lista.find((parte) => parte.type === tipo)?.value ?? "";
  return {
    ano: Number(valor("year")),
    mes: Number(valor("month")),
    dia: Number(valor("day")),
    hora: Number(valor("hour")),
    minuto: valor("minute"),
  };
}

export type NomeDoDia = { singular: string; plural: string };

/** O dia da semana de `momento` no fuso da casa, no singular e no plural. */
export function diaDaSemana(momento: Date, fuso: string): NomeDoDia {
  const p = partesNoFuso(momento, fuso);
  // O índice do dia da semana a partir da data de calendário local, sem deixar
  // o fuso do servidor interferir.
  const indice = new Date(Date.UTC(p.ano, p.mes - 1, p.dia)).getUTCDay();
  return DIAS[indice] ?? DIAS[0];
}

/** O dia do mês de `momento` no fuso da casa (9, 10, 31...). */
export function diaDoMes(momento: Date, fuso: string): number {
  return partesNoFuso(momento, fuso).dia;
}

/** O mês de `momento` no fuso da casa, por extenso ("outubro"). */
export function nomeDoMes(momento: Date, fuso: string): string {
  const p = partesNoFuso(momento, fuso);
  return MESES[p.mes - 1] ?? "";
}

/** A hora do relógio no fuso da casa, estilo "21h40". */
export function horaCurta(momento: Date, fuso: string): string {
  const p = partesNoFuso(momento, fuso);
  return `${p.hora}h${p.minuto}`;
}

/**
 * Parte de um `interval` do Postgres em texto ("04:20:00", "10 days 05:00:00")
 * em dias, horas e minutos. Devolve `null` quando não reconhece o formato.
 */
function parteDoIntervalo(
  intervalo: string
): { horas: number; minutos: string } | null {
  const dias = intervalo.match(/(\d+)\s+days?/);
  const relogio = intervalo.match(/(\d{1,3}):(\d{2})(?::(\d{2}))?/);
  if (!(dias || relogio)) return null;
  const totalDias = dias ? Number(dias[1]) : 0;
  const horas = relogio ? Number(relogio[1]) : 0;
  const minutos = relogio ? (relogio[2] ?? "00") : "00";
  return { horas: totalDias * 24 + horas, minutos };
}

/** Há quanto tempo a conta está aberta, estilo "4h20" (trata "N days"). */
export function duracaoDaConta(abertaHa: string): string {
  const parte = parteDoIntervalo(abertaHa);
  if (!parte) return abertaHa;
  return `${parte.horas}h${parte.minutos}`;
}

/** O limite de "conta esquecida" por extenso: "4h" ou "4h30". */
export function limiteEmTexto(limite: string): string {
  const parte = parteDoIntervalo(limite);
  if (!parte) return limite;
  return parte.minutos === "00"
    ? `${parte.horas}h`
    : `${parte.horas}h${parte.minutos}`;
}
