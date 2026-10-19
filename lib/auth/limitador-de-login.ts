import "server-only";
import { logError } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Trava de tentativas de senha por e-mail (D-62), segunda camada além do limite
 * do Supabase (D-52). Usa a chave de serviço. Fail-open de propósito: se o banco
 * falhar, o login não trava (travar por falha seria um auto-DoS); o limite do
 * Supabase continua valendo. Nenhuma destas funções lança, e o log recebe só o
 * código, nunca a mensagem do erro.
 */

/**
 * O gerador de tipos marca `login_bloqueado` como `string`, mas a função devolve
 * `null` quando o e-mail não está bloqueado. Só uma data válida bloqueia.
 */
function comoData(valor: string | null | undefined): Date | null {
  if (typeof valor !== "string") return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

export async function loginBloqueadoAte(email: string): Promise<Date | null> {
  try {
    const { data, error } = await createServiceClient().rpc("login_bloqueado", {
      p_email: email,
    });
    if (error) {
      logError("falha_limitador_login");
      return null;
    }
    return comoData(data);
  } catch {
    logError("falha_limitador_login");
    return null;
  }
}

export async function registrarTentativaErrada(email: string): Promise<void> {
  try {
    const { error } = await createServiceClient().rpc(
      "registrar_tentativa_errada",
      { p_email: email }
    );
    if (error) logError("falha_limitador_login");
  } catch {
    logError("falha_limitador_login");
  }
}

export async function limparTentativas(email: string): Promise<void> {
  try {
    const { error } = await createServiceClient().rpc("limpar_tentativas", {
      p_email: email,
    });
    if (error) logError("falha_limitador_login");
  } catch {
    logError("falha_limitador_login");
  }
}
