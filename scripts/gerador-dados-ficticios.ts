import Decimal from "decimal.js";

/**
 * Gerador de dados fictícios (recepcao-de-dados.md §5).
 *
 * Simula o SCC enquanto a integração real não existe: gera meses de entradas
 * realistas (almoço e jantar, pico de sexta e sábado, mesas abertas agora,
 * contas esquecidas, descontos e garçons) e envia pelo MESMO caminho HTTP do
 * sistema real (`receber-envio`), com o token de um restaurante de teste.
 *
 * Uso:
 *   SCC_TOKEN=rf_... npm run gerador [-- opções]
 *
 * Opções:
 *   --historico-dias <n>  dias de histórico na carga inicial (padrão 75)
 *   --intervalo <s>       segundos entre ciclos (padrão 300; o servidor
 *                         responde 429 abaixo de 20 s)
 *   --parar-apos <n>      para de enviar depois de n ciclos com 200 —
 *                         demonstra o alarme de "parado"
 *   --dry-run             monta e valida os envelopes, sem enviar nada
 *   --fuso <IANA>         fuso do restaurante (ou SCC_FUSO); obrigatório no
 *                         envio real, fictício America/Fortaleza no dry-run
 */
import { type Envelope, validarEnvelope } from "../lib/validators/recepcao.ts";

const FATOR_DIA = [0.7, 0.8, 0.9, 1.0, 1.1, 1.6, 1.8]; // dom..sáb
const GARCONS = [1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 7, 8];

export interface Config {
  url: string;
  token: string;
  historicoDias: number;
  intervaloSegundos: number;
  pararApos: number;
  dryRun: boolean;
  fusoHorario: string;
}

interface EntradaGerada {
  codEntrada: number;
  codCartaoMesa: number;
  DataEntrada: string;
  HoraEntrada: string;
  DataSaida: string | null;
  HoraSaida: string | null;
  ValorItens: Decimal;
  ValorDescontos: Decimal;
  ValorAcrescimos: Decimal;
  TaxaServico: Decimal;
  Complemento: Decimal;
  ValorConsumido: Decimal;
  Pago: "Sim" | "Não";
  CodGarcon: number;
  codOperadorHab: number;
  codOperadorDesab: number;
  codCliente: number | null;
  NumeroOcupantes: number;
  TipoOcupacao: "MESA" | "BALCAO";
  TipoCartao: string;
  /** Estado interno do simulador (não vai no envelope). */
  aberta: boolean;
  abertaDesde: Date;
}

interface ResultadoJanela {
  ok: boolean;
  confirmada: string | null;
  reenviar: string | null;
  resumo: string;
}

interface Corpo200 {
  recebidas?: number;
  gravadas?: number;
  inalteradas?: number;
  removidas?: number;
  janela_confirmada?: { desde?: string; ate?: string };
  reenviar_desde?: string | null;
}

// ---------------------------------------------------------------------------
// Utilitários de data e número
// ---------------------------------------------------------------------------

