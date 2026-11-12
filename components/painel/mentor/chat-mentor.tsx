"use client";

import { useHidratado } from "@/components/forms/use-hidratado";
import { Fala } from "@/components/painel/mentor/fala";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { momentoNaCasa } from "@/lib/admin/datas";
import { FUSO_PADRAO } from "@/lib/admin/fusos";
import { baixarAnexo } from "@/lib/mentor/anexos-actions";
import {
  ACEITOS_NO_INPUT,
  MAXIMO_ANEXOS_NA_TELA,
  ROTULO_DO_TIPO_DE_ANEXO,
  formatarTamanho,
  tipoDeArquivo,
} from "@/lib/mentor/anexos-texto";
import { enviarMensagemAction } from "@/lib/mentor/enviar-action";
import type { AnexoDaConversa } from "@/lib/mentor/leitura";
import { Download, Paperclip, SendHorizontal } from "lucide-react";
import Link from "next/link";
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
// equipe lê no suporte (D-72, admin só leitura) e ela ajuda a melhorar a IA —
// valendo para o texto e para os arquivos anexados.
const AVISO =
  "O que você mandar aqui (texto e arquivo) a equipe da Repply pode ler para dar suporte, e também ajuda a melhorar a inteligência artificial.";
const FRASE_INDISPONIVEL = "o mentor está indisponível agora, tente de novo";
const FRASE_FALHA_BAIXAR =
  "não foi possível baixar o anexo agora. Tente de novo em instantes.";
const FRASE_QUANTIDADE = "dá para mandar até 5 arquivos por pergunta";
const FRASE_ANEXOS_FALHARAM = "alguns anexos não entraram, reenvie só eles";
const TAMANHO_MAXIMO_DA_PERGUNTA = 4000;

// A lista vazia estável: o padrão `anexosIniciais = []` criaria referência
// nova a cada desenho e o efeito que sincroniza a lista entraria em loop.
const SEM_ANEXOS: AnexoDaConversa[] = [];

/**
 * O chat do dono com o mentor (v1: sem streaming). A resposta vem inteira
 * quando a função do servidor volta, e enquanto isso a tela mostra
 * "Pensando…". Streaming palavra a palavra fica para a v2.
 *
 * A segurança NÃO mora aqui: esconder o campo do admin é conforto, e quem
 * barra de verdade é `enviarMensagemAction`, que confere o modo leitura e o
 * texto por dentro. O restaurante nunca sai desta tela: vai pela sessão.
 *
 * Anexos: o dono escolhe até 5 arquivos (imagem, PDF, planilha) junto da
 * pergunta; a lista da conversa mostra cada um com nome, tipo, tamanho e a
 * hora no fuso da casa, com botão de baixar (o link assinado sai da ação
 * `baixarAnexo`, que confere a casa; o navegador nunca toca no cofre direto).
 * No modo leitura do admin não há campo nem botão: só os nomes.
 */
