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
