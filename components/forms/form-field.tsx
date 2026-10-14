"use client";

import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { type ComponentProps, useState } from "react";
import {
  type FieldPath,
  type FieldValues,
  type UseControllerProps,
  useController,
} from "react-hook-form";

type Props<T extends FieldValues, N extends FieldPath<T>> = UseControllerProps<
  T,
  N
> & {
  label: string;
  description?: string;
  inputProps?: ComponentProps<typeof Input>;
};

/**
 * Campo de texto do sistema — é este wrapper que desenha TODOS os campos de
 * formulário, inclusive os seis campos de senha (login, cadastro, redefinir e
 * os dois "confirmar"). Por isso o olho de "ver a senha" mora aqui e não numa
 * tela específica: um componente separado por tela sairia dessincronizado na
 * primeira mudança.
 */
export function TextField<T extends FieldValues, N extends FieldPath<T>>({
  label,
  description,
  inputProps,
  ...controller
}: Props<T, N>) {
  const { field, fieldState } = useController(controller);
  const [senhaVisivel, setSenhaVisivel] = useState(false);

  /* O olho só aparece em campo de SENHA. Num campo comum ele seria um botão sem
     função — o texto já está à vista. */
  const ehSenha = inputProps?.type === "password";
  const invalido = !!fieldState.error;

  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>

      {ehSenha ? (
        /* `InputGroup` é a mesma casca do `Input` (retângulo de 10px, borda
           `--input`, anel de foco laranja) com um encaixe pra botão dentro do
           campo. O `FormControl` abraça o INPUT, não o grupo: ele clona o filho
           pra colar `id` e `aria-describedby`, e num <div> essas amarras
           deixariam de apontar pro campo de verdade. */
        <InputGroup>
          <FormControl>
            <InputGroupInput
              {...inputProps}
              {...field}
              /* Trocar o `type` é o único efeito do botão — o valor nunca sai do
                 campo. O spread do `inputProps` vem ANTES de propósito: assim o
                 `type` daqui vence, e o `autoComplete` (`current-password` /
                 `new-password`) sobrevive intacto pro gerenciador de senha. */
              type={senhaVisivel ? "text" : "password"}
              value={field.value ?? ""}
              aria-invalid={invalido}
            />
          </FormControl>
          <InputGroupAddon align="inline-end">
            {/* `aria-pressed` conta o ESTADO (a senha está à mostra?) e o
                `aria-label` conta a AÇÃO. É um <button> de verdade, então entra
                na ordem de tabulação sozinho — nada de `tabIndex={-1}`, que é o
                atalho comum aqui e tira o recurso de quem usa teclado.
                O ícone é decorativo: quem nomeia o botão é o rótulo.

                ALVO DE TOQUE: o botão desenhado tem 24 px (`icon-xs`), mas o Food
                exige 44 px no celular. O `after:` é um pseudo-elemento invisível
                que estica só a área tocável. O `inset` conta a partir da borda de
                dentro do botão (24 − 2 × 1 px de borda = 22 px), por isso 11 px de
                cada lado: 22 + 2 × 11 = 44 px, que cabe na altura do campo no
                celular. O visual não muda. Nenhum ancestral (grupo, encaixe) tem
                `overflow-hidden`, então a área não é cortada. */}
            <InputGroupButton
              size="icon-xs"
              className="relative after:absolute after:-inset-[11px]"
              aria-pressed={senhaVisivel}
              aria-label={senhaVisivel ? "Ocultar senha" : "Mostrar senha"}
              onClick={() => setSenhaVisivel((visivel) => !visivel)}
            >
              {senhaVisivel ? (
                <EyeOffIcon aria-hidden />
              ) : (
                <EyeIcon aria-hidden />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <FormControl>
          <Input
            {...inputProps}
            {...field}
            value={field.value ?? ""}
            aria-invalid={invalido}
          />
        </FormControl>
      )}

      {description && <FormDescription>{description}</FormDescription>}
      {fieldState.error && (
        <FormMessage>{fieldState.error.message}</FormMessage>
      )}
    </FormItem>
  );
}
