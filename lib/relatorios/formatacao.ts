import { formatarBRL } from "@/lib/format/dinheiro";
import Decimal from "decimal.js";

export function formatarValor(valor: string | null): string {
  return valor === null ? "Não informado pela SCC" : formatarBRL(valor);
}

export function formatarQuantidade(valor: string | null): string {
  if (valor === null) return "Não informado pela SCC";
  const decimal = new Decimal(valor);
  const casasDecimais = valor.includes(".")
    ? (valor.split(".")[1]?.length ?? 0)
    : 0;
  const casas = Math.min(6, Math.max(3, casasDecimais));
  const [inteiro = "0", fracao = "000"] = decimal.toFixed(casas).split(".");
  const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${agrupado},${fracao}`;
}
