"use client";

import { useHidratado } from "@/components/forms/use-hidratado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { momentoNaCasa } from "@/lib/admin/datas";
import type { ConversaDaLista } from "@/lib/mentor/leitura";
import {
  arquivarConversa,
  excluirConversa,
  renomearConversa,
} from "@/lib/mentor/sessoes-actions";
import { cn } from "@/lib/utils";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useState } from "react";

/** O mesmo teto que a ação `renomearConversa` aceita (título aparado). */
const TAMANHO_DO_TITULO = 60;
const SEM_TITULO = "Conversa sem título";
// A frase genérica da ação (quando o banco falha lá dentro); aqui cobre a
// queda no caminho (rede). Texto igual de propósito: para o dono é a mesma
// situação — "tente de novo em instantes".
const FRASE_FALHA =
  "não foi possível organizar as conversas agora. Tente de novo em instantes.";

/** Devolve a conversa na posição certa (a lista anda da mais recente para a mais antiga). */
function inserirPorData(
  lista: ConversaDaLista[],
  conversa: ConversaDaLista
): ConversaDaLista[] {
  return [...lista, conversa].sort((a, b) =>
    b.ultima_em.localeCompare(a.ultima_em)
  );
}

/**
 * As conversas do dono com o mentor: a principal e as arquivadas, cada linha
 * abrindo a conversa. Só navegação por link: abrir cai no servidor, que carrega
 * as mensagens (e falha de leitura continua caindo na tela de erro, nunca numa
 * lista vazia). "Nova conversa" é um link para o estado vazio — não cria nada,
 * então não gasta o limite do dia.
 *
 * Renomear, arquivar e excluir chamam as ações e aplicam na hora, na vista;
 * erro mostra a frase do produto na linha. No modo leitura do admin não há
 * botão nem campo: só os links.
 */
