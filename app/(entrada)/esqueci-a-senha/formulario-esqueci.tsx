"use client";

import { TextField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { pedirNovaSenhaAction } from "@/lib/auth/actions";
import { type EsqueciInput, esqueciSchema } from "@/lib/auth/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";

export function FormularioEsqueci() {
  const [enviando, iniciar] = useTransition();
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<EsqueciInput>({
    resolver: zodResolver(esqueciSchema),
    defaultValues: { email: "" },
  });

  function enviar(valores: EsqueciInput) {
    setErro(null);
    iniciar(async () => {
      const resultado = await pedirNovaSenhaAction(valores);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      setEnviado(true);
    });
  }

  if (enviado) {
    return (
      <div className="flex flex-col gap-4">
        {/* biome-ignore lint/a11y/useSemanticElements: aviso de confirmação em região viva; o <output> é de resultado de cálculo e nasce inline. */}
        <p role="status" className="brand-surface rounded-md p-4 text-sm">
          Se esse e-mail tiver acesso ao repply food., você vai receber um link
          para criar a senha nova. Confira também a caixa de spam.
        </p>
        <Link
          href="/entrar"
          className="flex min-h-11 items-center justify-center text-center text-sm underline underline-offset-4"
        >
          Voltar para entrar
        </Link>
      </div>
    );
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(enviar)}
        className="flex flex-col gap-4"
        noValidate
      >
        <TextField
          name="email"
          control={form.control}
          label="E-mail"
          inputProps={{
            type: "email",
            autoComplete: "email",
            inputMode: "email",
          }}
        />
        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}
        <Button
          type="submit"
          size="toque"
          className="w-full"
          disabled={enviando}
        >
          {enviando ? "Enviando…" : "Mandar o link"}
        </Button>
        <Link
          href="/entrar"
          className="flex min-h-11 items-center justify-center text-center text-sm text-muted-foreground underline underline-offset-4"
        >
          Voltar para entrar
        </Link>
      </form>
    </FormProvider>
  );
}