function formatarData(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarHora(data: Date): string {
  const h = String(data.getUTCHours()).padStart(2, "0");
  const m = String(data.getUTCMinutes()).padStart(2, "0");
  const s = String(data.getUTCSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatarEnviadoEm(data: Date): string {
  return `${formatarData(data)}T${formatarHora(data)}`;
}

/** Data civil codificada em UTC, não um instante: o núcleo só usa getters UTC. */
export function dataCivilNoFuso(instante: Date, fusoHorario: string): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fusoHorario,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(partes.find((item) => item.type === tipo)?.value);
  return new Date(
    Date.UTC(
      parte("year"),
      parte("month") - 1,
      parte("day"),
      parte("hour"),
      parte("minute"),
      parte("second")
    )
  );
}

function parseDataLocal(valor: string): Date {
  const partes = valor.split("-");
  const ano = Number(partes[0]);
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function somarDias(data: Date, dias: number): Date {
  const resultado = new Date(data);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado;
}

function somarMinutos(data: Date, minutos: number): Date {
  return new Date(data.getTime() + minutos * 60_000);
}

function somarDiasStr(valor: string, dias: number): string {
  return formatarData(somarDias(parseDataLocal(valor), dias));
}

function diaSeguinte(valor: string): string {
  return somarDiasStr(valor, 1);
}

function diasEntre(desde: string, ate: string): number {
  return Math.round(
    (parseDataLocal(ate).getTime() - parseDataLocal(desde).getTime()) /
      86_400_000
  );
}

function menor(a: string, b: string): string {
  return a <= b ? a : b;
}

function maior(a: string, b: string): string {
  return a >= b ? a : b;
}

function arredondar(valor: Decimal.Value): Decimal {
  return new Decimal(valor).toDecimalPlaces(2);
}

export function calcularValoresMonetarios(
  itens: Decimal.Value,
  descontos: Decimal.Value,
  acrescimos: Decimal.Value,
  taxaServico: Decimal.Value,
  complemento: Decimal.Value
): {
  itens: Decimal;
  descontos: Decimal;
  acrescimos: Decimal;
  taxaServico: Decimal;
  complemento: Decimal;
  consumido: Decimal;
} {
  const valores = {
    itens: arredondar(itens),
    descontos: arredondar(descontos),
    acrescimos: arredondar(acrescimos),
    taxaServico: arredondar(taxaServico),
    complemento: arredondar(complemento),
  };
  return {
    ...valores,
    consumido: valores.itens
      .minus(valores.descontos)
      .plus(valores.acrescimos)
      .plus(valores.taxaServico)
      .plus(valores.complemento)
      .toDecimalPlaces(2),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

function curto(valor: unknown): string {
  const texto = JSON.stringify(valor);
  if (!texto) {
    return "(vazio)";
  }
  return texto.length > 200 ? `${texto.slice(0, 200)}…` : texto;
}

/** Sorteia um item de uma lista (a lista nunca é vazia). */
function sortearDe<T>(opcoes: readonly T[]): T {
  const indice = Math.floor(Math.random() * opcoes.length);
  return opcoes[indice] as T;
}

function sortearOcupantes(): number {
  const sorteio = Math.random();
  if (sorteio < 0.25) {
    return 1;
  }
  if (sorteio < 0.65) {
    return 2;
  }
  if (sorteio < 0.85) {
    return 3;
  }
  if (sorteio < 0.95) {
    return 4;
  }
  return 5;
}

export function sortearAbertura(dia: Date, turno: "almoço" | "jantar"): Date {
  const inicioDoDia = new Date(
    Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate())
  );
  if (turno === "almoço") {
    // 60% no pico 12h-13h; o resto espalhado entre 11h30 e 14h30.
    if (Math.random() < 0.6) {
      return somarMinutos(inicioDoDia, 12 * 60 + Math.random() * 60);
    }
    return somarMinutos(inicioDoDia, 11 * 60 + 30 + Math.random() * 180);
  }
  // Jantar: 5% abrem tarde (22h30-23h15), para fechar depois da meia-noite
  // (virada do dia, testada no §4).
  if (Math.random() < 0.05) {
    return somarMinutos(inicioDoDia, 22 * 60 + 30 + Math.random() * 45);
  }
  return somarMinutos(inicioDoDia, 18 * 60 + Math.random() * 300);
}

// ---------------------------------------------------------------------------
// Mundo: estado do restaurante simulado
// ---------------------------------------------------------------------------

export class Mundo {
  private entradas: EntradaGerada[] = [];

  private proximoCod = 100_000 + Math.floor(Math.random() * 50_000);

  constructor(
    private readonly sortearTicket: () => Decimal = () =>
      new Decimal(28).plus(new Decimal(Math.random()).mul(47))
  ) {}

  /**
   * Gera o histórico de `diaInicial` até `hoje`, seguindo o perfil do dia
   * (almoço e jantar, pico de sexta e sábado, contas esquecidas).
   */
  gerarHistorico(diaInicial: Date, hoje: Date): void {
    let dia = new Date(
      Date.UTC(
        diaInicial.getUTCFullYear(),
        diaInicial.getUTCMonth(),
        diaInicial.getUTCDate()
      )
    );
    while (dia <= hoje) {
      const fator = FATOR_DIA[dia.getUTCDay()] ?? 1;
      const almoço = Math.round(18 * fator);
      const jantar = Math.round(26 * fator);
      for (let i = 0; i < almoço; i++) {
        const entrada = this.criarEntrada(
          sortearAbertura(dia, "almoço"),
          35 + Math.floor(Math.random() * 40),
          hoje
        );
        if (entrada) this.entradas.push(entrada);
      }
      for (let i = 0; i < jantar; i++) {
        const entrada = this.criarEntrada(
          sortearAbertura(dia, "jantar"),
          45 + Math.floor(Math.random() * 65),
          hoje
        );
        if (entrada) this.entradas.push(entrada);
      }
      // ~35% dos dias têm uma conta esquecida aberta.
      if (Math.random() < 0.35) {
        const inicioDoDia = new Date(
          Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate())
        );
        const abertura = somarMinutos(
          inicioDoDia,
          11 * 60 + 30 + Math.random() * 600
        );
        const entrada = this.criarEntrada(abertura, null, hoje);
        if (entrada) this.entradas.push(entrada);
      }
      dia = somarDias(dia, 1);
    }
  }

  /** Evolui o mundo num ciclo: fecha mesas e abre novas, conforme a hora. */
  evoluir(agora: Date): void {
    for (const entrada of this.entradas) {
      if (!entrada.aberta) {
        continue;
      }
      const minutosAberta =
        (agora.getTime() - entrada.abertaDesde.getTime()) / 60_000;
      if (minutosAberta >= 30 && Math.random() < 0.25) {
        entrada.DataSaida = formatarData(agora);
        entrada.HoraSaida = formatarHora(agora);
        entrada.Pago = "Sim";
        entrada.aberta = false;
      }
    }
    const hora = agora.getUTCHours();
    let novas = 0;
    if (hora >= 11 && hora < 15) {
      novas = Math.random() < 0.5 ? 1 : 2;
    } else if (hora >= 17 && hora < 23) {
      novas = Math.random() < 0.5 ? 1 : Math.random() < 0.7 ? 2 : 3;
    }
    for (let i = 0; i < novas; i++) {
      const entrada = this.criarEntrada(agora, null);
      if (entrada) this.entradas.push(entrada);
    }
  }

  /**
   * Janela completa (contrato §6): todas as abertas + as com DataEntrada ou
   * DataSaida dentro de [desde, ate]. Comparação de strings ISO funciona.
   */
  entradasJanela(desde: string, ate: string): EntradaGerada[] {
    return this.entradas.filter(
      (entrada) =>
        entrada.aberta ||
        (entrada.DataEntrada >= desde && entrada.DataEntrada <= ate) ||
        (entrada.DataSaida !== null &&
          entrada.DataSaida >= desde &&
          entrada.DataSaida <= ate)
    );
  }

  private criarEntrada(
    abertura: Date,
    duracaoMinutos: number | null,
    referencia?: Date
  ): EntradaGerada | null {
    if (referencia && abertura > referencia) return null;
    const fechamentoCalculado =
      duracaoMinutos === null ? null : somarMinutos(abertura, duracaoMinutos);
    const fechamento =
      fechamentoCalculado && (!referencia || fechamentoCalculado <= referencia)
        ? fechamentoCalculado
        : null;
    const ocupantes = sortearOcupantes();
    const itens = arredondar(new Decimal(ocupantes).mul(this.sortearTicket()));
    const temDesconto = Math.random() < 0.12;
    const descontos = temDesconto
      ? arredondar(
          itens.mul(
            new Decimal(0.05).plus(new Decimal(Math.random()).mul(0.15))
          )
        )
      : new Decimal(0);
    const temAcrescimo = Math.random() < 0.05;
    const acrescimos = temAcrescimo
      ? arredondar(
          itens
            .minus(descontos)
            .mul(new Decimal(0.01).plus(new Decimal(Math.random()).mul(0.02)))
        )
      : new Decimal(0);
    // Taxa de serviço sobre o consumo (exemplo do contrato: 90 - 10 + 8 = 88).
    const taxa = arredondar(itens.minus(descontos).mul(0.1));
    const temComplemento = Math.random() < 0.2;
    const complemento = temComplemento
      ? arredondar(new Decimal(4).plus(new Decimal(Math.random()).mul(11)))
      : new Decimal(0);
    const valores = calcularValoresMonetarios(
      itens,
      descontos,
      acrescimos,
      taxa,
      complemento
    );
    const temCliente = Math.random() < 0.3;
    return {
      codEntrada: this.proximoCod++,
      codCartaoMesa: 1 + Math.floor(Math.random() * 40),
      DataEntrada: formatarData(abertura),
      HoraEntrada: formatarHora(abertura),
      DataSaida: fechamento ? formatarData(fechamento) : null,
      HoraSaida: fechamento ? formatarHora(fechamento) : null,
      ValorItens: valores.itens,
      ValorDescontos: valores.descontos,
      ValorAcrescimos: valores.acrescimos,
      TaxaServico: valores.taxaServico,
      Complemento: valores.complemento,
      ValorConsumido: valores.consumido,
      Pago: fechamento ? "Sim" : "Não",
      CodGarcon: sortearDe(GARCONS),
      codOperadorHab: 1,
      codOperadorDesab: 1,
      codCliente: temCliente ? 1000 + Math.floor(Math.random() * 1000) : null,
      NumeroOcupantes: ocupantes,
      TipoOcupacao: Math.random() < 0.85 ? "MESA" : "BALCAO",
      TipoCartao: "",
      aberta: fechamento === null,
      abertaDesde: abertura,
    };
  }

  get total(): number {
    return this.entradas.length;
  }
}

// ---------------------------------------------------------------------------
// Envelope e envio
// ---------------------------------------------------------------------------

export function montarEnvelope(
  desde: string,
  ate: string,
  entradas: EntradaGerada[],
  enviadoEm: Date
): Envelope {
  return {
    versao_formato: 1,
    versao_scc: "9.0.0-ficticio",
    enviado_em: formatarEnviadoEm(enviadoEm),
    modo: "janela",
    janela: { desde, ate },
    lote: { numero: 1, total: 1 },
    entradas: entradas.map((entrada) => ({
      codEntrada: entrada.codEntrada,
      codCartaoMesa: entrada.codCartaoMesa,
      DataEntrada: entrada.DataEntrada,
      HoraEntrada: entrada.HoraEntrada,
      DataSaida: entrada.DataSaida,
      HoraSaida: entrada.HoraSaida,
      ValorItens: entrada.ValorItens.toNumber(),
      ValorDescontos: entrada.ValorDescontos.toNumber(),
      ValorAcrescimos: entrada.ValorAcrescimos.toNumber(),
      TaxaServico: entrada.TaxaServico.toNumber(),
      Complemento: entrada.Complemento.toNumber(),
      ValorConsumido: entrada.ValorConsumido.toNumber(),
      Pago: entrada.Pago,
      CodGarcon: entrada.CodGarcon,
      codOperadorHab: entrada.codOperadorHab,
      codOperadorDesab: entrada.codOperadorDesab,
      codCliente: entrada.codCliente,
      NumeroOcupantes: entrada.NumeroOcupantes,
      TipoOcupacao: entrada.TipoOcupacao,
      TipoCartao: entrada.TipoCartao,
    })),
  };
}

/** O gerador só produz envelopes válidos; falhar aqui é bug do gerador. */
export function validarGerado(envelope: Envelope): void {
  const resultado = validarEnvelope(envelope);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((problema) => `${problema.path.join(".")}: ${problema.message}`)
      .join("; ");
    throw new Error(
      `envelope do gerador inválido (bug do gerador): ${problemas}`
    );
  }
}

interface RespostaEnvio {
  status: number;
  corpo: unknown;
}

export interface AmbienteGerador {
  /** Instante para o ritmo: não deve saltar junto com a hora civil do fuso. */
  agoraEmMs?(): number;
  agora(): Date;
  aguardar(ms: number): Promise<void>;
  enviar(envelope: Envelope, config: Config): Promise<RespostaEnvio>;
}

export interface ControleRitmo {
  ultimaTentativaEm: number | null;
}

export function criarControleRitmo(): ControleRitmo {
  return { ultimaTentativaEm: null };
}

async function enviarEnvelope(
  config: Config,
  envelope: Envelope
): Promise<RespostaEnvio> {
  try {
    const resposta = await fetch(config.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(30_000), // contrato §3: 10 s pra conectar, 30 s pra responder
    });
    const texto = await resposta.text();
    let corpo: unknown = null;
    try {
      corpo = JSON.parse(texto);
    } catch {
      // corpo fora do JSON (ex.: 5xx genérico): segue com status apenas.
    }
    return { status: resposta.status, corpo };
  } catch (erro) {
    return {
      status: 0,
      corpo: erro instanceof Error ? erro.message : String(erro),
    };
  }
}

function criarAmbientePadrao(fusoHorario: string): AmbienteGerador {
  return {
    agora: () => dataCivilNoFuso(new Date(), fusoHorario),
    agoraEmMs: () => Date.now(),
    aguardar: sleep,
    enviar: (envelope, config) => enviarEnvelope(config, envelope),
  };
}

async function enviarComRitmo(
  config: Config,
  envelope: Envelope,
  ambiente: AmbienteGerador,
  ritmo: ControleRitmo
): Promise<RespostaEnvio> {
  const agoraEmMs = () => ambiente.agoraEmMs?.() ?? ambiente.agora().getTime();
  const minimo = Math.max(20_000, config.intervaloSegundos * 1000);
  if (ritmo.ultimaTentativaEm !== null) {
    const decorrido = agoraEmMs() - ritmo.ultimaTentativaEm;
    await ambiente.aguardar(Math.max(0, minimo - decorrido));
  }
  ritmo.ultimaTentativaEm = agoraEmMs();
  return ambiente.enviar(envelope, config);
}

function corpoJson(corpo: unknown): Corpo200 | null {
  if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) {
    return null;
  }
  return corpo as Corpo200;
}

