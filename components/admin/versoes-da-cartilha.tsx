import { momentoNaCasa } from "@/lib/admin/datas";
import { FUSO_PADRAO } from "@/lib/admin/fusos";
import type { VersaoDaCartilha } from "@/lib/mentor/cartilha";
import { ChevronRight } from "lucide-react";

/**
 * O histórico da cartilha, só leitura: cada versão recolhida, com a data, e o
 * texto inteiro ao abrir, para o admin conferir e copiar de volta ao editor à
 * mão (sem botão de restaurar na v1). `<details>` nativo: abre e fecha sem
 * script, no celular e no computador. A versão ativa leva a palavra "ativa" (a
 * cor nunca é o único canal). Sem nenhuma versão inativa não há o que mostrar
 * além do que o editor já tem, então a seção some.
 */
export function VersoesDaCartilha({
  versoes,
  agoraIso,
}: {
  /** Da mais nova para a mais antiga. */
  versoes: readonly VersaoDaCartilha[];
  /** Momento da leitura, para o "hoje 10:30" (no fuso do app). */
  agoraIso: string;
}) {
  if (!versoes.some((versao) => !versao.ativa)) return null;
  const agora = new Date(agoraIso);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Versões anteriores</h2>
        <p className="text-sm text-quiet">
          Abra uma versão para conferir o texto ou copiá-lo de volta para o
          editor.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {versoes.map((versao) => (
          <li key={versao.id}>
            <details className="group rounded-xl border bg-background">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 group-open:rotate-90"
                />
                <span className="number-mono">
                  {momentoNaCasa(versao.criada_em, agora, FUSO_PADRAO)}
                </span>
                {versao.ativa ? (
                  <span className="number-mono inline-flex w-fit items-center rounded-full border border-current px-2 py-0.5 text-xs">
                    ativa
                  </span>
                ) : null}
              </summary>
              <div className="whitespace-pre-wrap border-t px-4 py-3 text-sm leading-relaxed [overflow-wrap:anywhere]">
                {versao.texto}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
