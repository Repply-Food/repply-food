import type { ReactNode } from "react";

/**
 * Renderizador de Markdown SEGURO e mínimo para as respostas do mentor.
 *
 * O Gemini formata por natureza (negrito, listas), e sem renderizar o dono via
 * os asteriscos crus. Aqui tudo vira árvore de elementos React — nunca
 * `dangerouslySetInnerHTML` —, então o React escapa todo texto: um "<script>"
 * dentro da resposta aparece como texto e jamais executa. Cobre só o subconjunto
 * que a IA usa: negrito (`**`), itálico (`*`/`_`), código (`` ` ``), listas (com
 * `-`/`*` ou `1.`), parágrafos (linha em branco) e quebra simples (`\n`). O que
 * não casa fica como texto literal, sem quebrar.
 */

// Um marcador de ênfase por vez, na ordem: código, negrito, itálico (* ou _).
const EM_LINHA = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)/;
const LISTA_NAO_ORDENADA = /^\s*[-*]\s+/;
const LISTA_ORDENADA = /^\s*\d+\.\s+/;

function emLinha(texto: string, chave: string): ReactNode[] {
  const nos: ReactNode[] = [];
  let resto = texto;
  let i = 0;
  while (resto.length > 0) {
    const achado = EM_LINHA.exec(resto);
    if (!achado) {
      nos.push(resto);
      break;
    }
    if (achado.index > 0) nos.push(resto.slice(0, achado.index));
    const marca = achado[0];
    const k = `${chave}-${i++}`;
    if (marca.startsWith("`")) {
      nos.push(
        <code key={k} className="rounded bg-foreground/10 px-1 text-[0.95em]">
          {marca.slice(1, -1)}
        </code>
      );
    } else if (marca.startsWith("**")) {
      nos.push(
        <strong key={k} className="font-semibold">
          {marca.slice(2, -2)}
        </strong>
      );
    } else {
      nos.push(<em key={k}>{marca.slice(1, -1)}</em>);
    }
    resto = resto.slice(achado.index + marca.length);
  }
  return nos;
}

export function Markdown({ texto }: { texto: string }): ReactNode {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const blocos: ReactNode[] = [];
  let i = 0;
  let bloco = 0;

  while (i < linhas.length) {
    const atual = linhas[i] ?? "";

    if (atual.trim() === "") {
      i++;
      continue;
    }

    if (LISTA_NAO_ORDENADA.test(atual)) {
      const itens: string[] = [];
      while (i < linhas.length && LISTA_NAO_ORDENADA.test(linhas[i] ?? "")) {
        itens.push((linhas[i] ?? "").replace(LISTA_NAO_ORDENADA, ""));
        i++;
      }
      const chave = `ul-${bloco++}`;
      blocos.push(
        <ul key={chave} className="list-disc space-y-1 pl-5">
          {itens.map((item, k) => (
            <li key={`${chave}-${k}`}>{emLinha(item, `${chave}-${k}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (LISTA_ORDENADA.test(atual)) {
      const itens: string[] = [];
      while (i < linhas.length && LISTA_ORDENADA.test(linhas[i] ?? "")) {
        itens.push((linhas[i] ?? "").replace(LISTA_ORDENADA, ""));
        i++;
      }
      const chave = `ol-${bloco++}`;
      blocos.push(
        <ol key={chave} className="list-decimal space-y-1 pl-5">
          {itens.map((item, k) => (
            <li key={`${chave}-${k}`}>{emLinha(item, `${chave}-${k}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragrafo: string[] = [];
    while (
      i < linhas.length &&
      (linhas[i] ?? "").trim() !== "" &&
      !LISTA_NAO_ORDENADA.test(linhas[i] ?? "") &&
      !LISTA_ORDENADA.test(linhas[i] ?? "")
    ) {
      paragrafo.push(linhas[i] ?? "");
      i++;
    }
    const chave = `p-${bloco++}`;
    blocos.push(
      <p key={chave}>
        {paragrafo.map((linha, k) => (
          <span key={`${chave}-${k}`}>
            {emLinha(linha, `${chave}-${k}`)}
            {k < paragrafo.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>
    );
  }

  return <div className="flex flex-col gap-2">{blocos}</div>;
}
