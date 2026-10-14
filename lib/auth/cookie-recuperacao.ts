import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cookie que prova que a troca de senha nasceu de um link de e-mail de
 * verdade: `usuario.validade.hmac`, assinado com a chave de serviço, válido por
 * 10 minutos e amarrado ao usuário. Sem a chave, ninguém forja.
 */
export const COOKIE_RECUPERACAO = "recuperacao_senha";
export const CAMINHO_COOKIE_RECUPERACAO = "/nova-senha";
const VALIDADE_MS = 10 * 60 * 1000;

function segredo(): string {
  const valor = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!valor)
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY é obrigatória para o cookie de recuperação"
    );
  return valor;
}

function assinar(conteudo: string): string {
  return createHmac("sha256", segredo()).update(conteudo).digest("hex");
}

export function criarCookieRecuperacao(userId: string): string {
  const conteudo = `${userId}.${Date.now() + VALIDADE_MS}`;
  return `${conteudo}.${assinar(conteudo)}`;
}

export function conferirCookieRecuperacao(
  valor: string | undefined,
  userId: string
): boolean {
  if (!valor) return false;
  const partes = valor.split(".");
  if (partes.length !== 3) return false;
  const [usuario, validade, hmac] = partes;
  if (!usuario || !validade || !hmac || usuario !== userId) return false;
  const expira = Number.parseInt(validade, 10);
  if (!Number.isFinite(expira) || expira < Date.now()) return false;
  try {
    const recebido = Buffer.from(hmac, "hex");
    const esperado = Buffer.from(assinar(`${usuario}.${validade}`), "hex");
    return (
      recebido.length === esperado.length && timingSafeEqual(recebido, esperado)
    );
  } catch {
    return false;
  }
}
