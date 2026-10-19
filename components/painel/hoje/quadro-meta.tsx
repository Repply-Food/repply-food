import { Card, CardContent } from "@/components/ui/card";
import { formatarBRL } from "@/lib/format/dinheiro";
import type { DadosDoHoje } from "@/lib/metricas/tipos";
import { cn } from "@/lib/utils";
import { nomeDoMes } from "./formato";

/**
 * A meta do mês (M11, D-33): andamento, barra de progresso e projeção "no
 * ritmo atual". A projeção só aparece quando há meta e dados bastantes para
 * projetar. A cor da barra só diz algo quando há projeção que a sustente: verde
 * se no ritmo, âmbar (status-warning) se a projeção não alcança a meta. Sem
 * projeção (antes do 3º dia) a barra é neutra: verde sugeriria "no ritmo" sem
 * nada que prove. Sem meta cadastrada, só "sem meta definida" — nada de barra
 * fingindo progresso contra um alvo que não existe.
 */
export function QuadroMeta({
  meta,
  fuso,
  agora,
}: {
  meta: DadosDoHoje["meta"];
  fuso: string;
  agora: Date;
}) {
  const rotulo = `Meta de ${nomeDoMes(agora, fuso)}`;

  if (meta.meta === null) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-1">
          <span className="label-mono text-quiet">{rotulo}</span>
          <span className="text-quiet">sem meta definida</span>
        </CardContent>
      </Card>
    );
  }

  const porcento =
    meta.andamento === null ? null : Math.round(meta.andamento * 100);
  const temProjecao = meta.projecaoDisponivel && meta.projecao !== null;
  const risco =
    temProjecao &&
    meta.projecao !== null &&
    Number(meta.projecao) < Number(meta.meta);
  // Verde só com projeção no ritmo; sem projeção, neutra (preenchimento cinza).
  const corDaBarra = !temProjecao
    ? "bg-muted-foreground"
    : risco
      ? "status-warning"
      : "status-success";

  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="label-mono text-quiet">{rotulo}</span>
        <span className="number-mono text-lg font-bold tracking-tight md:text-xl">
          {porcento === null ? "—" : `${porcento}%`}
        </span>
        {porcento === null ? null : (
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-subtle">
            <div
              className={cn("h-full rounded-full", corDaBarra)}
              style={{ width: `${Math.min(100, Math.max(0, porcento))}%` }}
            />
          </div>
        )}
        {temProjecao && meta.projecao !== null ? (
          <span className="mt-1 text-xs text-quiet">
            {`no ritmo atual, fecha em ${formatarBRL(meta.projecao)} (meta ${formatarBRL(meta.meta)})`}
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}
