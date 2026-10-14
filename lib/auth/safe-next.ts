/**
 * Valida um destino de redirecionamento vindo da URL.
 *
 * Sem isso, `?next=https://site-malicioso.com` faria o sistema jogar o usuário
 * recém-autenticado num site de terceiro — o clássico "open redirect", usado pra
 * roubar credencial em página que parece a nossa.
 *
 * Só passa caminho RELATIVO do próprio site. Bloqueia:
 *   - `https://outro.com`      (absoluto)
 *   - `//outro.com`            (relativo a protocolo — o navegador trata como absoluto)
 *   - `/\outro.com`            (variante que alguns navegadores normalizam pra `//`)
 *   - qualquer coisa que, resolvida, aponte pra outra origem
 *
 * Serve tanto no servidor (com `origin` explícito) quanto no navegador, onde a
 * origem sai de `window.location.origin`.
 */
export function safeNext(
  raw: string | null | undefined,
  origin?: string
): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;

  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : undefined);

  // Sem origem pra comparar, as checagens acima já garantem caminho relativo.
  if (!base) return raw;

  try {
    const parsed = new URL(raw, base);
    if (parsed.origin !== base) return null;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return null;
  }
}

/** Igual ao `safeNext`, mas cai num destino padrão em vez de devolver `null`. */
export function safeNextOr(
  raw: string | null | undefined,
  fallback: string,
  origin?: string
): string {
  return safeNext(raw, origin) ?? fallback;
}
