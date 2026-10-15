/**
 * SHA-256 em hex do token do SCC. A recepção (`receber-envio`) procura o token
 * por este valor, e o admin grava o mesmo valor ao gerar (`lib/admin/token.ts`).
 * `tests/admin/token.test.ts` compara os dois cálculos.
 */
export async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(texto)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
