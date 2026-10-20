"use client";

import { CampoDinheiro } from "@/components/forms/campo-dinheiro";
import { useHidratado } from "@/components/forms/use-hidratado";
import { Button } from "@/components/ui/button";
import { salvarMetaAction } from "@/lib/painel/ajustes-actions";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** "2026-10-01" -> "outubro de 2026" (data civil, sem fuso). */
function rotuloMes(iso: string): string {
  const [ano, mes] = iso.split("-").map(Number);
  return `${MESES[(mes ?? 1) - 1]} de ${ano}`;
}

/** Soma `delta` meses a um "YYYY-MM-01" e devolve outro "YYYY-MM-01". */
function mesVizinho(iso: string, delta: number): string {
  const [ano, mes] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

type Meta = { mes: string; valor: string };

export function SecaoMeta({
  slug,
  metas,
  mesAtualISO,
  somenteLeitura,
}: {
  slug: string;
  metas: Meta[];
  mesAtualISO: string;
  somenteLeitura: boolean;
}) {
  const router = useRouter();
  const idCampo = useId();
  const hidratado = useHidratado();
  const [salvando, iniciarSalvar] = useTransition();
  const [mes, setMes] = useState(mesAtualISO);
  const valorDoMes = (iso: string) =>
    metas.find((m) => m.mes === iso)?.valor ?? "";
  const valorAnterior = (iso: string) =>
    metas.filter((m) => m.mes < iso).sort((a, b) => (a.mes < b.mes ? 1 : -1))[0]
      ?.valor ?? "";
  const [valor, setValor] = useState(() => valorDoMes(mesAtualISO));
  const [sujo, setSujo] = useState(false);

  function irPara(delta: number) {
    if (
      sujo &&
      !window.confirm("Você mudou a meta e não salvou. Descartar a mudança?")
    ) {
      return;
    }
    const novo = mesVizinho(mes, delta);
    setMes(novo);
    setValor(valorDoMes(novo));
    setSujo(false);
  }

  function salvar() {
    iniciarSalvar(async () => {
      const r = await salvarMetaAction(slug, mes, valor);
      if (r.ok) {
        toast.success(valor === "" ? "Meta removida." : "Meta salva.");
        setSujo(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const anterior = valorAnterior(mes);

  return (
    <section className="brand-surface flex flex-col gap-4 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <h2 className="text-lg font-semibold">Meta do mês</h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 md:size-9"
            disabled={salvando}
            aria-label="mês anterior"
            onClick={() => irPara(-1)}
          >
            ‹
          </Button>
          <span aria-live="polite" className="min-w-36 text-center font-medium">
            {rotuloMes(mes)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 md:size-9"
            disabled={salvando}
            aria-label="próximo mês"
            onClick={() => irPara(1)}
          >
            ›
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={idCampo} className="text-sm text-quiet">
          Meta de faturamento
        </label>
        <CampoDinheiro
          id={idCampo}
          value={valor}
          onChange={(v) => {
            setValor(v);
            setSujo(true);
          }}
          disabled={somenteLeitura || salvando}
        />
      </div>

      {somenteLeitura ? null : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="toque"
            disabled={!anterior || !hidratado || salvando}
            onClick={() => {
              setValor(anterior);
              setSujo(true);
            }}
          >
            Copiar do mês anterior
          </Button>
          <Button
            type="button"
            size="toque"
            disabled={!hidratado || salvando || !sujo}
            onClick={salvar}
          >
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      )}
    </section>
  );
}
