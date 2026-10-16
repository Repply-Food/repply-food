"use client";

import { EditorHorario } from "@/components/admin/editor-horario";
import { RotuloComDica } from "@/components/forms/dica-do-campo";
import { TextField } from "@/components/forms/form-field";
import { useHidratado } from "@/components/forms/use-hidratado";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  cadastrarRestauranteAction,
  editarRestauranteAction,
} from "@/lib/admin/actions";
import {
  DICA_CNPJ,
  DICA_DIA_VIRA,
  DICA_FUSO,
} from "@/lib/admin/dicas-dos-campos";
import { FUSOS_DO_BRASIL } from "@/lib/admin/fusos";
import { mensagemDaEdicao } from "@/lib/admin/mensagens";
import { type RestauranteInput, restauranteSchema } from "@/lib/admin/schemas";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

const CLASSE_DO_SELETOR =
  "h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm";
const HORAS = Array.from({ length: 24 }, (_, hora) => String(hora));

/**
 * Início da frase que `editarRestauranteAction` devolve (com `ok: false`) no
 * caso raro em que os dados foram salvos mas o dia de operação das contas não
 * foi recalculado. Não é "não salvou": a tela mostra como aviso, não como erro.
 * `tests/admin/formulario-restaurante.test.tsx` confere que `actions.ts` ainda
 * começa a frase assim.
 */
const INICIO_DO_AVISO_SEM_RECALCULO =
  "Os dados foram salvos, mas o dia de operação das contas não foi recalculado";

/** A mensagem de troca de fuso é longa: dá tempo de ler antes de sumir. */
const TEMPO_DO_AVISO_LONGO_MS = 12_000;

type Props =
  | { modo: "cadastro"; valoresIniciais: RestauranteInput }
  | {
      modo: "edicao";
      restauranteId: string;
      valoresIniciais: RestauranteInput;
    };

/**
 * Cadastro e edição do restaurante (mesmo formulário, desenho §1.1). O `slug`
 * sai do nome só no cadastro. O servidor confere tudo de novo com o mesmo
 * esquema. `method="post"` e botão desligado até a página carregar.
 */
export function FormularioRestaurante(props: Props) {
  const router = useRouter();
  const hidratado = useHidratado();
  const [enviando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const form = useForm<RestauranteInput>({
    resolver: zodResolver(restauranteSchema),
    defaultValues: props.valoresIniciais,
  });
  const voltarPara =
    props.modo === "edicao"
      ? `/admin/restaurantes/${props.restauranteId}`
      : "/admin";

  function enviar(valores: RestauranteInput) {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      if (props.modo === "cadastro") {
        const resultado = await cadastrarRestauranteAction(valores);
        if (!resultado.ok) {
          setErro(resultado.error);
          return;
        }
        toast.success("Restaurante cadastrado. Agora gere o token de envio.");
        router.push(
          resultado.data ? `/admin/restaurantes/${resultado.data.id}` : "/admin"
        );
        return;
      }
      const resultado = await editarRestauranteAction(
        props.restauranteId,
        valores
      );
      if (!resultado.ok) {
        if (resultado.error.startsWith(INICIO_DO_AVISO_SEM_RECALCULO)) {
          // Salvou; só o recálculo falhou. Fica na tela, com o aviso à vista.
          setAviso(resultado.error);
          return;
        }
        setErro(resultado.error);
        return;
      }
      toast.success(
        mensagemDaEdicao(resultado.data),
        resultado.data?.mudouFuso
          ? { duration: TEMPO_DO_AVISO_LONGO_MS }
          : undefined
      );
      router.push(voltarPara);
    });
  }

  return (
    <FormProvider {...form}>
      <form
        method="post"
        onSubmit={form.handleSubmit(enviar)}
        className="flex flex-col gap-6"
        noValidate
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            name="nome"
            control={form.control}
            label="Nome"
            inputProps={{ autoComplete: "off" }}
          />
          <TextField
            name="cnpj"
            control={form.control}
            label="CNPJ (opcional)"
            dica={DICA_CNPJ}
            inputProps={{ autoComplete: "off" }}
          />
          <FormField
            control={form.control}
            name="fuso"
            render={({ field }) => (
              <FormItem>
                <RotuloComDica label="Fuso" dica={DICA_FUSO} />
                <FormControl>
                  <select {...field} className={CLASSE_DO_SELETOR}>
                    {FUSOS_DO_BRASIL.map((fuso) => (
                      <option key={fuso.valor} value={fuso.valor}>
                        {fuso.rotulo}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="horaVirada"
            render={({ field }) => (
              <FormItem>
                <RotuloComDica label="O dia vira às" dica={DICA_DIA_VIRA} />
                <FormControl>
                  <select {...field} className={CLASSE_DO_SELETOR}>
                    {HORAS.map((hora) => (
                      <option key={hora} value={hora}>
                        {`${hora}h`}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <EditorHorario />

        {props.modo === "edicao" ? (
          <p className="text-sm text-quiet">
            Mudar o fuso ou a hora da virada recalcula o dia de operação das
            contas desta casa.
          </p>
        ) : null}
        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}
        {aviso ? (
          <output className="brand-surface flex flex-col gap-2 rounded-lg p-3 text-sm">
            <span>{aviso}</span>
            <Link
              href={voltarPara}
              className="inline-flex min-h-11 w-fit items-center underline underline-offset-4"
            >
              Voltar ao restaurante
            </Link>
          </output>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            size="toque"
            className="md:h-9 md:text-sm"
            disabled={!hidratado || enviando}
          >
            {enviando
              ? "Salvando…"
              : props.modo === "cadastro"
                ? "Cadastrar restaurante"
                : "Salvar"}
          </Button>
          <Link
            href={voltarPara}
            className={cn(
              buttonVariants({ variant: "ghost", size: "toque" }),
              "md:h-9 md:text-sm"
            )}
          >
            Cancelar
          </Link>
        </div>
      </form>
    </FormProvider>
  );
}
