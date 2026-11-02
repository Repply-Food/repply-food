import {
  MAX_BYTES_CARGA,
  MAX_BYTES_PAGINA,
  MAX_PAGINAS,
  MAX_REGISTROS_CARGA,
  MAX_REGISTROS_PAGINA,
} from "../../supabase/functions/_shared/scc/limites";
import {
  type EnvioSccV2,
  envioSccV2Schema,
} from "../../supabase/functions/_shared/scc/schemas";
import { tamanhos } from "../relatorios/fragmentar";

export function fragmentarV2(entrada: unknown): EnvioSccV2[] {
  if (
    !entrada ||
    typeof entrada !== "object" ||
    !("dados" in entrada) ||
    !Array.isArray(entrada.dados)
  )
    throw new Error("Carga inválida.");
  const dados: unknown[] = entrada.dados;
  if (dados.length > MAX_REGISTROS_CARGA)
    throw new Error("Carga excede o limite de registros.");
  const pagina = (linhas: unknown[], numero: number, total: number) => ({
    ...entrada,
    pagina: { numero, total },
    total_registros: dados.length,
    dados: linhas,
  });
  const medidas = dados.map(tamanhos);
  function compor(total: number) {
    const paginas: ReturnType<typeof pagina>[] = [];
    let linhas: unknown[] = [];
    let tamanho = tamanhos(pagina([], 1, total));
    for (const [i, linha] of dados.entries()) {
      const medida = medidas[i];
      if (!medida) throw new Error("Carga inválida.");
      const excede = () =>
        linhas.length >= MAX_REGISTROS_PAGINA ||
        tamanho.http + medida.http + (linhas.length ? 1 : 0) >
          MAX_BYTES_PAGINA ||
        tamanho.banco + medida.banco + (linhas.length ? 2 : 0) >
          MAX_BYTES_PAGINA;
      if (linhas.length && excede()) {
        paginas.push(pagina(linhas, paginas.length + 1, total));
        linhas = [];
        tamanho = tamanhos(pagina([], paginas.length + 1, total));
      }
      if (excede()) throw new Error("Registro excede o limite de bytes.");
      tamanho.http += medida.http + (linhas.length ? 1 : 0);
      tamanho.banco += medida.banco + (linhas.length ? 2 : 0);
      linhas.push(linha);
    }
    paginas.push(pagina(linhas, paginas.length + 1, total));
    if (paginas.length > MAX_PAGINAS)
      throw new Error("Carga excede o limite de páginas.");
    return paginas.map((p) => ({
      ...p,
      pagina: { ...p.pagina, total: paginas.length },
    }));
  }
  let paginas = compor(1);
  if (paginas.some((p) => tamanhos(p).banco > MAX_BYTES_PAGINA))
    paginas = compor(MAX_PAGINAS);
  let bytes = 0;
  return paginas.map((pagina) => {
    const tamanho = tamanhos(pagina);
    bytes += tamanho.banco;
    if (
      tamanho.http > MAX_BYTES_PAGINA ||
      tamanho.banco > MAX_BYTES_PAGINA ||
      bytes > MAX_BYTES_CARGA
    )
      throw new Error("Carga excede o limite de bytes.");
    const resultado = envioSccV2Schema.safeParse(pagina);
    if (!resultado.success) throw new Error("Carga inválida.");
    return resultado.data;
  });
}
