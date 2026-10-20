"use client";

import { Input } from "@/components/ui/input";
import { analisarBRL, formatarBRL } from "@/lib/format/dinheiro";
import { type ComponentProps, useEffect, useState } from "react";

type Props = Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange" | "onFocus" | "onBlur"
> & {
  /** String numérica canônica ("30000.00") ou "" para vazio. */
  value: string;
  onChange: (valor: string) => void;
};

/**
 * Entrada de dinheiro em reais. Mostra "30.000,00" enquanto guarda a string
 * numérica ("30000.00"). Enquanto o campo está em foco, deixa o texto cru para
 * não brigar com quem digita; ao sair (blur) reexibe formatado.
 */
export function CampoDinheiro({ value, onChange, ...rest }: Props) {
  const [texto, setTexto] = useState(
    value ? formatarBRL(value).replace("R$ ", "") : ""
  );
  const [focado, setFocado] = useState(false);

  // Quando o valor muda de fora (ex.: "copiar do mês anterior"), reexibe.
  useEffect(() => {
    if (!focado) setTexto(value ? formatarBRL(value).replace("R$ ", "") : "");
  }, [value, focado]);

  return (
    <Input
      inputMode="decimal"
      {...rest}
      value={texto}
      onFocus={() => setFocado(true)}
      onBlur={() => {
        setFocado(false);
        const n = analisarBRL(texto);
        setTexto(n ? formatarBRL(n).replace("R$ ", "") : "");
      }}
      onChange={(e) => {
        setTexto(e.target.value);
        onChange(analisarBRL(e.target.value) ?? "");
      }}
    />
  );
}
