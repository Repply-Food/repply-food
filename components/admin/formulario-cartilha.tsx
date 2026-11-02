"use client";

import { useHidratado } from "@/components/forms/use-hidratado";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { salvarCartilhaAction } from "@/lib/mentor/cartilha-actions";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState, useTransition } from "react";
import { toast } from "sonner";

const FRASE_INDISPONIVEL =
  "Não foi possível salvar a cartilha agora. Tente de novo em instantes.";

/**
 * O editor da cartilha do mentor: um campo grande e o botão de salvar. Salvar
 * cria uma versão nova (a anterior fica guardada). A tela não decide nada: quem
 * confere admin e texto é `salvarCartilhaAction`, por dentro. `method="post"` e
 * botão desligado até a página carregar (CLAUDE.md §10), como nos outros
 * formulários do admin.
 */
export function FormularioCartilha({ textoInicial }: { textoInicial: string }) {
  const router = useRouter();
  const idDoCampo = useId();
  const hidratado = useHidratado();
  const [enviando, iniciar] = useTransition();
  const [texto, setTexto] = useState(textoInicial);
  const [erro, setErro] = useState<string | null>(null);

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    iniciar(async () => {
      try {
        const resultado = await salvarCartilhaAction(texto);
        if (!resultado.ok) {
          setErro(resultado.error);
          return;
        }
        toast.success(
          "Cartilha salva. O mentor usa o novo texto a partir da próxima resposta."
        );
        // Atualiza o "versão ativa desde…" da página.
        router.refresh();
      } catch {
        // Rede caiu ou a função estourou o tempo: nunca o erro técnico.
        setErro(FRASE_INDISPONIVEL);
      }
    });
  }

  return (
    <form
      method="post"
      onSubmit={enviar}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={idDoCampo}>Texto da cartilha</Label>
        <Textarea
          id={idDoCampo}
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${idDoCampo}-erro` : undefined}
          autoComplete="off"
          spellCheck
          className="min-h-72 max-h-[70dvh] leading-relaxed"
        />
      </div>
      {erro ? (
        <p
          id={`${idDoCampo}-erro`}
          role="alert"
          className="text-sm text-destructive"
        >
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
          {enviando ? "Salvando…" : "Salvar nova versão"}
        </Button>
      </div>
    </form>
  );
}
