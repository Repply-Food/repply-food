"use client";

import { TextField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { trocarSenhaAction } from "@/lib/auth/actions";
import { type TrocarSenhaInput, trocarSenhaSchema } from "@/lib/auth/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

export function FormularioTrocarSenha({
  pedirSenhaAtual,
  depois,
}: {
  pedirSenhaAtual: boolean;
  /** Para onde ir depois de salvar (já validado pela página); sem ele, o destino da conta. */
  depois: string | null;
}) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<TrocarSenhaInput>({
    resolver: zodResolver(trocarSenhaSchema),
    defaultValues: { senhaAtual: "", senha: "", confirmacao: "" },
  });

  function enviar(valores: TrocarSenhaInput) {
    setErro(null);
    iniciar(async () => {
      const resultado = await trocarSenhaAction(valores);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      toast.success("Senha salva.");
      router.push(depois ?? resultado.data?.destino ?? "/");
    });
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(enviar)}
        className="flex flex-col gap-4"
        noValidate
      >
        {pedirSenhaAtual ? (
          <TextField
            name="senhaAtual"
            control={form.control}
            label="Senha atual"
            inputProps={{ type: "password", autoComplete: "current-password" }}
          />
        ) : null}
        <TextField
          name="senha"
          control={form.control}
          label="Nova senha"
          description="Mínimo de 8 caracteres."
          inputProps={{ type: "password", autoComplete: "new-password" }}
        />
        <TextField
          name="confirmacao"
          control={form.control}
          label="Repita a nova senha"
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
