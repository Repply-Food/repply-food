import { FUSO_PADRAO } from "./fusos";

/**
 * Datas e horas no fuso da CASA (CLAUDE.md §5), nunca no do servidor nem no
 * do navegador. Fuso inválido não derruba a tela: cai no fuso padrão.
 */
type Partes = {
  ano: string;
  mes: string;
  dia: string;
  hora: string;
  minuto: string;
};

function partes(momento: Date, fuso: string): Partes {
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
    ano: valor("year"),
    mes: valor("month"),
    dia: valor("day"),
    hora: valor("hour"),
    minuto: valor("minute"),
  };
}

function lerMomento(iso: string | null): Date | null {
  if (!iso) return null;
  const momento = new Date(iso);
  return Number.isNaN(momento.getTime()) ? null : momento;
}

export function hojeNaCasa(agora: Date, fuso: string): string {
  const p = partes(agora, fuso);
  return `${p.ano}-${p.mes}-${p.dia}`;
}

export function horaNaCasa(iso: string, fuso: string): string {
  const momento = lerMomento(iso);
  if (!momento) return "—";
  const p = partes(momento, fuso);
  return `${p.hora}:${p.minuto}`;
}

export function dataCurtaNaCasa(iso: string, fuso: string): string {
  const momento = lerMomento(iso);
  if (!momento) return "—";
  const p = partes(momento, fuso);
  return `${p.dia}/${p.mes}`;
}

export function dataEHoraNaCasa(iso: string, fuso: string): string {
  const momento = lerMomento(iso);
  if (!momento) return "—";
  const p = partes(momento, fuso);
  return `${p.dia}/${p.mes} ${p.hora}:${p.minuto}`;
}

/** "hoje 21:03", "ontem 22:10", "02/10 12:00", "31/12/2025 12:00" ou "—". */
export function momentoNaCasa(
  iso: string | null,
  agora: Date,
  fuso: string
): string {
  const momento = lerMomento(iso);
  if (!momento) return "—";
  const p = partes(momento, fuso);
  const dia = `${p.ano}-${p.mes}-${p.dia}`;
  const hora = `${p.hora}:${p.minuto}`;
  if (dia === hojeNaCasa(agora, fuso)) return `hoje ${hora}`;
  if (dia === hojeNaCasa(new Date(agora.getTime() - 86_400_000), fuso)) {
    return `ontem ${hora}`;
  }
  if (p.ano === partes(agora, fuso).ano) return `${p.dia}/${p.mes} ${hora}`;
  return `${p.dia}/${p.mes}/${p.ano} ${hora}`;
}

/** "2026-10-01" → "01/10/2026". */
export function dataBr(dia: string): string {
  const [ano, mes, d] = dia.split("-");
  return `${d}/${mes}/${ano}`;
}

/** "2026-10-01" → "01/10". */
export function diaCurto(dia: string): string {
  const [, mes, d] = dia.split("-");
  return `${d}/${mes}`;
}

export function diaValido(dia: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const data = new Date(`${dia}T00:00:00Z`);
  return (
    !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === dia
  );
}

export function somarDias(dia: string, n: number): string {
  const data = new Date(`${dia}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + n);
  return data.toISOString().slice(0, 10);
}
