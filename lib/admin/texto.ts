export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Depois de gerado, o token só aparece pelo começo (D-38). */
export function mascararToken(prefixo: string): string {
  return `${prefixo}••••`;
}

/** Para o histórico: nunca o e-mail completo (D-59). */
export function mascararEmail(email: string): string {
  const arroba = email.lastIndexOf("@");
  if (arroba <= 0) return "…";
  return `${email.slice(0, Math.min(2, arroba))}…${email.slice(arroba)}`;
}