/**
 * Envia uma janela. 413 divide a janela ao meio (contrato §8); outros erros
 * devolvem ok=false e o chamador repete no próximo ciclo, sem mexer na data
 * confirmada (contrato §6).
 */
export async function enviarJanela(
  config: Config,
  mundo: Mundo,
  desde: string,
  ate: string,
  ambiente: AmbienteGerador = criarAmbientePadrao(config.fusoHorario),
  ritmo: ControleRitmo = criarControleRitmo()
): Promise<ResultadoJanela> {
  const envelope = montarEnvelope(
    desde,
    ate,
    mundo.entradasJanela(desde, ate),
    ambiente.agora()
  );
  validarGerado(envelope);
  const resposta = await enviarComRitmo(config, envelope, ambiente, ritmo);

  if (resposta.status === 200) {
    const corpo = corpoJson(resposta.corpo);
    const confirmada = corpo?.janela_confirmada?.ate ?? ate;
    return {
      ok: true,
      confirmada,
      reenviar: corpo?.reenviar_desde ?? null,
      resumo: `recebidas=${corpo?.recebidas ?? envelope.entradas.length} gravadas=${corpo?.gravadas ?? 0} inalteradas=${corpo?.inalteradas ?? 0} removidas=${corpo?.removidas ?? 0}`,
    };
  }

  if (resposta.status === 413 && desde !== ate) {
    const meio = somarDiasStr(desde, Math.floor(diasEntre(desde, ate) / 2));
    const metade1 = await enviarJanela(
      config,
      mundo,
      desde,
      meio,
      ambiente,
      ritmo
    );
    if (!metade1.ok) {
      return {
        ok: false,
        confirmada: null,
        reenviar: null,
        resumo: "413: primeira metade falhou",
      };
    }
    const metade2 = await enviarJanela(
      config,
      mundo,
      diaSeguinte(meio),
      ate,
      ambiente,
      ritmo
    );
    if (!metade2.ok) {
      return {
        ok: false,
        confirmada: null,
        reenviar: null,
        resumo: "413: dividiu a janela; uma das metades falhou",
      };
    }
    return {
      ok: true,
      confirmada: metade2.confirmada ?? ate,
      reenviar: metade1.reenviar ?? metade2.reenviar,
      resumo: "413: janela dividida ao meio, as duas metades ok",
    };
  }

  const falha =
    resposta.status === 0 ? "sem resposta (rede)" : `status ${resposta.status}`;
  return {
    ok: false,
    confirmada: null,
    reenviar: null,
    resumo: `${falha}: ${curto(resposta.corpo)}`,
  };
}

