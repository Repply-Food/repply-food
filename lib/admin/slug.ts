/**
 * Endereço da casa no painel (`/r/<slug>/hoje`). Sai do nome na criação e
 * NÃO muda depois: os links e favoritos do dono continuam valendo.
 */
export function slugDoNome(nome: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "restaurante";
}

/** O próprio `base` se estiver livre; senão `base-2`, `base-3`… */
export function slugLivre(base: string, ocupados: readonly string[]): string {
  const usados = new Set(ocupados);
  if (!usados.has(base)) return base;
  for (let numero = 2; ; numero++) {
    const candidato = `${base}-${numero}`;
    if (!usados.has(candidato)) return candidato;
  }
}
