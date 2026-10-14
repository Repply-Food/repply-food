import { MolduraPainel } from "@/components/painel/moldura-painel";
import { exigirCasa } from "@/lib/auth/sessao";
import { estadoDoSinal, seloDoSinal } from "@/lib/painel/selo";
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
  const { casa } = await exigirCasa(slug);

  // A RLS só devolve o sinal de vida de quem tem acesso à casa.
  const supabase = await createClient();
  const { data: sinal } = await supabase
    .from("sinal_de_vida")
    .select("estado, ultimo_envio_ok_em")
    .eq("restaurante_id", casa.id)
    .maybeSingle();

  const selo = seloDoSinal({
    estado: estadoDoSinal(sinal?.estado),
    ultimoEnvioOkEm: sinal?.ultimo_envio_ok_em ?? null,
    agora: new Date(),
    fuso: casa.fuso,
  });

  return (
    <MolduraPainel casa={{ nome: casa.nome, slug: casa.slug }} selo={selo}>
      {children}
    </MolduraPainel>
  );
}
