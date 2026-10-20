"use server";

import { exigirCasa } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { metaSchema, turnosSchema } from "./ajustes-schemas";

type Resultado = { ok: true } | { ok: false; error: string };

const ERRO_ADMIN = "Só o dono muda isto. A Repply vê em modo leitura.";
const ERRO_GENERICO = "Não deu para salvar agora. Tente de novo.";

export async function salvarMetaAction(
  slug: string,
  mesISO: string,
  valor: string
): Promise<Resultado> {
  // Guarda primeiro (convenção "toda função do servidor confere por dentro").
  const { casa, modoAdmin } = await exigirCasa(slug);
  if (modoAdmin) return { ok: false, error: ERRO_ADMIN };

  const dados = metaSchema.safeParse({ mes: mesISO, valor });
  if (!dados.success)
    return {
      ok: false,
      error: dados.error.issues[0]?.message ?? ERRO_GENERICO,
    };

  const supabase = await createClient();

  if (dados.data.valor === "") {
    // Remover a meta do mês (volta a herdar o anterior na tela Hoje).
    // 0 linhas aqui é legítimo: apagar um mês sem meta é idempotente, e como o
    // restaurante_id vem da sessão não há recusa silenciosa da RLS. Não conferir.
    const { error } = await supabase
      .from("metas")
      .delete()
      .eq("restaurante_id", casa.id)
      .eq("mes", dados.data.mes);
    if (error) {
      logError("falha_salvar_meta");
      return { ok: false, error: ERRO_GENERICO };
    }
    return { ok: true };
  }

  // `Number()` só na borda: o tipo gerado de metas.valor é number; o esquema já
  // limitou a 10 dígitos e 2 casas, então a conversão é exata e cabe no banco.
  // Confere a LINHA afetada (armadilha "salvo quando a RLS recusou").
  const { data, error } = await supabase
    .from("metas")
    .upsert(
      {
        restaurante_id: casa.id,
        mes: dados.data.mes,
        valor: Number(dados.data.valor),
      },
      { onConflict: "restaurante_id,mes" }
    )
    .select("mes");
  if (error || !data || data.length === 0) {
    logError("falha_salvar_meta");
    return { ok: false, error: ERRO_GENERICO };
  }
  return { ok: true };
}

export async function salvarTurnosAction(
  slug: string,
  almocoAte: string
): Promise<Resultado> {
  const { casa, modoAdmin } = await exigirCasa(slug);
  if (modoAdmin) return { ok: false, error: ERRO_ADMIN };

  const dados = turnosSchema.safeParse({ almocoAte });
  if (!dados.success)
    return {
      ok: false,
      error: dados.error.issues[0]?.message ?? ERRO_GENERICO,
    };

  const supabase = await createClient();
  // atualizar_turnos confere tem_acesso por dentro e SUBSTITUI o jsonb inteiro.
  // Hoje `turnos` só tem a chave almoco_ate; se um dia ganhar outra, reler antes.
  const { error } = await supabase.rpc("atualizar_turnos", {
    p_restaurante_id: casa.id,
    p_turnos: { almoco_ate: dados.data.almocoAte },
  });
  if (error) {
    logError("falha_salvar_turnos");
    return { ok: false, error: ERRO_GENERICO };
  }
  return { ok: true };
}
