import {
  MAX_BYTES_CARGA,
  MAX_BYTES_PAGINA,
  MAX_LINHAS_PAGINA,
  MAX_PAGINAS,
} from "../../supabase/functions/_shared/relatorios/limites.ts";
import {
  type Fotografia,
  type LinhaRelatorio,
  type PedidoRelatorios,
  fotografiaSchema,
  pedidoRelatoriosSchema,
} from "../../supabase/functions/_shared/relatorios/schemas.ts";

export class ErroRelatorios extends Error {}
const encoder = new TextEncoder();

// jsonb::text acrescenta um espaço após cada separador estrutural. Contar
// somente fora das strings evita confundir vírgulas, dois-pontos e aspas escapadas.
function tamanhos(valor: unknown): { http: number; banco: number } {
  const json = JSON.stringify(valor);
  let dentro = false;
  let escapado = false;
  let separadores = 0;
  for (const caractere of json) {
    if (dentro) {
      if (escapado) escapado = false;
      else if (caractere === "\\") escapado = true;
      else if (caractere === '"') dentro = false;
    } else if (caractere === '"') dentro = true;
    else if (caractere === ":" || caractere === ",") separadores++;
  }
  const http = encoder.encode(json).byteLength;
  return { http, banco: http + separadores };
}

type Pagina = Exclude<PedidoRelatorios, { acao: "publicar" }>;

export function fragmentarFotografia(entrada: Fotografia): PedidoRelatorios[] {
  const validada = fotografiaSchema.safeParse(entrada);
  if (!validada.success) throw new ErroRelatorios("Fotografia inválida.");
  const fotografia = validada.data;
  // Cada linha é medida uma vez. Somar seu JSON ao envelope é exatamente
  // equivalente a codificar a página candidata inteira, sem trabalho quadrático.
  const medidas = fotografia.linhas.map(tamanhos);
  const pagina = (linhas: LinhaRelatorio[], numero: number, total: number) => ({
    acao: "pagina" as const,
    manifesto: {
      ...fotografia.manifesto,
      total_paginas: total,
      total_linhas: fotografia.linhas.length,
    },
    numero,
    linhas,
  });
  function compor(totalProvisorio: number) {
    const paginas: ReturnType<typeof pagina>[] = [];
    let linhas: LinhaRelatorio[] = [];
    let tamanho = tamanhos(pagina([], 1, totalProvisorio));
    for (const [indice, linha] of fotografia.linhas.entries()) {
      const medida = medidas[indice];
      if (!medida) throw new ErroRelatorios("Fotografia inválida.");
      const excede = () =>
        linhas.length >= MAX_LINHAS_PAGINA ||
        tamanho.http + medida.http + (linhas.length ? 1 : 0) >
          MAX_BYTES_PAGINA ||
        tamanho.banco + medida.banco + (linhas.length ? 2 : 0) >
          MAX_BYTES_PAGINA;
      if (linhas.length && excede()) {
        paginas.push(pagina(linhas, paginas.length + 1, totalProvisorio));
        linhas = [];
        tamanho = tamanhos(pagina([], paginas.length + 1, totalProvisorio));
      }
      if (excede())
        throw new ErroRelatorios("Linha excede o limite da página.");
      tamanho.http += medida.http + (linhas.length ? 1 : 0);
      tamanho.banco += medida.banco + (linhas.length ? 2 : 0);
      linhas.push(linha);
    }
    paginas.push(pagina(linhas, paginas.length + 1, totalProvisorio));
    if (paginas.length > MAX_PAGINAS)
      throw new ErroRelatorios("Carga excede o limite de páginas.");
    return paginas.map((p) => ({
      ...p,
      manifesto: { ...p.manifesto, total_paginas: paginas.length },
    }));
  }
  let paginas = compor(1);
  if (paginas.some((p) => tamanhos(p).banco > MAX_BYTES_PAGINA)) {
    // Reserva os dígitos do maior manifesto possível antes de recompor.
    paginas = compor(MAX_PAGINAS);
  }
  let totalBytes = 0;
  const pedidos: Pagina[] = [];
  for (const pagina of paginas) {
    const tamanho = tamanhos(pagina);
    if (tamanho.http > MAX_BYTES_PAGINA || tamanho.banco > MAX_BYTES_PAGINA)
      throw new ErroRelatorios("Página excede o limite de bytes.");
    totalBytes += tamanho.banco;
    if (totalBytes > MAX_BYTES_CARGA)
      throw new ErroRelatorios("Carga excede o limite de bytes.");
    const pedido = pedidoRelatoriosSchema.safeParse(pagina);
    if (!pedido.success || pedido.data.acao !== "pagina")
      throw new ErroRelatorios("Página inválida.");
    pedidos.push(pedido.data);
  }
  return [
    ...pedidos,
    { acao: "publicar", carga_id: fotografia.manifesto.carga_id },
  ];
}
