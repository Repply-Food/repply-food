"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FiltrosResultados } from "@/lib/metricas/resultados/filtros";
import { MAXIMO_DIAS_ESCOLHIDOS } from "@/lib/metricas/resultados/filtros";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";

const atalhos = [
  ["hoje", "Hoje"],
  ["7d", "7 dias"],
  ["mes", "Mês"],
] as const;

function diferencaEmDias(inicio: string, fim: string): number | null {
  const dataInicio = new Date(`${inicio}T00:00:00Z`);
  const dataFim = new Date(`${fim}T00:00:00Z`);
  if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) {
    return null;
  }
  return (
    Math.round((dataFim.getTime() - dataInicio.getTime()) / 86_400_000) + 1
  );
}

function dataMinima(fim: string): string {
  const data = new Date(`${fim}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() - (MAXIMO_DIAS_ESCOLHIDOS - 1));
  return data.toISOString().slice(0, 10);
}

export function ControlesResultados({
  filtros,
  slug,
}: {
  filtros: FiltrosResultados;
  slug: string;
}) {
  const router = useRouter();
  const [escolhendo, setEscolhendo] = useState(filtros.atalho === "escolher");
  const [inicio, setInicio] = useState(
    filtros.atalho === "escolher" ? filtros.inicio : ""
  );
  const [fim, setFim] = useState(
    filtros.atalho === "escolher" ? filtros.fim : ""
  );
  const [erro, setErro] = useState<string | null>(null);

  function navegar(parametros: URLSearchParams) {
    router.push(`/r/${slug}/resultados?${parametros.toString()}`);
  }

  function paraAtalho(periodo: "hoje" | "7d" | "mes") {
    const parametros = new URLSearchParams(filtros.query);
    parametros.set("periodo", periodo);
    parametros.delete("inicio");
    parametros.delete("fim");
    setEscolhendo(false);
    setErro(null);
    navegar(parametros);
  }

  function paraComparacao(comparacao: "anterior" | "semana") {
    const parametros = new URLSearchParams(filtros.query);
    parametros.set("comparacao", comparacao);
    navegar(parametros);
  }

  function atualizarEscolha(proximoInicio: string, proximoFim: string) {
    setInicio(proximoInicio);
    setFim(proximoFim);
    const dias = diferencaEmDias(proximoInicio, proximoFim);
    if (dias === null || dias < 1 || dias > MAXIMO_DIAS_ESCOLHIDOS) {
      setErro(`Escolha um período de até ${MAXIMO_DIAS_ESCOLHIDOS} dias.`);
      return;
    }

    const parametros = new URLSearchParams(filtros.query);
    parametros.set("periodo", "escolher");
    parametros.set("inicio", proximoInicio);
    parametros.set("fim", proximoFim);
    setErro(null);
    navegar(parametros);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" aria-label="Período">
          {atalhos.map(([periodo, rotulo]) => (
            <Button
              key={periodo}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={!escolhendo && filtros.atalho === periodo}
              onClick={() => paraAtalho(periodo)}
            >
              {rotulo}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={escolhendo}
            onClick={() => {
              setEscolhendo(true);
              setInicio(filtros.atalho === "escolher" ? filtros.inicio : "");
              setFim(filtros.atalho === "escolher" ? filtros.fim : "");
              setErro(null);
            }}
          >
            Escolher período
          </Button>
        </div>
        <a
          className={buttonVariants({ size: "sm" })}
          href={`/r/${slug}/resultados/pdf?${filtros.query}`}
        >
          Baixar PDF
        </a>
      </div>

      {escolhendo ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label
            className="grid gap-1 text-sm font-medium"
            htmlFor="inicio-resultados"
          >
            Data inicial
            <Input
              id="inicio-resultados"
              type="date"
              min={dataMinima(fim || filtros.fim)}
              max={fim || filtros.fim}
              value={inicio}
              aria-invalid={erro ? true : undefined}
              onChange={(evento) => atualizarEscolha(evento.target.value, fim)}
            />
          </label>
          <label
            className="grid gap-1 text-sm font-medium"
            htmlFor="fim-resultados"
          >
            Data final
            <Input
              id="fim-resultados"
              type="date"
              min={inicio}
              max={filtros.fim}
              value={fim}
              aria-invalid={erro ? true : undefined}
              onChange={(evento) =>
                atualizarEscolha(inicio, evento.target.value)
              }
            />
          </label>
          {erro ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {erro}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-quiet">Comparar com</span>
        {(
          [
            ["anterior", "período anterior"],
            ["semana", "mesmo dia da semana"],
          ] as const
        ).map(([comparacao, rotulo]) => (
          <button
            key={comparacao}
            type="button"
            aria-pressed={filtros.comparacao === comparacao}
            className={cn(
              "rounded-md px-2 py-1 font-medium underline decoration-primary-hover underline-offset-4",
              filtros.comparacao === comparacao && "bg-muted no-underline"
            )}
            onClick={() => paraComparacao(comparacao)}
          >
            {rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}
