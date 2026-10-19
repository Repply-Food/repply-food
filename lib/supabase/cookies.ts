import type { CookieOptions } from "@supabase/ssr";

export const EM_PRODUCAO = process.env.NODE_ENV === "production";

/**
 * Opções de cookie de sessão num lugar só (dívida 37). Em produção todo cookie
 * sai com `Secure` e `SameSite=Lax` (a menos que o chamador já tenha escolhido
 * outro `sameSite`). Fora de produção, as opções vão como vieram: o login local
 * roda em http e um cookie `Secure` nunca chegaria.
 */
export function opcoesDeCookieSeguro(
  options: CookieOptions | undefined,
  emProducao: boolean = EM_PRODUCAO
): CookieOptions {
  if (!emProducao) return options ?? {};
  return { ...options, secure: true, sameSite: options?.sameSite ?? "lax" };
}
