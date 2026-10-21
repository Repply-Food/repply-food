import { Card, CardContent } from "@/components/ui/card";
import { formatarBRL } from "@/lib/format/dinheiro";
import type { DadosDeResultados } from "@/lib/metricas/resultados/tipos";
import { GraficoHoras } from "./grafico-horas";
import { MapaCalor } from "./mapa-calor";

function formatarPermanencia(valor: string | null) {
  if (!valor) return "—";
  const [horas, minutos] = valor.split(":");
  return `${horas}h${minutos}`;
}

export function AbaHorarios({ dados }: { dados: DadosDeResultados }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-5">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div>
            <span className="label-mono text-quiet">Faturamento por hora</span>
            <p className="text-xs text-quiet">Concentração das contas pagas.</p>
          </div>
          {dados.horas.length > 0 ? (
            <GraficoHoras horas={dados.horas} />
          ) : (
            <p className="text-sm text-quiet">Sem movimento no período</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div>
            <span className="label-mono text-quiet">Dias e horários</span>
            <p className="text-xs text-quiet">
              Média de contas por ocorrência. Cada célula traz o valor em texto.
            </p>
          </div>
          <MapaCalor mapa={dados.mapa} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 md:col-span-2 md:gap-5">
        {dados.turnos.length > 0 ? (
          dados.turnos.map((turno) => (
            <Card key={turno.turno} size="sm">
              <CardContent className="flex flex-col gap-1">
                <span className="label-mono text-quiet">{turno.turno}</span>
                <strong className="number-mono text-lg">
                  {formatarBRL(turno.faturamento)}
                </strong>
                <span className="text-xs text-quiet">
                  {turno.contas} contas · permanência média{" "}
                  {formatarPermanencia(turno.permanenciaMedia)}
                </span>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card size="sm">
            <CardContent>
              <p className="text-sm text-quiet">Sem movimento no período</p>
            </CardContent>
          </Card>
        )}
      </div>
      <p className="text-xs text-quiet md:col-span-2">
        O almoço termina às 17h; depois disso, as contas entram no jantar.
      </p>
    </div>
  );
}
