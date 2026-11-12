/**
 * O texto dos anexos do mentor para as telas (dono e admin).
 *
 * Espelho de `lib/mentor/anexos.ts`, que é server-only e a tela não pode
 * importar: se o teto ou os tipos mudarem lá, mudam aqui junto (o mesmo
 * acordo do título em `lista-conversas.tsx`).
 */

/** Até 5 arquivos por pergunta (a trava de verdade mora na ação). */
export const MAXIMO_ANEXOS_NA_TELA = 5;

/** O que o campo de anexo aceita: imagem comum, PDF e planilha. */
export const ACEITOS_NO_INPUT = "image/*,.pdf,.xlsx,.csv";

export const ROTULO_DO_TIPO_DE_ANEXO = {
  imagem: "Imagem",
  pdf: "PDF",
  planilha: "Planilha",
} as const;

/** "204800" → "200 KB"; "1572864" → "1,5 MB". */
export function formatarTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const umaCasa = (valor: number) => {
    const texto = valor.toFixed(1).replace(".", ",");
    return texto.endsWith(",0") ? texto.slice(0, -2) : texto;
  };
  if (bytes < 1024 * 1024) return `${umaCasa(bytes / 1024)} KB`;
  return `${umaCasa(bytes / (1024 * 1024))} MB`;
}

/** O tipo pela extensão do nome, para a lista otimista (a trava mora na ação). */
export function tipoDeArquivo(
  nome: string
): keyof typeof ROTULO_DO_TIPO_DE_ANEXO {
  const extensao = nome.split(".").pop()?.toLowerCase() ?? "";
  if (extensao === "pdf") return "pdf";
  if (extensao === "xlsx" || extensao === "csv") return "planilha";
  return "imagem";
}
