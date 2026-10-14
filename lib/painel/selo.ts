/**
 * Selo "atualizado há X min" do painel. Segue o ESTADO calculado pelo vigia
 * (D-53): na hora em que a casa abre, ele não fica vermelho por causa da
 * madrugada em que o computador do caixa estava desligado.
 */

const ESTADOS = [
  "aguardando",
  "em_dia",
  "atrasado",
  "parado",
  "fechado",
] as const;
export type EstadoSinal = (typeof ESTADOS)[number];

export type Selo = {
  tom: "ok" | "atencao" | "alerta" | "neutro";
  texto: string;
};

export function estadoDoSinal(
  valor: string | null | undefined
): EstadoSinal | null {
  return ESTADOS.find((estado) => estado === valor) ?? null;
}

export function tempoDesde(desde: Date, agora: Date): string {
  const minutos = Math.floor((agora.getTime() - desde.getTime()) / 60_000);
  if (minutos < 1) return "há menos de 1 min";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

function horaNoFuso(momento: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: fuso,
  }).format(momento);
}

export function seloDoSinal(e: {
  estado: EstadoSinal | null;
  ultimoEnvioOkEm: string | null;
  agora: Date;
  fuso: string;
}): Selo {
  const ultimo = e.ultimoEnvioOkEm ? new Date(e.ultimoEnvioOkEm) : null;
  switch (e.estado) {
    case "em_dia":
      return {
        tom: "ok",
        texto: ultimo
          ? `atualizado ${tempoDesde(ultimo, e.agora)}`
          : "atualizado",
      };
    case "atrasado":
      return {
        tom: "atencao",
        texto: ultimo
          ? `atrasado · últimos dados ${tempoDesde(ultimo, e.agora)}`
          : "atrasado",
      };
    case "parado":
      return {
        tom: "alerta",
        texto: ultimo
          ? `sem dados ${tempoDesde(ultimo, e.agora)}`
          : "sem dados",
      };
    case "fechado":
      return {
        tom: "neutro",
        texto: ultimo
          ? `fechado agora · últimos dados às ${horaNoFuso(ultimo, e.fuso)}`
          : "fechado agora",
      };
    default:
      return { tom: "neutro", texto: "aguardando o 1º envio" };
  }
}