export function ListaConversas({
  slug,
  conversas,
  arquivadas,
  ativaId,
  fuso,
  agoraIso,
  somenteLeitura,
}: {
  /** O apelido da casa no endereço (para os links e as ações). */
  slug: string;
  /** Da mais recente para a mais antiga (a leitura já ordena). */
  conversas: ConversaDaLista[];
  /** Só as arquivadas, na mesma ordem. */
  arquivadas: ConversaDaLista[];
  ativaId: string | null;
  /** O fuso da casa: a data vai no relógio dela, nunca no do navegador. */
  fuso: string;
  /** "Agora" da leitura, para o "hoje 10:30". */
  agoraIso: string;
  /** Admin vendo o painel do cliente: navega, não organiza. */
  somenteLeitura: boolean;
}) {
  const router = useRouter();
  const hidratado = useHidratado();
  const idTitulo = useId();
  const agora = new Date(agoraIso);
  const [itens, setItens] = useState(conversas);
  const [guardadas, setGuardadas] = useState(arquivadas);
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [erro, setErro] = useState<{ id: string; frase: string } | null>(null);

  // O servidor é a fonte da verdade: depois de cada `router.refresh()` (o chat
  // acabou de criar uma conversa, ou outra aba organizou) as props chegam
  // novas e a vista acompanha.
  useEffect(() => {
    setItens(conversas);
  }, [conversas]);
  useEffect(() => {
    setGuardadas(arquivadas);
  }, [arquivadas]);

  const ocupado = ocupadoId !== null;

  function fecharPaineis() {
    setRenomeandoId(null);
    setExcluindoId(null);
    setErro(null);
  }

  function abrirRenomear(conversa: ConversaDaLista) {
    setRenomeandoId(conversa.id);
    setExcluindoId(null);
    setRascunho(conversa.titulo ?? "");
    setErro(null);
  }

  function abrirExcluir(conversa: ConversaDaLista) {
    setExcluindoId(conversa.id);
    setRenomeandoId(null);
    setErro(null);
  }

  async function salvarTitulo(
    evento: FormEvent<HTMLFormElement>,
    conversa: ConversaDaLista
  ) {
    evento.preventDefault();
    const titulo = rascunho.trim();
    if (ocupadoId !== null || titulo === "") return;
    setOcupadoId(conversa.id);
    setErro(null);
    try {
      const resultado = await renomearConversa(slug, conversa.id, titulo);
      if (resultado.ok) {
        const atualizada = { ...conversa, titulo };
        setItens((xs) =>
          xs.map((x) => (x.id === conversa.id ? atualizada : x))
        );
        setGuardadas((xs) =>
          xs.map((x) => (x.id === conversa.id ? atualizada : x))
        );
        setRenomeandoId(null);
        router.refresh();
      } else {
        setErro({ id: conversa.id, frase: resultado.error });
      }
    } catch {
      setErro({ id: conversa.id, frase: FRASE_FALHA });
    } finally {
      setOcupadoId(null);
    }
  }

  async function alternarArquivo(conversa: ConversaDaLista, arquivar: boolean) {
    if (ocupadoId !== null) return;
    setOcupadoId(conversa.id);
    setErro(null);
    try {
      const resultado = await arquivarConversa(slug, conversa.id, arquivar);
      if (resultado.ok) {
        const marcada = {
          ...conversa,
          arquivada_em: arquivar ? new Date().toISOString() : null,
        };
        if (arquivar) {
          setItens((xs) => xs.filter((x) => x.id !== conversa.id));
          setGuardadas((xs) => inserirPorData(xs, marcada));
        } else {
          setGuardadas((xs) => xs.filter((x) => x.id !== conversa.id));
          setItens((xs) => inserirPorData(xs, marcada));
        }
        router.refresh();
      } else {
        setErro({ id: conversa.id, frase: resultado.error });
      }
    } catch {
      setErro({ id: conversa.id, frase: FRASE_FALHA });
    } finally {
      setOcupadoId(null);
    }
  }

  async function confirmarExclusao(conversa: ConversaDaLista) {
    if (ocupadoId !== null) return;
    setOcupadoId(conversa.id);
    setErro(null);
    try {
      const resultado = await excluirConversa(slug, conversa.id);
      if (resultado.ok) {
        setItens((xs) => xs.filter((x) => x.id !== conversa.id));
        setGuardadas((xs) => xs.filter((x) => x.id !== conversa.id));
        setExcluindoId(null);
        router.refresh();
      } else {
        setErro({ id: conversa.id, frase: resultado.error });
      }
    } catch {
      setErro({ id: conversa.id, frase: FRASE_FALHA });
    } finally {
      setOcupadoId(null);
    }
  }

  function linha(conversa: ConversaDaLista, guardada: boolean) {
    const rotulo = conversa.titulo ?? SEM_TITULO;
    const ativa = conversa.id === ativaId;
    const renomeando = renomeandoId === conversa.id;
    const excluindo = excluindoId === conversa.id;
    const salvando = ocupadoId === conversa.id;
    return (
      <li
        key={conversa.id}
        className="flex flex-col rounded-xl border bg-background"
      >
        <div className="flex items-center gap-1 p-1.5">
          <Link
            href={`/r/${slug}/mentor?conversa=${conversa.id}`}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "min-w-0 flex-1 rounded-lg px-2.5 py-2",
              ativa && "bg-muted"
            )}
          >
            <span
              className={cn(
                "block truncate text-sm font-medium",
                conversa.titulo === null && "text-quiet"
              )}
            >
              {rotulo}
            </span>
            <span className="number-mono mt-0.5 block text-xs text-quiet">
              {momentoNaCasa(conversa.ultima_em, agora, fuso)}
            </span>
          </Link>
          {somenteLeitura ? null : (
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 md:size-8"
                aria-label={`Renomear a conversa "${rotulo}"`}
                disabled={ocupado}
                onClick={() => abrirRenomear(conversa)}
              >
                <Pencil aria-hidden="true" />
              </Button>
              {guardada ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10 md:size-8"
                  aria-label={`Trazer de volta a conversa "${rotulo}"`}
                  disabled={ocupado}
                  onClick={() => void alternarArquivo(conversa, false)}
                >
                  <ArchiveRestore aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10 md:size-8"
                  aria-label={`Arquivar a conversa "${rotulo}"`}
                  disabled={ocupado}
                  onClick={() => void alternarArquivo(conversa, true)}
                >
                  <Archive aria-hidden="true" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 md:size-8"
                aria-label={`Excluir a conversa "${rotulo}"`}
                disabled={ocupado}
                onClick={() => abrirExcluir(conversa)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
        {renomeando && !somenteLeitura ? (
          <form
            method="post"
            onSubmit={(evento) => void salvarTitulo(evento, conversa)}
            className="flex flex-col gap-2 border-t px-3 py-3"
          >
            <label htmlFor={idTitulo} className="text-sm font-medium">
              Título da conversa
            </label>
            <Input
              id={idTitulo}
              name="titulo"
              value={rascunho}
              onChange={(evento) => setRascunho(evento.target.value)}
              maxLength={TAMANHO_DO_TITULO}
              disabled={salvando}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={!hidratado || salvando || rascunho.trim() === ""}
              >
                Salvar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={fecharPaineis}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}
        {excluindo && !somenteLeitura ? (
          <div className="flex flex-col gap-3 border-t px-3 py-3">
            <p className="text-sm">
              Excluir <strong>“{rotulo}”</strong>? Ela some da sua lista na
              hora. A Repply guarda uma cópia de segurança por 60 dias e depois
              apaga de verdade.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={ocupado}
                onClick={() => void confirmarExclusao(conversa)}
              >
                Excluir conversa
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={fecharPaineis}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
        {erro?.id === conversa.id ? (
          // As frases das ações vêm em minúscula; só o desenho põe a maiúscula.
          <p
            role="alert"
            className="border-t px-3 py-2 text-sm text-destructive first-letter:uppercase"
          >
            {erro.frase}
          </p>
        ) : null}
      </li>
    );
  }

  return (
    <nav aria-label="Conversas com o mentor" className="flex flex-col gap-5">
      {somenteLeitura ? null : (
        <Link
          href={`/r/${slug}/mentor?nova=1`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-bold text-primary-foreground transition-colors outline-none hover:bg-primary-hover focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Plus aria-hidden="true" className="size-5" />
          Nova conversa
        </Link>
      )}
      <div className="flex flex-col gap-2">
        <h2 id="conversas-abertas" className="text-sm font-semibold">
          Conversas
        </h2>
        {itens.length === 0 ? (
          <p className="text-sm text-quiet">Nenhuma conversa aberta.</p>
        ) : (
          <ul
            aria-labelledby="conversas-abertas"
            className="flex flex-col gap-2"
          >
            {itens.map((c) => linha(c, false))}
          </ul>
        )}
      </div>
      {guardadas.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          <h2 id="conversas-arquivadas" className="text-sm font-semibold">
            Conversas arquivadas
          </h2>
          <ul
            aria-labelledby="conversas-arquivadas"
            className="flex flex-col gap-2"
          >
            {guardadas.map((c) => linha(c, true))}
          </ul>
        </div>
      )}
    </nav>
  );
}
