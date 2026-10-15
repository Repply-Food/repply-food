"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DIAS_DA_SEMANA, type ModoDoDia } from "@/lib/admin/horario";
import type { RestauranteInput } from "@/lib/admin/schemas";
import { useId } from "react";
import { useFormContext, useWatch } from "react-hook-form";

const MODOS: { valor: ModoDoDia; rotulo: string }[] = [
  { valor: "fechado", rotulo: "Fechado" },
  { valor: "um", rotulo: "Um horário" },
  { valor: "dois", rotulo: "Dois horários" },
];

type CampoDeHora = "abre1" | "fecha1" | "abre2" | "fecha2";

function CampoHora({
  dia,
  nomeDoDia,
  campo,
  rotulo,
}: {
  dia: number;
  nomeDoDia: string;
  campo: CampoDeHora;
  rotulo: string;
}) {
  const { register } = useFormContext<RestauranteInput>();
  const id = useId();
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id}>{rotulo}</label>
      {/* O nome acessível leva o dia ("Terça: fecha"): são 7 blocos iguais. */}
      <Input
        id={id}
        type="time"
        step={60}
        aria-label={`${nomeDoDia}: ${rotulo.toLowerCase()}`}
        {...register(`dias.${dia}.${campo}`)}
      />
    </div>
  );
}

/**
 * Horário de funcionamento (D-56): um bloco por dia, de domingo a sábado,
 * "Fechado", "Um horário" ou "Dois horários" (almoço e jantar). Fecha antes de
 * abrir quer dizer que passa da meia-noite. A mesma regra do banco
 * (`problemaNoDia`, via `restauranteSchema`).
 */
export function EditorHorario() {
  const {
    register,
    getValues,
    setValue,
    formState: { errors, isSubmitted },
  } = useFormContext<RestauranteInput>();
  const dias = useWatch<RestauranteInput, "dias">({ name: "dias" });
  const erroGeral = errors.dias?.root?.message ?? errors.dias?.message;

  function copiarParaOsOutros(origem: number) {
    const modelo = getValues(`dias.${origem}`);
    setValue(
      "dias",
      Array.from({ length: 7 }, () => ({ ...modelo })),
      { shouldDirty: true, shouldValidate: isSubmitted }
    );
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">
        Horário de funcionamento
      </legend>
      <p className="text-sm text-quiet">
        Se fecha antes de abrir (por exemplo, das 18:00 às 02:00), o horário
        passa da meia-noite.
      </p>
      {erroGeral ? (
        <p role="alert" className="text-sm text-destructive">
          {erroGeral}
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {DIAS_DA_SEMANA.map(({ dia, longo }) => {
          const modo = dias?.[dia]?.modo ?? "fechado";
          const erroDoDia = errors.dias?.[dia]?.message;
          return (
            <fieldset
              key={dia}
              className="flex flex-col gap-3 rounded-xl border p-3"
            >
              <legend className="px-1 text-sm font-bold">{longo}</legend>
              <div className="flex flex-wrap gap-x-4">
                {MODOS.map(({ valor, rotulo }) => (
                  <label
                    key={valor}
                    className="flex min-h-11 items-center gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      value={valor}
                      className="size-4 accent-primary"
                      {...register(`dias.${dia}.modo`)}
                    />
                    {rotulo}
                  </label>
                ))}
              </div>
              {modo !== "fechado" ? (
                <div className="grid grid-cols-2 gap-2">
                  <CampoHora
                    dia={dia}
                    nomeDoDia={longo}
                    campo="abre1"
                    rotulo="Abre"
                  />
                  <CampoHora
                    dia={dia}
                    nomeDoDia={longo}
                    campo="fecha1"
                    rotulo="Fecha"
                  />
                  {modo === "dois" ? (
                    <>
                      <CampoHora
                        dia={dia}
                        nomeDoDia={longo}
                        campo="abre2"
                        rotulo="Abre de novo"
                      />
                      <CampoHora
                        dia={dia}
                        nomeDoDia={longo}
                        campo="fecha2"
                        rotulo="Fecha de novo"
                      />
                    </>
                  ) : null}
                </div>
              ) : null}
              {erroDoDia ? (
                <p role="alert" className="text-sm text-destructive">
                  {erroDoDia}
                </p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="toque"
                className="w-fit md:h-9 md:text-sm"
                onClick={() => copiarParaOsOutros(dia)}
              >
                Copiar para os outros dias
              </Button>
            </fieldset>
          );
        })}
      </div>
    </fieldset>
  );
}
