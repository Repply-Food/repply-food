"use client";

import { Confirmacao } from "@/components/admin/confirmacao";
import { Fala } from "@/components/painel/mentor/fala";
import { Button } from "@/components/ui/button";
import { momentoNaCasa } from "@/lib/admin/datas";
import {
  ROTULO_DO_TIPO_DE_ANEXO,
  formatarTamanho,
} from "@/lib/mentor/anexos-texto";
import type {
  AnexoDaConversa,
  DetalheDaConversaParaAdmin,
} from "@/lib/mentor/leitura";
import { apagarConversaDeVerdade } from "@/lib/mentor/sessoes-actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

/**
 * Um anexo da conversa com o link de baixar pronto: a página do admin assina
 * cada anexo no servidor (`urlParaBaixar`, com a chave de serviço) e a tela só
 * abre o link — sem botão, sem campo, sem ação de escrita (D-38). Sem link
 * (nulo), o nome continua visível e a tela diz para recarregar.
 */
export type AnexoParaAdmin = AnexoDaConversa & { url: string | null };

const NOME_DE_QUEM_FALOU = { dono: "Dono", mentor: "Mentor" } as const;

/**
 * Uma conversa do dono com o mentor, vista pelo admin (suporte, D-38). Só
 * leitura: sem formulário, sem botão — exceto o "Apagar de verdade" na conversa
 * que o dono excluiu. As falas reaproveitam o balão do chat do dono, mas com o
 * nome de quem falou ("Dono", não "Você": o admin lê a fala de outra pessoa) e
 * a hora no fuso da casa. A conversa sem mensagem (sobra de uma gravação pela
 * metade) diz que está vazia em vez de mostrar uma tela em branco.
 *
 * A excluída aparece marcada: o dono não a vê mais, mas ela fica guardada por
 * até 60 dias (D-75), e o suporte precisa vê-la para apagar na hora se o
 * cliente pedir. O apagar pede duas confirmações e chama a ação com a chave de
 * serviço (`apagarConversaDeVerdade`), nunca um DELETE direto da tela; no fim
 * volta para a lista, porque a conversa não existe mais.
 */
export function ConversaDoMentor({
  conversa,
  agoraIso,
  anexos = [],
}: {
  conversa: DetalheDaConversaParaAdmin;
  /** Momento da leitura, para o "hoje 21:03" (no fuso da casa). */
  agoraIso: string;
  /** Os anexos da conversa, com o link de baixar pronto (vazio = sem anexo, igual a hoje). */
  anexos?: AnexoParaAdmin[];
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
        {conversa.excluida ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-quiet">
            <span className="number-mono rounded-full border px-2 py-0.5 text-xs">
              Excluída
            </span>
            O dono excluiu esta conversa. Ela fica guardada por até 60 dias e
            depois some sozinha.
          </p>
        ) : null}
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

      {anexos.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Anexos da conversa</h2>
          <ul aria-label="Anexos da conversa" className="flex flex-col gap-2">
            {anexos.map((anexo) => (
              <li
                key={anexo.id}
                className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{anexo.nome}</p>
                  <p className="number-mono text-xs text-quiet">
                    {ROTULO_DO_TIPO_DE_ANEXO[anexo.tipo]} ·{" "}
                    {formatarTamanho(anexo.tamanho_bytes)} ·{" "}
                    {momentoNaCasa(anexo.criada_em, agora, casa.fuso)}
                  </p>
                </div>
                {anexo.url ? (
                  <Link
                    href={anexo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={anexo.nome}
                    aria-label={`Baixar ${anexo.nome}`}
                    className="inline-flex h-9 shrink-0 items-center rounded-lg border px-3 text-sm font-bold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    Baixar
                  </Link>
                ) : (
                  <span className="shrink-0 text-xs text-quiet">
                    Recarregue a página para baixar
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {conversa.excluida ? <ApagarDeVerdade conversaId={conversa.id} /> : null}
    </section>
  );
}

/**
 * O botão de apagar de verdade, só na conversa excluída. Duas confirmações: a
 * primeira explica que a conversa sai da lista do admin; a segunda avisa que
 * ela some para sempre, inclusive da cópia de segurança. Erro do servidor
 * aparece aqui e continua na conversa; no sucesso volta para a lista.
 */
function ApagarDeVerdade({ conversaId }: { conversaId: string }) {
  const roteador = useRouter();
  const [etapa, setEtapa] = useState<"nada" | "primeira" | "segunda">("nada");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function apagar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await apagarConversaDeVerdade(conversaId);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      toast.success("Conversa apagada de verdade.");
      roteador.push("/admin/mentor/conversas");
    });
  }

  if (etapa === "nada") {
    return (
      <Button
        type="button"
        variant="destructive"
        size="toque"
        className="w-full sm:w-fit md:h-9 md:text-sm"
        onClick={() => {
          setErro(null);
          setEtapa("primeira");
        }}
      >
        Apagar de verdade
      </Button>
    );
  }

  return (
    <>
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
      {etapa === "primeira" ? (
        <Confirmacao
          texto="A conversa sai da lista do admin e continua fora da vista do dono. Quer continuar?"
          rotuloConfirmar="Continuar"
          enviando={enviando}
          aoConfirmar={() => setEtapa("segunda")}
          aoCancelar={() => {
            setErro(null);
            setEtapa("nada");
          }}
        />
      ) : (
        <Confirmacao
          texto="Última confirmação: ela some para sempre, inclusive da cópia de segurança. Não dá para desfazer."
          rotuloConfirmar="Apagar para sempre"
          enviando={enviando}
          aoConfirmar={apagar}
          aoCancelar={() => {
            setErro(null);
            setEtapa("nada");
          }}
        />
      )}
    </>
  );
}
