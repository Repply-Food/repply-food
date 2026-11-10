import { NavegacaoDoMentor } from "@/components/admin/navegacao-do-mentor";
import { momentoNaCasa } from "@/lib/admin/datas";
import type { ConversaParaAdmin } from "@/lib/mentor/leitura";
import { cn } from "@/lib/utils";
import Link from "next/link";

/**
 * As conversas do mentor de todas as casas, só leitura (suporte, D-38). Cada
 * linha é um link para a conversa. No celular a linha empilha casa, título e
 * hora; no computador viram três colunas. A hora vai no fuso de CADA casa
 * (CLAUDE.md §5), porque é o relógio em que o dono perguntou.
 *
 * Sem nenhum botão nem campo: quem chega aqui acompanha, não responde. `haMais`
 * vem da leitura, que sabe se sobrou conversa mais antiga fora do teto: nesse
 * caso a tela diz isso em vez de parecer completa (e não avisa à toa quando a
 * lista tem exatamente o teto). A conversa que o dono excluiu continua aqui,
 * marcada como "Excluída": o suporte precisa vê-la para apagar de verdade a
 * pedido do cliente (o detalhe tem o botão).
 */
export function ListaConversasDoMentor({
  conversas,
  agoraIso,
  haMais,
}: {
  /** Da mais recente para a mais antiga. */
  conversas: readonly ConversaParaAdmin[];
  /** Momento da leitura, para o "hoje 21:03" (no fuso de cada casa). */
  agoraIso: string;
  /** Há conversa mais antiga que ficou fora desta lista. */
  haMais: boolean;
}) {
  const agora = new Date(agoraIso);
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <NavegacaoDoMentor atual="conversas" />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Conversas do mentor</h1>
        <p className="text-quiet">
          O que os donos perguntam ao mentor, de todas as casas, da mais recente
          para a mais antiga. Só leitura: aqui você acompanha, não responde.
        </p>
      </div>

      {conversas.length === 0 ? (
        <p className="brand-surface rounded-xl p-6 text-quiet">
          Nenhum dono conversou com o mentor ainda.
        </p>
      ) : (
        <>
          <ul aria-label="Conversas" className="flex flex-col gap-2">
            {conversas.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/mentor/conversas/${c.id}`}
                  className="flex min-h-14 flex-col gap-1 rounded-xl border bg-background px-4 py-3 md:grid md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_8rem] md:items-center md:gap-4"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <strong className="truncate">{c.casa.nome}</strong>
                    {c.excluida ? (
                      <span className="number-mono shrink-0 rounded-full border px-2 py-0.5 text-xs">
                        Excluída
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "line-clamp-2 break-words md:line-clamp-1",
                      c.titulo === null && "text-quiet"
                    )}
                  >
                    {c.titulo ?? "Conversa sem título"}
                  </span>
                  <span className="number-mono text-xs text-quiet md:text-right">
                    {momentoNaCasa(c.ultima_em, agora, c.casa.fuso)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {haMais ? (
            <p className="text-sm text-quiet">
              Mostrando as {conversas.length} conversas mais recentes. As
              anteriores ficam de fora desta lista.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
