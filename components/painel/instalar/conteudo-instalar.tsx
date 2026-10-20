"use client";

import { Button } from "@/components/ui/button";
import {
  dispararInstalar,
  inscreverInstalar,
  temEventoInstalar,
} from "@/lib/painel/evento-instalar";
import { detectar } from "@/lib/painel/guia-instalar";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

type Aparelho = "iphone" | "android";

const OPCOES: { valor: Aparelho; rotulo: string }[] = [
  { valor: "iphone", rotulo: "iPhone" },
  { valor: "android", rotulo: "Android" },
];

/** Os passos de "colocar na tela inicial", com a chave iPhone/Android (D-36).
 *  Começa no aparelho reconhecido; o dono pode trocar. */
export function ConteudoInstalar() {
  const [aparelho, setAparelho] = useState<Aparelho>(() =>
    detectar().ehIOS ? "iphone" : "android"
  );
  const [temBotao, setTemBotao] = useState(false);

  useEffect(() => {
    setTemBotao(temEventoInstalar());
    return inscreverInstalar(() => setTemBotao(temEventoInstalar()));
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">Coloque o app na sua tela inicial</p>
      <p className="text-sm text-quiet">
        Assim ele abre como um aplicativo, sem precisar procurar no navegador.
      </p>

      {/* Chave iPhone/Android (D-36): mesmo padrão visual do SeletorTema. */}
      <div
        // biome-ignore lint/a11y/useSemanticElements: grupo de botões de alternância com `aria-label`; o <fieldset> traria borda, largura mínima e legenda do navegador.
        role="group"
        aria-label="Tipo de celular"
        className="inline-flex w-fit rounded-md border p-1"
      >
        {OPCOES.map(({ valor, rotulo }) => (
          <button
            key={valor}
            type="button"
            aria-pressed={aparelho === valor}
            onClick={() => setAparelho(valor)}
            className={cn(
              "h-11 min-w-20 rounded px-3 text-sm",
              aparelho === valor
                ? "brand-action font-bold"
                : "text-muted-foreground"
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aparelho === "iphone" ? (
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
          <li>
            No Safari, toque em <b>Compartilhar</b> (o quadrado com a seta para
            cima), embaixo da tela.
          </li>
          <li>
            <b>Role</b> e escolha <b>Adicionar à Tela de Início</b>.
          </li>
          <li>
            Toque em <b>Adicionar</b>, no canto de cima.
          </li>
        </ol>
      ) : (
        <div className="flex flex-col gap-2">
          {temBotao ? (
            <>
              <Button
                type="button"
                size="toque"
                onClick={() => void dispararInstalar()}
              >
                Instalar o repply food
              </Button>
              <p className="text-sm text-quiet">
                O Android vai perguntar "Instalar app?". Toque em{" "}
                <b>Instalar</b>.
              </p>
            </>
          ) : null}
          <p className="text-sm text-quiet">
            {temBotao ? "Se o botão não aparecer:" : "No Chrome:"}
          </p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
            <li>
              Toque nos <b>três pontinhos</b> (⋮), no canto de cima.
            </li>
            <li>
              Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
