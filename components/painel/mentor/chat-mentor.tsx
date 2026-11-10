"use client";

import { useHidratado } from "@/components/forms/use-hidratado";
import { Fala } from "@/components/painel/mentor/fala";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { enviarMensagemAction } from "@/lib/mentor/enviar-action";
import { SendHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

/** O que a tela precisa de cada fala (a leitura do servidor traz um pouco mais). */
export type MensagemDoChat = {
  id: string;
  papel: "dono" | "mentor";
  texto: string;
};

// Transparência (LGPD): diz as duas coisas que acontecem com a conversa. A
// equipe lê no suporte (D-72, admin só leitura) e ela ajuda a melhorar a IA.
const AVISO =
  "A equipe da Repply pode ler esta conversa para dar suporte, e ela também ajuda a melhorar a inteligência artificial.";
const FRASE_INDISPONIVEL = "o mentor está indisponível agora, tente de novo";
const TAMANHO_MAXIMO_DA_PERGUNTA = 4000;

/**
 * O chat do dono com o mentor (v1: sem streaming). A resposta vem inteira
 * quando a função do servidor volta, e enquanto isso a tela mostra
 * "Pensando…". Streaming palavra a palavra fica para a v2.
 *
 * A segurança NÃO mora aqui: esconder o campo do admin é conforto, e quem
 * barra de verdade é `enviarMensagemAction`, que confere o modo leitura e o
 * texto por dentro. O restaurante nunca sai desta tela: vai pela sessão.
 */
export function ChatMentor({
  slug,
  conversaId: conversaInicial,
  mensagensIniciais,
  somenteLeitura,
}: {
  slug: string;
  conversaId: string | null;
  mensagensIniciais: MensagemDoChat[];
  somenteLeitura: boolean;
}) {
  const idCampo = useId();
  const idAviso = useId();
  const hidratado = useHidratado();
  const router = useRouter();
  const [mensagens, setMensagens] = useState<MensagemDoChat[]>(
    mensagensIniciais.map(({ id, papel, texto }) => ({ id, papel, texto }))
  );
  const [conversaId, setConversaId] = useState(conversaInicial);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Trava contra duplo clique: o estado só muda no próximo desenho, e dois
  // envios seguidos abririam duas conversas e gastariam dois usos do limite.
  const emAndamento = useRef(false);
  const contador = useRef(0);
  const ultimaFala = useRef<HTMLLIElement>(null);

  // Mantém a conversa à vista: a pergunta nova vai para o fim da tela, e uma
  // resposta nova abre pelo começo dela (resposta longa se lê de cima).
  const respostaNova = !enviando && mensagens.at(-1)?.papel === "mentor";
  // biome-ignore lint/correctness/useExhaustiveDependencies: só reage a fala nova ou a "pensando…"
  useEffect(() => {
    ultimaFala.current?.scrollIntoView?.({
      block: respostaNova ? "start" : "end",
    });
  }, [mensagens.length, enviando]);

  async function enviar() {
    const pergunta = texto.trim();
    if (somenteLeitura || emAndamento.current || pergunta === "") return;
    emAndamento.current = true;
    setEnviando(true);
    setErro(null);

    const idLocal = `local-${contador.current++}`;
    setMensagens((atuais) => [
      ...atuais,
      { id: idLocal, papel: "dono", texto: pergunta },
    ]);
    setTexto("");

    // Pergunta que não foi salva sai da conversa e volta ao campo, com a frase.
    const falhou = (frase: string) => {
      setMensagens((atuais) => atuais.filter((m) => m.id !== idLocal));
      setTexto(pergunta);
      setErro(frase);
    };

    try {
      const resultado = await enviarMensagemAction(slug, conversaId, pergunta);
      if (resultado.ok) {
        const idDaResposta = `local-${contador.current++}`;
        setConversaId(resultado.data.conversaId);
        setMensagens((atuais) => [
          ...atuais,
          {
            id: idDaResposta,
            papel: "mentor",
            texto: resultado.data.resposta,
          },
        ]);
        // A lista ao lado anda junto: a conversa nova aparece nela (e a aberta
        // volta ao topo). O estado daqui não mexe — a chave só muda de conversa
        // quando o endereço muda.
        router.refresh();
      } else {
        falhou(resultado.error);
      }
    } catch {
      // Rede caiu ou a função estourou o tempo: nunca mostra o erro técnico.
      falhou(FRASE_INDISPONIVEL);
    } finally {
      emAndamento.current = false;
      setEnviando(false);
    }
  }

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void enviar();
  }

  // No computador (mouse), Enter envia e Shift+Enter quebra a linha. No celular
  // Enter é quebra de linha e quem envia é o botão.
  function aoApertarTecla(evento: KeyboardEvent<HTMLTextAreaElement>) {
    if (evento.key !== "Enter" || evento.shiftKey) return;
    if (evento.nativeEvent.isComposing) return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    evento.preventDefault();
    void enviar();
  }

  const ultimoIndice = mensagens.length - 1;
  const vazio = mensagens.length === 0 && !enviando;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div
        role="log"
        aria-label="Conversa com o mentor"
        aria-live="polite"
        aria-relevant="additions"
        className="min-h-[55dvh]"
      >
        {vazio ? (
          <div className="brand-surface flex flex-col gap-2 rounded-lg p-6">
            {somenteLeitura ? (
              <p className="text-quiet">
                O dono desta casa ainda não fez nenhuma pergunta ao mentor.
              </p>
            ) : (
              <>
                <p className="text-lg font-semibold">
                  Faça a primeira pergunta ao mentor
                </p>
                <p className="text-sm text-quiet">
                  Ele olha os números da sua casa e responde com base neles. Por
                  exemplo: “Como foi a semana?”
                </p>
              </>
            )}
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {mensagens.map((m, indice) => (
              <Fala
                key={m.id}
                papel={m.papel}
                referencia={
                  indice === ultimoIndice && !enviando ? ultimaFala : undefined
                }
              >
                {m.texto}
              </Fala>
            ))}
            {enviando ? (
              <Fala papel="mentor" referencia={ultimaFala}>
                <output className="text-quiet motion-safe:animate-pulse">
                  Pensando…
                </output>
              </Fala>
            ) : null}
          </ol>
        )}
      </div>

      {somenteLeitura ? (
        <p className="brand-surface rounded-lg p-3 text-sm text-quiet">
          Modo leitura — o mentor responde só para o dono.
        </p>
      ) : (
        <form
          method="post"
          onSubmit={aoEnviar}
          className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[5] -mx-4 flex flex-col gap-2 border-t bg-background px-4 pt-3 pb-3 md:bottom-0 md:mx-0 md:px-0"
        >
          {erro ? (
            // As frases do mentor vêm em minúscula; só o desenho põe a maiúscula.
            <p
              role="alert"
              className="text-sm text-destructive first-letter:uppercase"
            >
              {erro}
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <label htmlFor={idCampo} className="sr-only">
              Sua pergunta ao mentor
            </label>
            <Textarea
              id={idCampo}
              name="texto"
              rows={1}
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              onKeyDown={aoApertarTecla}
              readOnly={enviando}
              maxLength={TAMANHO_MAXIMO_DA_PERGUNTA}
              aria-describedby={idAviso}
              placeholder="Pergunte sobre os números da sua casa"
              className="max-h-40 min-h-11 flex-1 resize-none"
            />
            <Button
              type="submit"
              size="toque"
              className="px-3 md:px-6"
              aria-label="Enviar pergunta"
              disabled={!hidratado || enviando || texto.trim() === ""}
            >
              <SendHorizontal aria-hidden="true" />
              <span className="sr-only md:not-sr-only">Enviar</span>
            </Button>
          </div>
          <p id={idAviso} className="text-xs text-quiet">
            {AVISO}
          </p>
        </form>
      )}
    </div>
  );
}