/**
 * Carga em janelas de 7 dias, da data `desde` até `ateFinal` (contrato §8):
 * só avança para a próxima depois do 200 da anterior. Devolve a última data
 * confirmada pelo servidor.
 */
export async function carregarDe(
  config: Config,
  mundo: Mundo,
  desde: string,
  ateFinal: string,
  ambiente: AmbienteGerador = criarAmbientePadrao(config.fusoHorario),
  ritmo: ControleRitmo = criarControleRitmo()
): Promise<string> {
  let atual = desde;
  let limite = ateFinal;
  let confirmada = "";
  // Cargas até hoje acompanham a virada; cargas de período fixo continuam fixas.
  const acompanharHoje = ateFinal === formatarData(ambiente.agora());
  while (true) {
    if (acompanharHoje) limite = maior(limite, formatarData(ambiente.agora()));
    if (atual > limite) break;
    const fim = menor(somarDiasStr(atual, 6), limite);
    const resultado = await enviarJanela(
      config,
      mundo,
      atual,
      fim,
      ambiente,
      ritmo
    );
    if (!resultado.ok) {
      console.error(
        `[gerador] carga: ${resultado.resumo}; repete a janela ${atual}..${fim}`
      );
      await ambiente.aguardar(
        Math.max(20_000, config.intervaloSegundos * 1000)
      );
      continue;
    }
    confirmada = resultado.confirmada ?? fim;
    if (resultado.reenviar) {
      console.log(
        `[gerador] carga: reenvio pedido desde ${resultado.reenviar}`
      );
      atual = resultado.reenviar;
      continue;
    }
    console.log(
      `[gerador] carga: janela ${atual}..${fim} ok (${resultado.resumo})`
    );
    atual = diaSeguinte(fim);
  }
  return confirmada;
}

