"use client";

import { useState } from "react";

function mensagemErro(status: number): string {
  if (status === 409)
    return "Os dados mudaram durante a exportação. Atualize o relatório e tente novamente.";
  if (status === 422)
    return "Confira as datas, os filtros ou o limite de linhas do relatório.";
  return "Não foi possível gerar o PDF agora. Tente novamente.";
}

function nomeArquivo(resposta: Response): string {
  const cabecalho = resposta.headers.get("content-disposition") ?? "";
  const nome = cabecalho.match(/filename="([a-z0-9-]+\.pdf)"/i)?.[1];
  return nome ?? "relatorio.pdf";
}

export function BaixarPdfRelatorio({ href }: { href: string }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function baixar() {
    if (carregando) return;
    setCarregando(true);
    setErro("");
    try {
      const resposta = await fetch(href, { cache: "no-store" });
      if (!resposta.ok) {
        setErro(mensagemErro(resposta.status));
        return;
      }

      const endereco = URL.createObjectURL(await resposta.blob());
      const link = document.createElement("a");
      link.href = endereco;
      link.download = nomeArquivo(resposta);
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(endereco), 1000);
    } catch {
      setErro("Não foi possível gerar o PDF agora. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={baixar}
        disabled={carregando}
        aria-busy={carregando}
        className="h-10 rounded-md bg-primary px-4 font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-60"
      >
        {carregando ? "Gerando PDF…" : "Baixar PDF"}
      </button>
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
