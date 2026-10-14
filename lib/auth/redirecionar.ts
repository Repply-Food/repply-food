import { NextResponse } from "next/server";

/**
 * Só vale caminho do PRÓPRIO site: começa com uma barra e não é `//` nem `/\`
 * (o navegador leria como outro site), nem tem caractere de controle (ele tira
 * tabulação e quebra de linha do endereço: `/<tab>/x` viraria `//x`).
 */
function caminhoDoSite(para: string): string {
  const temControle = [...para].some((letra) => {
    const codigo = letra.charCodeAt(0);
    return codigo < 0x20 || codigo === 0x7f;
  });
  const estranho =
    !para.startsWith("/") ||
    para.startsWith("//") ||
    para.startsWith("/\\") ||
    temControle;
  return estranho ? "/" : para;
}

/**
 * Redireciona com endereço RELATIVO, para ROTAS (route handlers). O Next troca
 * 127.0.0.1 por localhost em `request.url`; um redirecionamento absoluto levaria
 * a pessoa para outro endereço, onde o cookie da sessão (de um endereço só)
 * não existe. Relativo, o navegador fica no endereço em que estava.
 *
 * NÃO serve para o `proxy.ts`: o adaptador do Next recusa `Location` relativo
 * vindo do proxy (erro 500, "Invalid URL"). Lá o endereço vai absoluto e o
 * próprio Next o devolve relativo.
 */
export function redirecionarRelativo(para: string): NextResponse {
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: caminhoDoSite(para),
      "Cache-Control": "private, no-store",
    },
  });
}
