import { Fala } from "@/components/painel/mentor/fala";
import { momentoNaCasa } from "@/lib/admin/datas";
import type { DetalheDaConversaParaAdmin } from "@/lib/mentor/leitura";
import Link from "next/link";

const NOME_DE_QUEM_FALOU = { dono: "Dono", mentor: "Mentor" } as const;

/**
 * Uma conversa do dono com o mentor, vista pelo admin (suporte, D-38). Só
 * leitura: sem formulário, sem botão. As falas reaproveitam o balão do chat do
 * dono, mas com o nome de quem falou ("Dono", não "Você": o admin lê a fala de
 * outra pessoa) e a hora no fuso da casa. A conversa sem mensagem (sobra de uma
 * gravação pela metade) diz que está vazia em vez de mostrar uma tela em branco.
 */
export function ConversaDoMentor({
  conversa,
  agoraIso,
}: {
  conversa: DetalheDaConversaParaAdmin;
  /** Momento da leitura, para o "hoje 21:03" (no fuso da casa). */
  agoraIso: string;
}) {
  const agora = new Date(agoraIso);
  const { casa, mensagens } = conversa;
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link
        href="/admin/mentor/conversas"
        className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4"
      >
        ‹ Conversas do mentor
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="break-words text-2xl font-semibold">
          {conversa.titulo ?? "Conversa sem título"}
        </h1>
        <p className="text-sm text-quiet">
          <Link
            href={`/admin/restaurantes/${casa.id}`}
            className="underline underline-offset-4"
          >
            {casa.nome}
          </Link>
          {" · "}
          {mensagens.length === 1
            ? "1 mensagem"
            : `${mensagens.length} mensagens`}
          {" · última "}
          {momentoNaCasa(conversa.ultima_em, agora, casa.fuso)}
        </p>
      </div>

      {mensagens.length === 0 ? (
        <p className="brand-surface rounded-xl p-6 text-quiet">
          Esta conversa ainda não tem mensagens.
        </p>
      ) : (
        <ol aria-label="Mensagens da conversa" className="flex flex-col gap-4">
          {mensagens.map((m) => (
            <Fala
              key={m.id}
              papel={m.papel}
              rotulo={`${NOME_DE_QUEM_FALOU[m.papel]} · ${momentoNaCasa(m.criada_em, agora, casa.fuso)}`}
            >
              {m.texto}
            </Fala>
          ))}
        </ol>
      )}
    </section>
  );
}
