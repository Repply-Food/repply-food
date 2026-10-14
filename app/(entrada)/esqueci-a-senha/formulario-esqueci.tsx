"use client";

import { TextField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { pedirNovaSenhaAction } from "@/lib/auth/actions";
import { type EsqueciInput, esqueciSchema } from "@/lib/auth/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";

export function FormularioEsqueci() {
  const [enviando, iniciar] = useTransition();
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const avisoRef = useRef<HTMLOutputElement>(null);
  const form = useForm<EsqueciInput>({
    resolver: zodResolver(esqueciSchema),
    defaultValues: { email: "" },
  });

  useEffect(() => {
    if (enviado) avisoRef.current?.focus();
  }, [enviado]);

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
        {/* O formulário some ao enviar e o foco cairia no <body>; o aviso
            nasce já com texto (alguns leitores não anunciam isso). Levar o
            foco para ele resolve os dois. <output> tem role="status". */}
        <output
          ref={avisoRef}
          tabIndex={-1}
          className="brand-surface block rounded-md p-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Se esse e-mail tiver acesso ao repply food., você vai receber um link
          para criar a senha nova. Confira também a caixa de spam.
        </output>
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
