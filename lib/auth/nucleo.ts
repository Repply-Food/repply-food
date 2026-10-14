import { type SupabaseClient, createClient } from "@supabase/supabase-js";

/**
 * Peças do login que não dependem do Next (testáveis contra o Supabase local).
 * As ações em `actions.ts` só juntam estas peças com os cookies.
 */
export const AVISO_TROCA = "precisa_trocar_senha";

export function precisaTrocarSenha(
  usuario: { app_metadata?: Record<string, unknown> } | null | undefined
): boolean {
  return usuario?.app_metadata?.[AVISO_TROCA] === true;
}

/** Confere a senha com um cliente descartável: não mexe na sessão do navegador. */
export async function senhaConfere(
  url: string,
  chavePublica: string,
  email: string,
  senha: string
): Promise<boolean> {
  const descartavel = createClient(url, chavePublica, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await descartavel.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error) return false;
  await descartavel.auth.signOut({ scope: "local" });
  return true;
}

/**
 * Tira o aviso de troca obrigatória. Só a chave de serviço escreve
 * `app_metadata`. Zero efeito não é sucesso: confere o que voltou.
 */
export async function liberarPrimeiroAcesso(
  servico: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await servico.auth.admin.updateUserById(userId, {
    app_metadata: { [AVISO_TROCA]: false },
  });
  return !error && data.user?.app_metadata?.[AVISO_TROCA] === false;
}