export class Gerador {
  private ultimaConfirmada = "";
  private ultimaVarreduraDiaria = "";
  private janelaPendente: {
    desde: string;
    ate: string;
    varreduraDiaria: boolean;
  } | null = null;
  private readonly ritmo: ControleRitmo;

  constructor(
    private readonly config: Config,
    private readonly mundo: Mundo,
    private readonly ambiente: AmbienteGerador = criarAmbientePadrao(
      config.fusoHorario
    ),
    ultimaConfirmada = "",
    ritmo: ControleRitmo = criarControleRitmo()
  ) {
    this.ultimaConfirmada = ultimaConfirmada;
    this.ritmo = ritmo;
  }

  async executarCiclo(): Promise<ResultadoJanela> {
    const agora = this.ambiente.agora();
    const hoje = formatarData(agora);
    this.mundo.evoluir(agora);
    if (!this.ultimaConfirmada)
      this.ultimaConfirmada = formatarData(somarDias(agora, -1));
    const pendente = this.janelaPendente;
    const varreduraDiaria =
      agora.getUTCHours() >= 6 && this.ultimaVarreduraDiaria !== hoje;
    const desdeSolicitado = varreduraDiaria
      ? formatarData(somarDias(agora, -7))
      : menor(this.ultimaConfirmada, formatarData(somarDias(agora, -1)));
    const desde = pendente
      ? menor(pendente.desde, desdeSolicitado)
      : desdeSolicitado;
    const ate = pendente ? maior(pendente.ate, hoje) : hoje;
    const cobriuVarredura =
      (pendente?.varreduraDiaria ?? false) || varreduraDiaria;
    const resultado = await enviarJanela(
      this.config,
      this.mundo,
      desde,
      ate,
      this.ambiente,
      this.ritmo
    );
    if (!resultado.ok) {
      this.janelaPendente = {
        desde,
        ate,
        varreduraDiaria: cobriuVarredura,
      };
      return resultado;
    }
    this.ultimaConfirmada = resultado.confirmada ?? ate;
    if (cobriuVarredura && this.ultimaConfirmada >= hoje)
      this.ultimaVarreduraDiaria = hoje;
    this.janelaPendente = null;
    if (resultado.reenviar) {
      this.ultimaConfirmada = await carregarDe(
        this.config,
        this.mundo,
        resultado.reenviar,
        hoje,
        this.ambiente,
        this.ritmo
      );
    }
    return resultado;
  }
}

