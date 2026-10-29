import { CatalogoRelatorios } from "@/components/painel/relatorios/catalogo";
import { AbaDescontos } from "@/components/painel/resultados/aba-descontos";
import { AbaEquipe } from "@/components/painel/resultados/aba-equipe";
import { AbaHorarios } from "@/components/painel/resultados/aba-horarios";
import { AbaVendas } from "@/components/painel/resultados/aba-vendas";
import { AbasResultados } from "@/components/painel/resultados/abas-resultados";
import { ControlesResultados } from "@/components/painel/resultados/controles-resultados";
import { exigirCasa } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { obterResultados } from "@/lib/metricas/resultados";
import { parseFiltrosResultados } from "@/lib/metricas/resultados/filtros";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Resultados · repply food." };

export default async function PaginaResultados({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const { casa } = await exigirCasa(slug);
  const supabase = await createClient();
  const { data: config, error } = await supabase
    .from("restaurantes")
    .select("fuso, hora_virada")
    .eq("id", casa.id)
    .maybeSingle();

  if (error || !config) {
    logError("falha_metricas_resultados");
    throw new Error("falha_leitura_resultados");
  }

  const filtros = parseFiltrosResultados(
    await searchParams,
    new Date(),
    config.fuso,
    config.hora_virada
  );
  const dados = await obterResultados(casa.id, filtros);

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Resultados</h1>
          <p className="text-sm text-quiet">{filtros.rotuloPeriodo}</p>
        </div>
      </div>
      <ControlesResultados filtros={filtros} slug={slug} />
      <AbasResultados
        slug={slug}
        abaInicial={filtros.aba}
        paineis={{
          vendas: <AbaVendas dados={dados} filtros={filtros} />,
          horarios: <AbaHorarios dados={dados} />,
          equipe: <AbaEquipe dados={dados} />,
          descontos: <AbaDescontos dados={dados} />,
        }}
      />
      <section
        className="flex flex-col gap-4 md:gap-5"
        aria-labelledby="relatorios-scc"
      >
        <h2
          id="relatorios-scc"
          className="text-lg font-semibold tracking-tight"
        >
          Relatórios da SCC
        </h2>
        <CatalogoRelatorios slug={slug} />
      </section>
    </div>
  );
}