export function ChatMentor({
  slug,
  conversaId: conversaInicial,
  mensagensIniciais,
  somenteLeitura,
  anexosIniciais,
  fuso = FUSO_PADRAO,
  agoraIso,
}: {
  slug: string;
  conversaId: string | null;
  mensagensIniciais: MensagemDoChat[];
  somenteLeitura: boolean;
  /** Os anexos já gravados da conversa aberta (vazio na nova). */
  anexosIniciais?: AnexoDaConversa[];
  /** O fuso da casa: a hora do anexo vai no relógio dela, nunca no do navegador. */
  fuso?: string;
  /** "Agora" da leitura, para o "hoje 11:30". */
  agoraIso?: string;
}) {
  const idCampo = useId();
  const idAnexo = useId();
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
  const [anexos, setAnexos] = useState<AnexoDaConversa[]>(
    anexosIniciais ?? SEM_ANEXOS
  );
  const [selecionados, setSelecionados] = useState<File[]>([]);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);
  const [erroBaixar, setErroBaixar] = useState<string | null>(null);
  const [avisoAnexos, setAvisoAnexos] = useState(false);
  // Trava contra duplo clique: o estado só muda no próximo desenho, e dois
  // envios seguidos abririam duas conversas e gastariam dois usos do limite.
  const emAndamento = useRef(false);
  const contador = useRef(0);
  const ultimaFala = useRef<HTMLLIElement>(null);
  const entradaArquivo = useRef<HTMLInputElement>(null);

  // O servidor é a fonte da verdade: depois de cada `router.refresh()`
  // as props chegam novas e a vista acompanha (como a lista de conversas).
  // A chave da página remonta o chat ao trocar de conversa; este efeito
  // cobre o mesmo endereço com dados novos (o envio acabou de entrar).
  useEffect(() => {
    setAnexos(anexosIniciais ?? SEM_ANEXOS);
  }, [anexosIniciais]);

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
    // A trava de verdade mora na ação; aqui ela só evita o envio à toa — e a
    // pergunta continua no campo, para tentar de novo sem redigitar.
    if (selecionados.length > MAXIMO_ANEXOS_NA_TELA) {
      setErro(FRASE_QUANTIDADE);
      return;
    }
    emAndamento.current = true;
    setEnviando(true);
    setErro(null);
    setAvisoAnexos(false);
    setErroBaixar(null);

    const arquivos = selecionados.length > 0 ? selecionados : null;

    const idLocal = `local-${contador.current++}`;
    setMensagens((atuais) => [
      ...atuais,
      { id: idLocal, papel: "dono", texto: pergunta },
    ]);
    setTexto("");

    // Pergunta que não foi salva sai da conversa e volta ao campo, com a frase.
    // Os arquivos continuam escolhidos: reenviar não pede para anexar de novo.
    const falhou = (frase: string) => {
      setMensagens((atuais) => atuais.filter((m) => m.id !== idLocal));
      setTexto(pergunta);
      setErro(frase);
    };

    try {
      const resultado =
        arquivos !== null
          ? await enviarMensagemAction(slug, conversaId, pergunta, arquivos)
          : await enviarMensagemAction(slug, conversaId, pergunta);
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
        if (arquivos !== null) {
          // Sucesso cheio: mostra na hora o que o dono anexou. Falha parcial
          // NÃO entra na vista local (mentiria: algum arquivo ficou de fora)
          // — só o aviso, e o `router.refresh()` traz a verdade do servidor.
          if (!resultado.data.anexosFalharam) {
            const agora = new Date().toISOString();
            setAnexos((atuais) => [
              ...atuais,
              ...arquivos.map((arquivo, indice) => ({
                id: `${idLocal}-anexo-${indice}`,
                nome: arquivo.name,
                tipo: tipoDeArquivo(arquivo.name),
                tamanho_bytes: arquivo.size,
                criada_em: agora,
              })),
            ]);
          }
          setSelecionados([]);
          if (entradaArquivo.current) entradaArquivo.current.value = "";
        }
        if (resultado.data.anexosFalharam) setAvisoAnexos(true);
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

  async function baixar(anexo: AnexoDaConversa) {
    if (somenteLeitura || baixandoId !== null) return;
    setBaixandoId(anexo.id);
    setErroBaixar(null);
    // A aba abre no gesto do clique (síncrono): o bloqueador de popup só
    // libera aqui. O link assinado chega depois e a aba navega até ele; se
    // a busca falhar, ela fecha e a frase aparece na seção.
    const aba = window.open("", "_blank", "noopener,noreferrer");
    try {
      const resultado = await baixarAnexo(slug, anexo.id);
      if (resultado.ok) {
        if (aba && !aba.closed) {
          aba.location.href = resultado.url;
        } else {
          const direta = window.open(
            resultado.url,
            "_blank",
            "noopener,noreferrer"
          );
          if (!direta) setErroBaixar(FRASE_FALHA_BAIXAR);
        }
      } else {
        aba?.close();
        setErroBaixar(resultado.error);
      }
    } catch {
      aba?.close();
      setErroBaixar(FRASE_FALHA_BAIXAR);
    } finally {
      setBaixandoId(null);
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

  const agora = agoraIso ? new Date(agoraIso) : new Date();
  const ultimoIndice = mensagens.length - 1;
  const vazio = mensagens.length === 0 && !enviando;
  const escolhidos =
    selecionados.length === 1
      ? `1 arquivo escolhido: ${selecionados[0]?.name}`
      : selecionados.length > 1
        ? `${selecionados.length} arquivos escolhidos: ${selecionados.map((a) => a.name).join(", ")}`
        : null;

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
                    {momentoNaCasa(anexo.criada_em, agora, fuso)}
                  </p>
                </div>
                {somenteLeitura ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Baixar ${anexo.nome}`}
                    disabled={baixandoId !== null}
                    onClick={() => void baixar(anexo)}
                  >
                    <Download aria-hidden="true" />
                    {baixandoId === anexo.id ? "Baixando…" : "Baixar"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {erroBaixar ? (
            <p
              role="alert"
              className="text-sm text-destructive first-letter:uppercase"
            >
              {erroBaixar}
            </p>
          ) : null}
        </section>
      ) : null}

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
          {avisoAnexos ? (
            <output className="block text-sm text-quiet">
              {FRASE_ANEXOS_FALHARAM}
            </output>
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
          <div className="flex flex-col gap-1">
            <input
              ref={entradaArquivo}
              id={idAnexo}
              name="anexos"
              type="file"
              multiple
              accept={ACEITOS_NO_INPUT}
              disabled={enviando}
              onChange={(evento) =>
                setSelecionados(Array.from(evento.target.files ?? []))
              }
              className="peer sr-only"
            />
            <label
              htmlFor={idAnexo}
              className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-bold outline-none hover:bg-muted peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
            >
              <Paperclip aria-hidden="true" className="size-5" />
              Anexar arquivos
            </label>
            <p className="text-xs text-quiet">
              até 5 arquivos, 10 MB cada: foto, PDF ou planilha.
            </p>
            {escolhidos ? (
              <p aria-live="polite" className="truncate text-xs text-quiet">
                {escolhidos}
              </p>
            ) : null}
          </div>
          <p id={idAviso} className="text-xs text-quiet">
            {AVISO}
          </p>
        </form>
      )}
      <p className="text-xs text-quiet">
        O mentor lembra do que você conta para responder melhor.{" "}
        <Link
          href={`/r/${slug}/mentor/lembrancas`}
          className="underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Veja ou apague as lembranças
        </Link>
        .
      </p>
    </div>
  );
}
