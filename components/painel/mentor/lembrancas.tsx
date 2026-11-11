"use client";

import { Button } from "@/components/ui/button";
import { momentoNaCasa } from "@/lib/admin/datas";
import type { FichaDaLista } from "@/lib/mentor/leitura";
import { apagarFicha, esquecerTudo } from "@/lib/mentor/memorias-actions";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// A frase genérica das ações (quando o banco falha lá dentro); aqui cobre a
// queda no caminho (rede). Texto igual de propósito: para o dono é a mesma
// situação — "tente de novo em instantes".
const FRASE_FALHA =
  "não foi possível mexer nas lembranças agora. Tente de novo em instantes.";

/**
 * O que o mentor lembra da casa e do dono: cada ficha com o tipo, o texto e
 * quando foi mexida. Só botões, sem campo: apagar pede confirmação, e
 * esquecer-tudo pede confirmação dupla (o efeito é imediato — o mentor para
 * de usar na hora). No modo leitura do admin não há botão: só a lista.
 */
export function Lembrancas({
  slug,
  fichas,
  fuso,
  agoraIso,
  somenteLeitura,
}: {
  /** O apelido da casa no endereço (para as ações). */
  slug: string;
  /** Da mais nova para a mais velha (a leitura já ordena). */
  fichas: FichaDaLista[];
  /** O fuso da casa: a data vai no relógio dela, nunca no do navegador. */
  fuso: string;
  /** "Agora" da leitura, para o "hoje 10:30". */
  agoraIso: string;
  /** Admin vendo o painel do cliente: lê, não mexe. */
  somenteLeitura: boolean;
}) {
  const router = useRouter();
  const agora = new Date(agoraIso);
  const [itens, setItens] = useState(fichas);
  const [apagandoId, setApagandoId] = useState<string | null>(null);
  const [esquecendo, setEsquecendo] = useState<"confirma" | "certeza" | null>(
    null
  );
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [erro, setErro] = useState<{ id: string; frase: string } | null>(null);

  // O servidor é a fonte da verdade: depois de cada `router.refresh()` as
  // props chegam novas e a vista acompanha.
  useEffect(() => {
    setItens(fichas);
  }, [fichas]);

  const ocupado = ocupadoId !== null;

  function fecharPaineis() {
    setApagandoId(null);
    setEsquecendo(null);
    setErro(null);
  }

  async function confirmarApagar(ficha: FichaDaLista) {
    if (ocupadoId !== null) return;
    setOcupadoId(ficha.id);
    setErro(null);
    try {
      const resultado = await apagarFicha(slug, ficha.id);
      if (resultado.ok) {
        setItens((xs) => xs.filter((x) => x.id !== ficha.id));
        setApagandoId(null);
        router.refresh();
      } else {
        setErro({ id: ficha.id, frase: resultado.error });
      }
    } catch {
      setErro({ id: ficha.id, frase: FRASE_FALHA });
    } finally {
      setOcupadoId(null);
    }
  }

  async function confirmarEsquecerTudo() {
    if (ocupadoId !== null) return;
    setOcupadoId("tudo");
    setErro(null);
    try {
      const resultado = await esquecerTudo(slug);
      if (resultado.ok) {
        setItens([]);
        setEsquecendo(null);
        router.refresh();
      } else {
        setErro({ id: "tudo", frase: resultado.error });
      }
    } catch {
      setErro({ id: "tudo", frase: FRASE_FALHA });
    } finally {
      setOcupadoId(null);
    }
  }

  function linha(ficha: FichaDaLista) {
    const apagando = apagandoId === ficha.id;
    const salvando = ocupadoId === ficha.id;
    return (
      <li
        key={ficha.id}
        className="flex flex-col rounded-xl border bg-background"
      >
        <div className="flex items-start gap-1 p-1.5">
          <div className="min-w-0 flex-1 px-2.5 py-2">
            <span className="number-mono block text-xs text-quiet">
              {ficha.tipo}
            </span>
            <p className="mt-0.5 text-sm">{ficha.texto}</p>
            <span className="number-mono mt-0.5 block text-xs text-quiet">
              {momentoNaCasa(ficha.atualizada_em, agora, fuso)}
            </span>
          </div>
          {somenteLeitura ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 shrink-0 md:size-8"
              aria-label={`Apagar a lembrança "${ficha.texto}"`}
              disabled={ocupado}
              onClick={() => {
                setApagandoId(ficha.id);
                setEsquecendo(null);
                setErro(null);
              }}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </div>
        {apagando && !somenteLeitura ? (
          <div className="flex flex-col gap-3 border-t px-3 py-3">
            <p className="text-sm">
              Apagar esta lembrança? O mentor para de usá-la na próxima
              resposta.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={salvando}
                onClick={() => void confirmarApagar(ficha)}
              >
                Apagar lembrança
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
        {erro?.id === ficha.id ? (
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
    <nav aria-label="Lembranças do mentor" className="flex flex-col gap-5">
      {somenteLeitura || itens.length === 0 ? null : (
        <div className="flex flex-col gap-3 rounded-xl border bg-background p-3">
          {esquecendo === null ? (
            <Button
              type="button"
              variant="outline"
              disabled={ocupado}
              onClick={() => {
                setEsquecendo("confirma");
                setApagandoId(null);
                setErro(null);
              }}
            >
              Esquecer tudo
            </Button>
          ) : null}
          {esquecendo === "confirma" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                Apagar todas as {itens.length}{" "}
                {itens.length === 1 ? "lembrança" : "lembranças"}? O mentor para
                de usar na hora.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={ocupado}
                  onClick={() => setEsquecendo("certeza")}
                >
                  Continuar
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
          {esquecendo === "certeza" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                Tem certeza? Depois não tem como trazer de volta.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={ocupado}
                  onClick={() => void confirmarEsquecerTudo()}
                >
                  Sim, esquecer tudo
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
          {erro?.id === "tudo" ? (
            <p
              role="alert"
              className="text-sm text-destructive first-letter:uppercase"
            >
              {erro.frase}
            </p>
          ) : null}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h2 id="lembrancas-da-casa" className="text-sm font-semibold">
          Lembranças
        </h2>
        {itens.length === 0 ? (
          <p className="text-sm text-quiet">
            O mentor ainda não lembra de nada. O que você contar nas conversas
            aparece aqui.
          </p>
        ) : (
          <ul
            aria-labelledby="lembrancas-da-casa"
            className="flex flex-col gap-2"
          >
            {itens.map((f) => linha(f))}
          </ul>
        )}
      </div>
    </nav>
  );
}
