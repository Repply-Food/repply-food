import { randomInt } from "node:crypto";

/**
 * Senha provisória do login do cliente (D-55): gerada pelo sistema, mostrada
 * uma vez ao admin e mandada por WhatsApp. Sem os caracteres que se confundem
 * ao ditar ou ler (0/O, 1/l/I).
 */
export const ALFABETO_DA_SENHA =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export const TAMANHO_DA_SENHA = 12;

export function gerarSenhaProvisoria(): string {
  for (;;) {
    let senha = "";
    for (let i = 0; i < TAMANHO_DA_SENHA; i++) {
      senha += ALFABETO_DA_SENHA.charAt(randomInt(ALFABETO_DA_SENHA.length));
    }
    if (/[A-Za-z]/.test(senha) && /[0-9]/.test(senha)) return senha;
  }
}
