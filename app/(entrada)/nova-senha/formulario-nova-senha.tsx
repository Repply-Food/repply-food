"use client";

import { TextField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { definirNovaSenhaAction } from "@/lib/auth/actions";
import { type NovaSenhaInput, novaSenhaSchema } from "@/lib/auth/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

export function FormularioNovaSenha() {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<NovaSenhaInput>({
    resolver: zodResolver(novaSenhaSchema),
    defaultValues: { senha: "", confirmacao: "" },
  });

  function enviar(valores: NovaSenhaInput) {
    setErro(null);
    iniciar(async () => {
      const resultado = await definirNovaSenhaAction(valores);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      toast.success("Senha nova salva.");
      router.push(resultado.data?.destino ?? "/");
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
          name="senha"
          control={form.control}
          label="Senha nova"
          inputProps={{ type: "password", autoComplete: "new-password" }}
        />
        <TextField
          name="confirmacao"
          control={form.control}
          label="Repita a senha nova"
          inputProps={{ type: "password", autoComplete: "new-password" }}
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
          {enviando ? "Salvando…" : "Salvar e continuar"}
        </Button>
      </form>
    </FormProvider>
  );
}
