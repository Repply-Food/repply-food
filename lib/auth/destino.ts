export type RestauranteDoLogin = {
  slug: string;
  situacao: "ativo" | "suspenso";
};

/** Para onde a pessoa vai depois de entrar (desenho da etapa 2, §1). */
export function destinoDepoisDeEntrar(e: {
  precisaTrocarSenha: boolean;
  ehAdmin: boolean;
  restaurantes: RestauranteDoLogin[];
}): string {
  if (e.precisaTrocarSenha) return "/trocar-senha";
  if (e.ehAdmin) return "/admin";
  const ativos = e.restaurantes.filter((r) => r.situacao === "ativo");
  const [unica] = ativos;
  if (ativos.length === 1 && unica) return `/r/${unica.slug}/hoje`;
  if (ativos.length > 1) return "/escolher-casa";
  return "/acesso-pendente";
}
