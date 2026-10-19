import { AtualizaHoje } from "@/components/painel/hoje/atualiza-hoje";
import { CartaoFaturamento } from "@/components/painel/hoje/cartao-faturamento";
import { ContasEsquecidas } from "@/components/painel/hoje/contas-esquecidas";
import {
  diaDaSemana,
  diaDoMes,
  horaCurta,
  limiteEmTexto,
  nomeDoMes,
} from "@/components/painel/hoje/formato";
import { QuadroMeta } from "@/components/painel/hoje/quadro-meta";
import { QuadrosDoDia } from "@/components/painel/hoje/quadros-do-dia";
import { exigirCasa } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { obterHoje } from "@/lib/metricas/hoje";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Hoje · repply food." };

/**
 * A tela que o dono abre durante o expediente (fiel a `docs/telas/hoje.html`):
 * o faturamento da casa de hoje com a taxa à parte (D-14) e a curva acumulada,
 * os três quadros (mesas, pessoas, por pessoa), o alerta de contas esquecidas
 * quando existe (D-33) e a meta do mês. Atualiza sozinha a cada ~1 min.
 *
 * A sessão (`exigirCasa`) não carrega o limite de conta esquecida, nem a hora
 * de virada; só o fuso. Os três campos vêm de `restaurantes` por um select
 * simples, já atrás do guarda de acesso (a RLS de `restaurantes` ainda confere).
 * Falha de leitura vira a tela de erro, nunca número errado.
 */
export default async function PaginaHoje({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { casa } = await exigirCasa(slug);

  const supabase = await createClient();
  const { data: config, error } = await supabase
    .from("restaurantes")
    .select("fuso, hora_virada, limite_conta_esquecida")
    .eq("id", casa.id)
    .maybeSingle();
  if (error || !config) {
    logError("falha_metricas_hoje");
    throw new Error("falha_leitura_hoje");
  }

  const dados = await obterHoje(casa.id, config.limite_conta_esquecida);
  const agora = new Date();
  // "05:00:00" → 5: a hora inteira da virada, para o eixo de horas da curva.
  const horaDeVirada = Number.parseInt(config.hora_virada, 10) || 0;
  // "sexta, 9 de outubro · 21h40", no fuso da casa: o cabeçalho do computador.
  const dataEHora = `${diaDaSemana(agora, config.fuso).singular}, ${diaDoMes(agora, config.fuso)} de ${nomeDoMes(agora, config.fuso)} · ${horaCurta(agora, config.fuso)}`;
  const temEsquecidas = dados.contasEsquecidas.length > 0;

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {/* No celular o título fica só para o leitor de tela (a moldura já traz o
          selo "há X min"); no computador (`md:`) aparece com a data e a hora. */}
      <h1 className="sr-only md:not-sr-only md:text-lg md:font-semibold md:tracking-tight">
        Hoje
        <span className="hidden font-sans text-[0.7rem] font-normal tracking-normal text-quiet md:mt-0.5 md:block">
          {dataEHora}
        </span>
      </h1>
      <AtualizaHoje intervaloMs={60_000} />
      <div className="grid gap-4 md:grid-cols-3 md:gap-5">
        <CartaoFaturamento
          faturamento={dados.faturamento}
          curva={dados.curva}
          fuso={config.fuso}
          agora={agora}
          horaDeVirada={horaDeVirada}
          className="md:col-span-2"
        />
        <QuadrosDoDia
          mesas={dados.mesasAbertas}
          porPessoa={dados.porPessoa}
          fuso={config.fuso}
          agora={agora}
        />
      </div>
      {/* Sem alerta, a meta fica sozinha e ocupa a largura inteira (uma coluna);
          com alerta, as duas dividem a linha no computador. */}
      <div
        className={cn("grid gap-4 md:gap-5", temEsquecidas && "md:grid-cols-2")}
      >
        {temEsquecidas ? (
          <ContasEsquecidas
            contas={dados.contasEsquecidas}
            limiteTexto={limiteEmTexto(config.limite_conta_esquecida)}
          />
        ) : null}
        <QuadroMeta meta={dados.meta} fuso={config.fuso} agora={agora} />
      </div>
    </div>
  );
}
