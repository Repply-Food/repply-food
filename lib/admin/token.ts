import { createHash, randomBytes } from "node:crypto";

/**
 * Token de envio do SCC (D-03, D-38): `rf_` + 32 caracteres aleatórios em
 * base62. Só o SHA-256 em hex vai para o banco, pelo MESMO cálculo da recepção
 * (`sha256Hex`, em `supabase/functions/_shared/token.ts`).
 */
export const PREFIXO_DO_TOKEN = "rf_";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const TAMANHO_ALEATORIO = 32;
/** Maior múltiplo de 62 que cabe num byte: acima disso o byte é descartado, sem viés. */
const LIMITE_SEM_VIES = 248;

export function gerarToken(): string {
  let aleatorio = "";
  while (aleatorio.length < TAMANHO_ALEATORIO) {
    for (const byte of randomBytes(64)) {
      if (byte < LIMITE_SEM_VIES && aleatorio.length < TAMANHO_ALEATORIO) {
        aleatorio += BASE62.charAt(byte % 62);
      }
    }
  }
  return `${PREFIXO_DO_TOKEN}${aleatorio}`;
}

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Os 7 primeiros caracteres (`rf_` + 4), guardados para reconhecer o token no admin. */
export function prefixoDoToken(token: string): string {
  return token.slice(0, 7);
}
