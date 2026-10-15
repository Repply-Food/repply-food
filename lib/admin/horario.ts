import { z } from "zod";

/**
 * Horário de funcionamento (D-56). No banco: lista de { dia (0 = domingo),
 * abre, fecha } em "HH:MM"; até dois por dia; fecha < abre quer dizer que passa
 * da meia-noite, e só o último do dia pode passar. A mesma regra está em
 * `horario_funcionamento_valido` (migration 20261015120000), e
 * `tests/admin/espelho-do-banco.test.ts` compara as duas.
 */
export type Intervalo = { dia: number; abre: string; fecha: string };
export type ModoDoDia = "fechado" | "um" | "dois";
export type DiaDoFormulario = {
  modo: ModoDoDia;
  abre1: string;
  fecha1: string;
  abre2: string;
  fecha2: string;
};

/** Índice = dia (0 = domingo), na ordem do formulário: domingo a sábado. */
export const DIAS_DA_SEMANA: readonly {
  dia: number;
  curto: string;
  longo: string;
}[] = [
  { dia: 0, curto: "dom", longo: "Domingo" },
  { dia: 1, curto: "seg", longo: "Segunda" },
  { dia: 2, curto: "ter", longo: "Terça" },
  { dia: 3, curto: "qua", longo: "Quarta" },
  { dia: 4, curto: "qui", longo: "Quinta" },
  { dia: 5, curto: "sex", longo: "Sexta" },
  { dia: 6, curto: "sáb", longo: "Sábado" },
];

/** Horas já preenchidas para quando o dia passa a abrir (valem nos dois modos). */
export const DIA_FECHADO: DiaDoFormulario = {
  modo: "fechado",
  abre1: "11:00",
  fecha1: "15:00",
  abre2: "18:00",
  fecha2: "23:00",
};

const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
/** O resumo lê a semana a partir da segunda ("ter–dom"). */
const ORDEM_DO_RESUMO = [1, 2, 3, 4, 5, 6, 0];

/** Para ler o que veio do banco; o que não passar vira lista vazia. */
export const intervalosSchema = z.array(
  z
    .object({
      dia: z.number().int().min(0).max(6),
      abre: z.string().regex(HORA),
      fecha: z.string().regex(HORA),
    })
    .strict()
);

function porAbertura(a: Intervalo, b: Intervalo): number {
  if (a.abre === b.abre) return 0;
  return a.abre < b.abre ? -1 : 1;
}

/** `null` quando o banco aceitaria; senão, a frase para a tela. */
export function problemaNosIntervalos(
  intervalos: readonly Intervalo[]
): string | null {
  for (const intervalo of intervalos) {
    if (
      !Number.isInteger(intervalo.dia) ||
      intervalo.dia < 0 ||
      intervalo.dia > 6
    ) {
      return "Dia da semana inválido.";
    }
    if (!HORA.test(intervalo.abre) || !HORA.test(intervalo.fecha)) {
      return "Use horas no formato 00:00.";
    }
    if (intervalo.abre === intervalo.fecha) {
      return "O horário de fechar não pode ser igual ao de abrir.";
    }
  }
  for (let dia = 0; dia <= 6; dia++) {
    const doDia = intervalos.filter((i) => i.dia === dia).sort(porAbertura);
    if (doDia.length > 2) return "No máximo dois horários por dia.";
    const [primeiro, segundo] = doDia;
    if (primeiro && segundo) {
      if (primeiro.fecha < primeiro.abre) {
        return "Só o último horário do dia pode passar da meia-noite.";
      }
      if (segundo.abre < primeiro.fecha) {
        return "Os dois horários do mesmo dia não podem se sobrepor.";
      }
    }
  }
  return null;
}

export function intervalosDoDia(dia: number, d: DiaDoFormulario): Intervalo[] {
  if (d.modo === "fechado") return [];
  const primeiro = { dia, abre: d.abre1, fecha: d.fecha1 };
  if (d.modo === "um") return [primeiro];
  return [primeiro, { dia, abre: d.abre2, fecha: d.fecha2 }];
}

export function problemaNoDia(d: DiaDoFormulario): string | null {
  if (d.modo === "fechado") return null;
  const campos =
    d.modo === "um"
      ? [d.abre1, d.fecha1]
      : [d.abre1, d.fecha1, d.abre2, d.fecha2];
  if (campos.some((campo) => campo === "")) {
    return "Preencha a hora de abrir e a de fechar.";
  }
  return problemaNosIntervalos(intervalosDoDia(0, d));
}

/** `dias` tem 7 posições; o índice é o dia (0 = domingo). */
export function intervalosDoFormulario(
  dias: readonly DiaDoFormulario[]
): Intervalo[] {
  return dias.flatMap((d, dia) => intervalosDoDia(dia, d));
}

export function formularioDosIntervalos(
  intervalos: readonly Intervalo[]
): DiaDoFormulario[] {
  return DIAS_DA_SEMANA.map(({ dia }): DiaDoFormulario => {
    const [primeiro, segundo] = intervalos
      .filter((i) => i.dia === dia)
      .sort(porAbertura);
    if (!primeiro) return { ...DIA_FECHADO };
    if (!segundo) {
      return {
        ...DIA_FECHADO,
        modo: "um",
        abre1: primeiro.abre,
        fecha1: primeiro.fecha,
      };
    }
    return {
      modo: "dois",
      abre1: primeiro.abre,
      fecha1: primeiro.fecha,
      abre2: segundo.abre,
      fecha2: segundo.fecha,
    };
  });
}

export function formatarHora(hhmm: string): string {
  const [hora = "0", minuto = "00"] = hhmm.split(":");
  const h = String(Number(hora));
  return minuto === "00" ? `${h}h` : `${h}h${minuto}`;
}

function horasDoDia(doDia: readonly Intervalo[]): string {
  return [...doDia]
    .sort(porAbertura)
    .map((i) => `${formatarHora(i.abre)}–${formatarHora(i.fecha)}`)
    .join(" e ");
}

/** Ex.: "ter–dom · 11h–15h e 18h–2h"; grupos diferentes separados por "; ". */
export function resumoDoHorario(intervalos: readonly Intervalo[]): string {
  if (intervalos.length === 0) return "sem horário cadastrado";
  const grupos: { dias: number[]; horas: string }[] = [];
  let anteriorAberto = false;
  for (const dia of ORDEM_DO_RESUMO) {
    const doDia = intervalos.filter((i) => i.dia === dia);
    if (doDia.length === 0) {
      anteriorAberto = false;
      continue;
    }
    const horas = horasDoDia(doDia);
    const ultimo = grupos.at(-1);
    if (anteriorAberto && ultimo && ultimo.horas === horas)
      ultimo.dias.push(dia);
    else grupos.push({ dias: [dia], horas });
    anteriorAberto = true;
  }
  const nome = (dia: number) => DIAS_DA_SEMANA[dia]?.curto ?? "";
  return grupos
    .map(({ dias, horas }) => {
      const primeiro = dias[0] ?? 0;
      const ultimo = dias.at(-1) ?? primeiro;
      const quando =
        dias.length === 1
          ? nome(primeiro)
          : `${nome(primeiro)}–${nome(ultimo)}`;
      return `${quando} · ${horas}`;
    })
    .join("; ");
}
