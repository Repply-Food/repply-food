import { createHmac } from "node:crypto";

/**
 * Chaves do Supabase LOCAL, assinadas com o segredo padrão de desenvolvimento
 * da CLI (o mesmo para qualquer máquina). Nunca servem para a nuvem.
 */
const SEGREDO_LOCAL = "super-secret-jwt-token-with-at-least-32-characters-long";
export const URL_LOCAL = "http://127.0.0.1:54321";

export function chaveLocal(papel: "anon" | "service_role"): string {
  const base64 = (objeto: object) =>
    Buffer.from(JSON.stringify(objeto)).toString("base64url");
  const cabecalho = base64({ alg: "HS256", typ: "JWT" });
  const corpo = base64({ iss: "supabase-demo", role: papel, exp: 1983812996 });
  const assinatura = createHmac("sha256", SEGREDO_LOCAL)
    .update(`${cabecalho}.${corpo}`)
    .digest("base64url");
  return `${cabecalho}.${corpo}.${assinatura}`;
}
