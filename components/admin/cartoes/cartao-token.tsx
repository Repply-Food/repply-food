"use client";

import { Cartao } from "@/components/admin/cartao";
import { Confirmacao } from "@/components/admin/confirmacao";
import { QuadroCopieAgora } from "@/components/admin/quadro-copie-agora";
import { useHidratado } from "@/components/forms/use-hidratado";
import { Button } from "@/components/ui/button";
import { gerarTokenAction, revogarTokensAction } from "@/lib/admin/actions";
import { dataCurtaNaCasa, horaNaCasa } from "@/lib/admin/datas";
import { mascararToken } from "@/lib/admin/texto";
import type { DetalheDoRestaurante, TokenGerado } from "@/lib/admin/tipos";
import { tempoDesde } from "@/lib/painel/selo";
import { useState, useTransition } from "react";
import { toast } from "sonner";

const BOTAO = "md:h-9 md:text-sm";

/**
 * Cartão 2 (desenho §1.1, D-38). O token completo aparece uma única vez,
 * logo depois de gerado; o quadro vive no estado da tela e some ao sair da
 * página. "Usado há…" é o último uso do token mais novo.
 */
export function CartaoToken({ detalhe }: { detalhe: DetalheDoRestaurante }) {
  const { restaurante, tokens } = detalhe;
  const [atual, ...anteriores] = tokens;
  const hidratado = useHidratado();
  const [etapa, setEtapa] = useState<"nada" | "trocar" | "revogar">("nada");
  const [antigo, setAntigo] = useState<"agora" | "24h">("agora");
  const [gerado, setGerado] = useState<TokenGerado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function gerar(quando: "agora" | "24h") {
    setErro(null);
    iniciar(async () => {
      const resultado = await gerarTokenAction(restaurante.id, quando);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      if (resultado.data) setGerado(resultado.data);
      setEtapa("nada");
    });
  }

  function revogar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await revogarTokensAction(restaurante.id);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      setGerado(null);
      setEtapa("nada");
      toast.success(
        "Token revogado. O SCC para de enviar até receber um token novo."
      );
    });
  }

  return (
    <Cartao titulo="Token de envio">
      {gerado ? (
        <QuadroCopieAgora
          titulo="Copie agora: este token não aparece de novo"
          rotulo="Token"
          valor={gerado.token}
          copias={[
            { rotulo: "Copiar token", texto: gerado.token },
            {
              rotulo: "Copiar instruções para a SCC",
              texto: gerado.instrucoes,
            },
          ]}
        />
      ) : null}

      {atual ? (
        <div className="flex flex-col gap-1 text-sm">
          <span className="number-mono font-bold">
            {mascararToken(atual.prefixo)}
          </span>
          <span className="text-quiet">
            {`criado ${dataCurtaNaCasa(atual.criadoEm, restaurante.fuso)} por ${atual.criadoPor}`}
          </span>
          <span className="text-quiet">
            {atual.ultimoUsoEm
              ? `usado ${tempoDesde(new Date(atual.ultimoUsoEm), new Date(detalhe.agoraIso))}`
              : "ainda não usado"}
          </span>
          {anteriores.map((token) =>
            token.expiraEm ? (
              <span key={token.id} className="text-quiet">
                {`O token anterior (${mascararToken(token.prefixo)}) para às ${horaNaCasa(token.expiraEm, restaurante.fuso)} (${dataCurtaNaCasa(token.expiraEm, restaurante.fuso)}).`}
              </span>
            ) : null
          )}
        </div>
      ) : (
        <p className="text-sm text-quiet">
          Esta casa ainda não tem token de envio.
        </p>
      )}

      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}

      {etapa === "trocar" ? (
        <Confirmacao
          texto="Quando o token antigo para de valer?"
          rotuloConfirmar="Gerar novo token"
          enviando={enviando}
          aoConfirmar={() => gerar(antigo)}
          aoCancelar={() => setEtapa("nada")}
        >
          <fieldset className="flex flex-col">
            <legend className="sr-only">Quando o token antigo para</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="antigo"
                checked={antigo === "agora"}
                onChange={() => setAntigo("agora")}
                className="size-4 accent-primary"
              />
              Agora (padrão)
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="antigo"
                checked={antigo === "24h"}
                onChange={() => setAntigo("24h")}
                className="size-4 accent-primary"
              />
              Em 24 horas (o SCC tem um dia para trocar)
            </label>
          </fieldset>
        </Confirmacao>
      ) : etapa === "revogar" ? (
        <Confirmacao
          texto="O SCC para de enviar até receber um token novo."
          rotuloConfirmar="Revogar token"
          enviando={enviando}
          aoConfirmar={revogar}
          aoCancelar={() => setEtapa("nada")}
        />
      ) : atual ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            size="toque"
            className={BOTAO}
            onClick={() => {
              setAntigo("agora");
              setEtapa("trocar");
            }}
          >
            Gerar novo token
          </Button>
          <Button
            type="button"
            variant="outline"
            size="toque"
            className={BOTAO}
            onClick={() => setEtapa("revogar")}
          >
            Revogar token
          </Button>
        </div>
      ) : (
        <form
          method="post"
          onSubmit={(evento) => {
            evento.preventDefault();
            gerar("agora");
          }}
        >
          <Button
            type="submit"
            size="toque"
            className={BOTAO}
            disabled={!hidratado || enviando}
          >
            {enviando ? "Gerando…" : "Gerar token"}
          </Button>
        </form>
      )}
    </Cartao>
  );
}