// ---------------------------------------------------------------------------
// Configuração e orquestração
// ---------------------------------------------------------------------------

export function lerConfig(argv: string[]): Config {
  const flag = (nome: string): string | undefined => {
    const posicao = argv.indexOf(`--${nome}`);
    return posicao >= 0 ? argv[posicao + 1] : undefined;
  };
  const dryRun = argv.includes("--dry-run");
  const fusoHorario =
    flag("fuso") ?? process.env.SCC_FUSO ?? (dryRun ? "America/Fortaleza" : "");
  if (!fusoHorario)
    throw new Error("Defina --fuso IANA ou SCC_FUSO para envio real");
  try {
    Intl.DateTimeFormat(undefined, { timeZone: fusoHorario });
  } catch {
    throw new Error("Fuso IANA inválido para o restaurante");
  }
  return {
    url:
      process.env.SCC_URL ??
      "http://127.0.0.1:54321/functions/v1/receber-envio",
    token: process.env.SCC_TOKEN ?? "",
    historicoDias: Number(flag("historico-dias")) || 75,
    intervaloSegundos: Number(flag("intervalo")) || 300,
    pararApos: Number(flag("parar-apos")) || 0,
    dryRun,
    fusoHorario,
  };
}

async function main(): Promise<void> {
  const config = lerConfig(process.argv.slice(2));
  if (config.intervaloSegundos < 20) {
    console.warn(
      "[gerador] aviso: o servidor responde 429 para envios a menos de 20 s de distância"
    );
  }

  const ambiente = criarAmbientePadrao(config.fusoHorario);
  const hoje = ambiente.agora();
  const mundo = new Mundo();
  const diaInicial = somarDias(hoje, -(config.historicoDias - 1));
  mundo.gerarHistorico(diaInicial, hoje);

  if (config.dryRun) {
    const hojeS = formatarData(hoje);
    const inicioS = formatarData(diaInicial);
    const fimPrimeiraJanela = menor(somarDiasStr(inicioS, 6), hojeS);
    validarGerado(
      montarEnvelope(
        inicioS,
        fimPrimeiraJanela,
        mundo.entradasJanela(inicioS, fimPrimeiraJanela),
        hoje
      )
    );
    const janelaHoje = montarEnvelope(
      menor(formatarData(somarDias(hoje, -1)), hojeS),
      hojeS,
      mundo.entradasJanela(
        menor(formatarData(somarDias(hoje, -1)), hojeS),
        hojeS
      ),
      hoje
    );
    validarGerado(janelaHoje);
    console.log(
      `[gerador] dry-run OK (fuso ${config.fusoHorario}): ${mundo.total} entradas no histórico; janela de hoje com ${janelaHoje.entradas.length} entradas; envelopes válidos`
    );
    process.exit(0);
  }

  if (!config.token) {
    console.error(
      "[gerador] Defina SCC_TOKEN com o token de um restaurante de teste (criado no admin)."
    );
    process.exit(1);
  }

  const inicioS = formatarData(diaInicial);
  const hojeS = formatarData(hoje);
  console.log(
    `[gerador] carga inicial de ${inicioS} até ${hojeS}, em janelas de 7 dias`
  );
  const ritmo = criarControleRitmo();
  const ultimaConfirmada = await carregarDe(
    config,
    mundo,
    inicioS,
    hojeS,
    ambiente,
    ritmo
  );
  console.log(
    `[gerador] carga inicial completa (última confirmada: ${ultimaConfirmada}). Ciclos de ${config.intervaloSegundos} s`
  );

  let enviadosOk = 0;
  const gerador = new Gerador(config, mundo, ambiente, ultimaConfirmada, ritmo);
  while (true) {
    if (config.pararApos > 0 && enviadosOk >= config.pararApos) {
      console.log(
        `[gerador] modo parar: ${enviadosOk} ciclos ok; parado para demonstrar o alarme (Ctrl+C para sair)`
      );
      await sleep(60_000);
      continue;
    }

    await sleep(config.intervaloSegundos * 1000);
    const resultado = await gerador.executarCiclo();
    if (resultado.ok) {
      enviadosOk++;
      console.log(`[gerador] 200 — ${resultado.resumo}`);
    } else {
      console.error(`[gerador] ${resultado.resumo}; repete no próximo ciclo`);
    }
  }
}

if (process.argv[1]?.endsWith("gerador-dados-ficticios.ts")) {
  main().catch((erro) => {
    console.error(
      "[gerador] erro fatal:",
      erro instanceof Error ? erro.message : String(erro)
    );
    process.exit(1);
  });
}
