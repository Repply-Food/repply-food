import Decimal from "decimal.js";

export function formatarBRL(
  valor: string | number | Decimal | null | undefined
): string {
  if (valor === null || valor === undefined) {
    return "R$ 0,00";
  }
  const decimal =
    valor instanceof Decimal ? valor : new Decimal(valor.toString());
  const absoluto = decimal.isNegative() ? decimal.abs() : decimal;
  const formatado = absoluto.toFixed(2).replace(".", ",");
  const comPontos = formatado.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sinal = decimal.isNegative() ? "-" : "";
  return `${sinal}R$ ${comPontos}`;
}

export function soma(a: string | number, b: string | number): Decimal {
  return new Decimal(a).plus(new Decimal(b));
}

export function subtrai(a: string | number, b: string | number): Decimal {
  return new Decimal(a).minus(new Decimal(b));
}

export function zeroBRL(): string {
  return "R$ 0,00";
}

/**
 * Texto pt-BR de dinheiro para uma string numérica canônica com 2 casas
 * ("30000.50"), ou null se vazio/inválido. Mantém a precisão por decimal.js.
 *
 * Regras: a vírgula é o decimal e os pontos são milhar; sem vírgula, um único
 * ponto seguido de 1–2 dígitos é decimal (teclados de celular só oferecem "."),
 * e qualquer outro ponto só vale como milhar em grupos de 3. Estrutura
 * malformada (letras, grupos de milhar errados, mais de um decimal) vira null.
 */
export function analisarBRL(texto: string): string | null {
  const limpo = texto.replace(/[R$\s]/g, "");
  if (limpo === "") return null;
  if (/[^\d.,]/.test(limpo)) return null;

  // Com vírgula: vírgula é o decimal, pontos são milhar.
  if (limpo.includes(",")) {
    const partes = limpo.split(",");
    if (partes.length !== 2) return null;
    const [parteInteira = "", dec = ""] = partes;
    // A parte inteira é dígitos puros OU grupos de milhar de 3 (nunca ponto solto).
    if (!/^(\d+|\d{1,3}(\.\d{3})+)$/.test(parteInteira)) return null;
    if (!/^\d{1,2}$/.test(dec)) return null;
    const inteiro = parteInteira.replace(/\./g, "");
    return new Decimal(`${inteiro}.${dec}`).toFixed(2);
  }

  const pontos = (limpo.match(/\./g) ?? []).length;
  if (pontos === 0) {
    if (!/^\d+$/.test(limpo)) return null;
    return new Decimal(limpo).toFixed(2);
  }

  // Sem vírgula, com ponto(s): um único ponto + 1–2 dígitos = decimal.
  const ultimo = limpo.lastIndexOf(".");
  const depois = limpo.slice(ultimo + 1);
  if (pontos === 1 && /^\d{1,2}$/.test(depois)) {
    const inteiro = limpo.slice(0, ultimo);
    if (!/^\d+$/.test(inteiro)) return null;
    return new Decimal(`${inteiro}.${depois}`).toFixed(2);
  }

  // Caso contrário, pontos só valem como milhar em grupos de 3.
  if (!/^\d{1,3}(\.\d{3})+$/.test(limpo)) return null;
  return new Decimal(limpo.replace(/\./g, "")).toFixed(2);
}
