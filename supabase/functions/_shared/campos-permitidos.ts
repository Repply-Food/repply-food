/**
 * A lista do que a nuvem aceita guardar de um envio do SCC (D-29, D-51).
 *
 * A regra é "só entra o que está na lista": um campo novo pode ser dado
 * pessoal (CPF, e-mail, endereço), então ele é descartado e só o NOME dele
 * fica registrado, para a Repply decidir se passa a aceitar.
 * A função `processar_envio` (SQL) repete esta lista, como segunda barreira.
 */

/** Campos do contrato §5 que viram coluna em `entradas`. */
export const CAMPOS_DA_ENTRADA: readonly string[] = [
  "codEntrada",
  "DataEntrada",
  "HoraEntrada",
  "DataSaida",
  "HoraSaida",
  "ValorItens",
  "ValorDescontos",
  "ValorAcrescimos",
  "TaxaServico",
  "Complemento",
  "ValorConsumido",
  "Pago",
  "codCartaoMesa",
  "CodGarcon",
  "codOperadorHab",
  "codOperadorDesab",
  "codCliente",
  "NumeroOcupantes",
  "TipoOcupacao",
  "TipoCartao",
];

/** Campos sem significado confirmado, guardados em `entradas.extras` (H3, B17). */
export const EXTRAS_CONHECIDOS: readonly string[] = [
  "Reabilitado",
  "Flyer",
  "ConferenciaDeMesa",
  "HabilitacaoAutomatica",
  "DesabilitacaoAutomatica",
  "LimiteMinimo",
  "LimiteMaximo",
  "ECF",
  "CER",
  "COO",
];

/** Dados pessoais: descartados em silêncio, porque o SCC ainda pode mandar (B12). */
export const CAMPOS_PESSOAIS: readonly string[] = [
  "NomeCliente",
  "RG",
  "FoneCliente",
  "Sexo",
];

const CAMPOS_SIMPLES_DO_ENVELOPE: readonly string[] = [
  "versao_formato",
  "versao_scc",
  "enviado_em",
  "modo",
];
const CAMPOS_DA_JANELA: readonly string[] = ["desde", "ate"];
const CAMPOS_DO_LOTE: readonly string[] = ["numero", "total"];

/**
 * Um nome de campo só é guardado se tiver cara de nome de campo: começa com
 * letra, então um CPF ou telefone usado como nome (só dígitos) não passa.
 */
const NOME_SEGURO = /^[A-Za-z][A-Za-z0-9_.]{0,39}$/;
const LIMITE_DE_NOMES = 20;

export type EnvelopeFiltrado = {
  envelope: unknown;
  camposDesconhecidos: string[];
};

type Objeto = Record<string, unknown>;

function ehObjeto(valor: unknown): valor is Objeto {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

function ehSimples(valor: unknown): boolean {
  return (
    valor === null || ["string", "number", "boolean"].includes(typeof valor)
  );
}

function filtrarBloco(
  bloco: unknown,
  permitidos: readonly string[],
  prefixo: string,
  desconhecidos: Set<string>
): unknown {
  if (!ehObjeto(bloco)) {
    return ehSimples(bloco) ? bloco : null;
  }
  const limpo: Objeto = {};
  for (const [chave, valor] of Object.entries(bloco)) {
    if (permitidos.includes(chave) && ehSimples(valor)) {
      limpo[chave] = valor;
    } else {
      desconhecidos.add(`${prefixo}${chave}`);
    }
  }
  return limpo;
}

function filtrarEntrada(entrada: unknown, desconhecidos: Set<string>): unknown {
  if (!ehObjeto(entrada)) {
    return null;
  }
  const limpa: Objeto = {};
  for (const [chave, valor] of Object.entries(entrada)) {
    if (CAMPOS_PESSOAIS.includes(chave)) {
      continue;
    }
    const coluna = CAMPOS_DA_ENTRADA.includes(chave);
    if ((coluna || EXTRAS_CONHECIDOS.includes(chave)) && ehSimples(valor)) {
      limpa[chave] = valor;
    } else if (!coluna) {
      // Coluna com valor composto some sem aviso: a validação responde 422.
      desconhecidos.add(chave);
    }
  }
  return limpa;
}

function nomesSeguros(nomes: Set<string>): string[] {
  const seguros = new Set<string>();
  for (const nome of nomes) {
    seguros.add(NOME_SEGURO.test(nome) ? nome : "(nome fora do padrão)");
  }
  return [...seguros].sort().slice(0, LIMITE_DE_NOMES);
}

/**
 * Devolve o envelope só com os campos da lista e os nomes do que foi
 * descartado por não estar nela. Nunca devolve o valor de um campo descartado.
 */
export function filtrarEnvelope(bruto: unknown): EnvelopeFiltrado {
  if (!ehObjeto(bruto)) {
    return { envelope: null, camposDesconhecidos: [] };
  }
  const desconhecidos = new Set<string>();
  const envelope: Objeto = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    if (CAMPOS_SIMPLES_DO_ENVELOPE.includes(chave)) {
      envelope[chave] = ehSimples(valor) ? valor : null;
    } else if (chave === "janela") {
      envelope.janela = filtrarBloco(
        valor,
        CAMPOS_DA_JANELA,
        "janela.",
        desconhecidos
      );
    } else if (chave === "lote") {
      envelope.lote = filtrarBloco(
        valor,
        CAMPOS_DO_LOTE,
        "lote.",
        desconhecidos
      );
    } else if (chave === "entradas") {
      envelope.entradas = Array.isArray(valor)
        ? valor.map((item) => filtrarEntrada(item, desconhecidos))
        : null;
    } else {
      desconhecidos.add(`envelope.${chave}`);
    }
  }
  return { envelope, camposDesconhecidos: nomesSeguros(desconhecidos) };
}
