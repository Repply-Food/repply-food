import { FaixaModoLeitura } from "@/components/painel/faixa-modo-leitura";
import { MolduraPainel } from "@/components/painel/moldura-painel";
import { registrarAberturaDoPainel } from "@/lib/admin/registro";
import { podeTrocarDeCasa } from "@/lib/auth/destino";
import { exigirCasa } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { seloDaLeitura } from "@/lib/painel/selo";
import { createClient } from "@/lib/supabase/server";
import type { ReactNode } from "react";

export default async function LayoutCasa({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { sessao, casa, modoAdmin } = await exigirCasa(slug);

  // A RLS só devolve o sinal de vida de quem tem acesso à casa. Ao mesmo
  // tempo, o admin abrindo o painel entra no histórico, no máximo uma vez por
  // hora (D-59); isso nunca impede o painel de abrir.
  const supabase = await createClient();
  const [{ data: sinal, error }] = await Promise.all([
    supabase
      .from("sinal_de_vida")
      .select("estado, ultimo_envio_ok_em")
      .eq("restaurante_id", casa.id)
      .maybeSingle(),
    modoAdmin ? registrarAberturaDoPainel(casa.id) : Promise.resolve(),
  ]);

  // Falha na leitura não pode virar "aguardando o 1º envio" (falso para quem já
  // envia): o selo fica neutro, e o log leva só o código.
  if (error) logError("falha_leitura_sinal");

  const selo = seloDaLeitura({
    dados: sinal,
    erro: error,
    agora: new Date(),
    fuso: casa.fuso,
  });

  return (
    <MolduraPainel
      casa={{ nome: casa.nome, slug: casa.slug }}
      selo={selo}
      faixa={
        modoAdmin ? (
          <FaixaModoLeitura nome={casa.nome} restauranteId={casa.id} />
        ) : null
      }
      trocarDeCasa={podeTrocarDeCasa(sessao)}
    >
      {children}
    </MolduraPainel>
  );
}
