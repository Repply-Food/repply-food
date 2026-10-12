export function requireAuth(): void {
  throw new Error("autenticação ainda não disponível");
}

export function hasAccess(): boolean {
  return false;
}
