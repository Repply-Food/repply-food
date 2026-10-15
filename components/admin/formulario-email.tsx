"use client";

import { TextField } from "@/components/forms/form-field";
import { useHidratado } from "@/components/forms/use-hidratado";
import { Button } from "@/components/ui/button";
import { type EmailInput, emailSchema } from "@/lib/admin/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";

/**
 * Um e-mail e um botão: "Criar login" e "Trocar e-mail". `aoEnviar` devolve a
 * frase do erro, ou `null` se deu certo. `method="post"` e botão desligado até
 * a página carregar (CLAUDE.md §10).
 */
export function FormularioEmail({
  rotulo,
  botao,
  aviso,
  aoEnviar,
  aoCancelar,
}: {
  rotulo: string;
  botao: string;
  aviso?: string;
  aoEnviar: (valores: EmailInput) => Promise<string | null>;
  aoCancelar?: () => void;
}) {
  const hidratado = useHidratado();
  const [enviando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<EmailInput>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  function enviar(valores: EmailInput) {
    setErro(null);
    iniciar(async () => {
      const problema = await aoEnviar(valores);
      if (problema) setErro(problema);
      else form.reset({ email: "" });
    });
  }

  return (
    <FormProvider {...form}>
      <form
        method="post"
        onSubmit={form.handleSubmit(enviar)}
        className="flex flex-col gap-3"
        noValidate
      >
        <TextField
          name="email"
          control={form.control}
          label={rotulo}
          inputProps={{
            type: "email",
            autoComplete: "off",
            inputMode: "email",
          }}
        />
        {aviso ? <p className="text-sm text-quiet">{aviso}</p> : null}
        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            size="toque"
            className="md:h-9 md:text-sm"
            disabled={!hidratado || enviando}
          >
            {enviando ? "Enviando…" : botao}
          </Button>
          {aoCancelar ? (
            <Button
              type="button"
              variant="ghost"
              size="toque"
              className="md:h-9 md:text-sm"
              onClick={aoCancelar}
              disabled={enviando}
            >
              Cancelar
            </Button>
          ) : null}
        </div>
      </form>
    </FormProvider>
  );
}
