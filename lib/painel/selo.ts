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
  /** Frase completa: barra lateral do computador e leitor de tela. */
  texto: string;
  /**
   * Versão de uma linha só para o cabeçalho do celular (`● há 2 min`, como na
   * tela aprovada). Continua dizendo o estado: a cor nunca é o único canal.
   */
  textoCurto: string;
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

const UM_DIA_EM_MS = 24 * 60 * 60 * 1000;

/** Data do último envio, ou `null` se não existe ou não vira uma data válida. */
function lerUltimoEnvio(valor: string | null): Date | null {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * "HH:MM" no fuso da casa, ou `null` se o fuso não existe. O `Intl` LANÇA
 * `RangeError` num fuso inválido, e o selo mora no layout: um erro aqui
 * derrubaria todas as telas da casa por causa de um cadastro errado.
 */
function horaNoFuso(momento: Date, fuso: string): string | null {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: fuso,
    }).format(momento);
  } catch {
    return null;
  }
}

/**
 * Último dado de uma casa fechada. Até 24 h, "às 02:14" basta; passou disso,
 * a hora sem o dia engana (a casa pode estar fechada há dias), então diz
 * "há N dias". Fuso inválido também cai no texto relativo.
 */
function textoFechado(ultimo: Date, agora: Date, fuso: string): string {
  const relativo = `fechado agora · últimos dados ${tempoDesde(ultimo, agora)}`;
  if (agora.getTime() - ultimo.getTime() > UM_DIA_EM_MS) return relativo;
  const hora = horaNoFuso(ultimo, fuso);
  return hora ? `fechado agora · últimos dados às ${hora}` : relativo;
}

export function seloDoSinal(e: {
  estado: EstadoSinal | null;
  ultimoEnvioOkEm: string | null;
  agora: Date;
  fuso: string;
}): Selo {
  const ultimo = lerUltimoEnvio(e.ultimoEnvioOkEm);
  const tempo = ultimo ? tempoDesde(ultimo, e.agora) : null;
  switch (e.estado) {
    case "em_dia":
      return {
        tom: "ok",
        texto: tempo ? `atualizado ${tempo}` : "atualizado",
        textoCurto: tempo ?? "atualizado",
      };
    case "atrasado":
      return {
        tom: "atencao",
        texto: tempo ? `atrasado · últimos dados ${tempo}` : "atrasado",
        textoCurto: tempo ? `atrasado · ${tempo}` : "atrasado",
      };
    case "parado": {
      const texto = tempo ? `sem dados ${tempo}` : "sem dados";
      return { tom: "alerta", texto, textoCurto: texto };
    }
    case "fechado":
      return {
        tom: "neutro",
        texto: ultimo ? textoFechado(ultimo, e.agora, e.fuso) : "fechado agora",
        textoCurto: "fechado",
      };
    default:
      return {
        tom: "neutro",
        texto: "aguardando o 1º envio",
        textoCurto: "aguardando",
      };
  }
}

/**
 * Selo a partir do resultado da leitura do `sinal_de_vida`. Se a leitura falhou
 * (rede, tempo esgotado), não dá para saber se a casa já enviou: dizer
 * "aguardando o 1º envio" seria falso para quem envia há meses. Nesse caso o
 * selo é neutro e honesto, e o layout registra a falha.
 */
export function seloDaLeitura(e: {
  dados: { estado: string | null; ultimo_envio_ok_em: string | null } | null;
  erro: unknown;
  agora: Date;
  fuso: string;
}): Selo {
  if (e.erro) {
    return {
      tom: "neutro",
      texto: "sem leitura agora",
      textoCurto: "sem leitura",
    };
  }
  return seloDoSinal({
    estado: estadoDoSinal(e.dados?.estado),
    ultimoEnvioOkEm: e.dados?.ultimo_envio_ok_em ?? null,
    agora: e.agora,
    fuso: e.fuso,
  });
}
