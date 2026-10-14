"use client";

import { TextField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { entrarAction } from "@/lib/auth/actions";
import { MENSAGEM_LOGIN_RECUSADO } from "@/lib/auth/erros";
import { safeNextOr } from "@/lib/auth/safe-next";
import { type EntrarInput, entrarSchema } from "@/lib/auth/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";

export function FormularioEntrar({ next }: { next: string | null }) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<EntrarInput>({
    resolver: zodResolver(entrarSchema),
    defaultValues: { email: "", senha: "" },
  });

  function enviar(valores: EntrarInput) {
    setErro(null);
    iniciar(async () => {
      const resultado = await entrarAction(valores);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      const destino = resultado.data?.destino ?? "/";
      // Troca de senha pendente vem antes de qualquer `next` (o porteiro também força).
      router.push(
        destino === "/trocar-senha" ? destino : safeNextOr(next, destino)
      );
    });
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
        <TextField
          name="senha"
          control={form.control}
          label="Senha"
          inputProps={{ type: "password", autoComplete: "current-password" }}
        />
        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
            {/* O convite só faz sentido quando a credencial foi recusada; no
                limite de tentativas e na falha genérica, é só a frase. */}
            {erro === MENSAGEM_LOGIN_RECUSADO ? (
              <>
                {" "}
                <Link
                  href="/esqueci-a-senha"
                  className="font-bold underline underline-offset-4"
                >
                  Criar uma senha nova
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        <Button
          type="submit"
          size="toque"
          className="w-full"
          disabled={enviando}
        >
          {enviando ? "Entrando…" : "Entrar"}
        </Button>
        <Link
          href="/esqueci-a-senha"
          className="flex min-h-11 items-center justify-center text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Esqueci a senha
        </Link>
      </form>
    </FormProvider>
  );
}
