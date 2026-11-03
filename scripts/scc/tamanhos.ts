const encoder = new TextEncoder();

// jsonb::text acrescenta um espaço após cada separador estrutural. Contar
// somente fora das strings evita confundir vírgulas, dois-pontos e aspas escapadas.
export function tamanhos(valor: unknown): { http: number; banco: number } {
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
