/**
 * O "porteiro" decide, para cada endereço, se a pessoa segue, vai para
 * /entrar ou é obrigada a trocar a senha. Função pura: `proxy.ts` só aplica.
 */

export const ROTA_ENTRAR = "/entrar";
export const ROTA_TROCAR_SENHA = "/trocar-senha";

const PUBLICAS = new Set(["/entrar", "/esqueci-a-senha"]);
const PREFIXOS_PUBLICOS = ["/auth/"];
/** Abertas mesmo com a troca de senha pendente. */
const LIVRES_NA_TROCA = new Set([ROTA_TROCAR_SENHA, "/nova-senha"]);

const EXTENSOES_ESTATICAS = new Set([
  "svg",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "ico",
  "css",
  "js",
  "map",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "txt",
  "xml",
  "json",
  "webmanifest",
]);
const PREFIXOS_ESTATICOS = ["/_next/", "/marca/"];

/**
 * Olha só o ÚLTIMO segmento e exige arquivo na raiz ou num prefixo estático
 * (lição do Imob: `/entrar/truque.png` não pode virar "arquivo" e escapar).
 */
export function ehArquivoEstatico(pathname: string): boolean {
  const barra = pathname.lastIndexOf("/");
  const ultimo = pathname.slice(barra + 1);
  const ponto = ultimo.lastIndexOf(".");
  if (ponto <= 0) return false;
  if (!EXTENSOES_ESTATICAS.has(ultimo.slice(ponto + 1).toLowerCase()))
    return false;
  return (
    barra === 0 ||
    PREFIXOS_ESTATICOS.some((prefixo) => pathname.startsWith(prefixo))
  );
}

function ehPublica(pathname: string): boolean {
  return (
    PUBLICAS.has(pathname) ||
    PREFIXOS_PUBLICOS.some((prefixo) => pathname.startsWith(prefixo))
  );
}

export type Decisao = { tipo: "segue" } | { tipo: "redireciona"; para: string };

export function decidirRota(e: {
  pathname: string;
  search: string;
  temUsuario: boolean;
  precisaTrocarSenha: boolean;
}): Decisao {
  if (ehArquivoEstatico(e.pathname)) return { tipo: "segue" };

  // A página "sem conexão" do PWA é pública: só texto fixo, sem dado. Precisa
  // abrir sem login e sem a trava de troca de senha, para o service worker
  // guardar e servir o fallback offline (etapa 6).
  if (e.pathname === "/offline") return { tipo: "segue" };

  if (!e.temUsuario) {
    if (ehPublica(e.pathname)) return { tipo: "segue" };
    if (e.pathname === "/") return { tipo: "redireciona", para: ROTA_ENTRAR };
    return {
      tipo: "redireciona",
      para: `${ROTA_ENTRAR}?next=${encodeURIComponent(`${e.pathname}${e.search}`)}`,
    };
  }

  if (
    e.precisaTrocarSenha &&
    !LIVRES_NA_TROCA.has(e.pathname) &&
    !e.pathname.startsWith("/auth/")
  ) {
    return { tipo: "redireciona", para: ROTA_TROCAR_SENHA };
  }

  return { tipo: "segue" };
}
