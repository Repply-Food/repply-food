import { EstadoRelatorio } from "@/components/painel/relatorios/estado";
import { FiltrosRelatorioForm } from "@/components/painel/relatorios/filtros";
import { PaginacaoRelatorio } from "@/components/painel/relatorios/paginacao";
import { PainelRelatorio } from "@/components/painel/relatorios/painel-relatorio";
import { exigirCasa } from "@/lib/auth/sessao";
import { datasIniciaisRelatorio } from "@/lib/relatorios/datas-iniciais";
import { parseConsulta, serializarConsulta } from "@/lib/relatorios/filtros";
import { ErroRelatorio, obterRelatorio } from "@/lib/relatorios/leitura";
import { obterOpcoes } from "@/lib/relatorios/opcoes";
import {
  parametrosComoUrl,
  temFiltroAdicional,
} from "@/lib/relatorios/paginas";
import { REGISTRO_RELATORIOS } from "@/lib/relatorios/registro";
import type {
  ConsultaRelatorio,
  ResultadoDoRelatorio,
} from "@/lib/relatorios/tipos";
import type { Relatorio } from "@/lib/validators/relatorios";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const metadata = { title: "Relatório · repply food." };

const relatorios = Object.keys(REGISTRO_RELATORIOS) as Relatorio[];
const dimensoes = [
  "pdv",
  "grupo",
  "garcom",
  "operador",
  "tipo",
  "categoria",
  "cliente",
] as const;

function urlBase(slug: string, relatorio: Relatorio, query: string) {
  return `/r/${slug}/relatorios/${relatorio}?${query}`;
}

function AvisoConsulta({
  mensagem,
  href,
  rotulo,
}: {
  mensagem: string;
  href: string;
  rotulo: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4"
    >
      <p>{mensagem}</p>
      <Link
        className="mt-2 inline-block font-semibold underline underline-offset-4"
        href={href}
      >
        {rotulo}
      </Link>
    </div>
  );
}

export default async function PaginaRelatorio({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; relatorio: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, relatorio: slugRelatorio } = await params;
  if (!relatorios.includes(slugRelatorio as Relatorio)) notFound();
  const relatorio = slugRelatorio as Relatorio;
  const { casa } = await exigirCasa(slug);
  const busca = await searchParams;
  const parametros = parametrosComoUrl(busca);
  const dataPadrao = datasIniciaisRelatorio(new Date(), casa.fuso);

  if (parametros.size === 0) {
    const consultaInicial = parseConsulta(
      relatorio,
      new URLSearchParams(dataPadrao)
    );
    redirect(urlBase(slug, relatorio, serializarConsulta(consultaInicial)));
  }

  let consulta: ConsultaRelatorio;
  try {
    consulta = parseConsulta(relatorio, parametros);
  } catch {
    const inicial = parseConsulta(relatorio, new URLSearchParams(dataPadrao));
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">
          {REGISTRO_RELATORIOS[relatorio].titulo}
        </h1>
        <AvisoConsulta
          mensagem="As datas ou os filtros estão incompletos ou inválidos. Revise o período antes de consultar."
          href={urlBase(slug, relatorio, serializarConsulta(inicial))}
          rotulo="Corrigir filtros"
        />
      </section>
    );
  }

  let resultado: ResultadoDoRelatorio<Relatorio>;
  try {
    resultado = await obterRelatorio(casa.id, relatorio, consulta);
  } catch (erro) {
    if (!(erro instanceof ErroRelatorio)) throw erro;
    const query = serializarConsulta(
      erro.codigo === "dados_alterados"
        ? { ...consulta, pagina: 1, revisao: undefined }
        : {
            filtros: {
              inicio: consulta.filtros.inicio,
              fim: consulta.filtros.fim,
              fonte: consulta.filtros.fonte,
            },
            pagina: 1,
          }
    );
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">
          {REGISTRO_RELATORIOS[relatorio].titulo}
        </h1>
        <AvisoConsulta
          mensagem={
            erro.codigo === "dados_alterados"
              ? "Os dados mudaram enquanto você consultava. Atualize o relatório para continuar."
              : "Esse filtro não está disponível para os dados recebidos pela SCC."
          }
          href={urlBase(slug, relatorio, query)}
          rotulo={
            erro.codigo === "dados_alterados"
              ? "Atualizar relatório"
              : "Remover filtros"
          }
        />
      </section>
    );
  }

  const opcoes = Object.fromEntries(
    await Promise.all(
      dimensoes
        .filter((dimensao) => resultado.cobertura.recursos.includes(dimensao))
        .map(async (dimensao) => {
          try {
            return [
              dimensao,
              await obterOpcoes(
                casa.id,
                relatorio,
                consulta.filtros,
                dimensao,
                "",
                1
              ),
            ];
          } catch (erro) {
            if (
              erro instanceof ErroRelatorio &&
              erro.codigo === "filtro_indisponivel"
            )
              return [dimensao, undefined];
            throw erro;
          }
        })
    )
  );

  return (
    <section className="flex flex-col gap-4 md:gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          {REGISTRO_RELATORIOS[relatorio].titulo}
        </h1>
        <p className="text-sm text-quiet">
          {REGISTRO_RELATORIOS[relatorio].descricao}
        </p>
      </div>
      <FiltrosRelatorioForm
        relatorio={relatorio}
        slug={slug}
        fuso={casa.fuso}
        recursos={resultado.cobertura.recursos}
        consulta={consulta}
        opcoes={opcoes}
      />
      <EstadoRelatorio
        resultado={resultado}
        fuso={casa.fuso}
        temFiltros={temFiltroAdicional(consulta.filtros)}
      />
      {resultado.linhas.length > 0 ? (
        <PainelRelatorio
          relatorio={relatorio}
          resultado={resultado}
          fuso={casa.fuso}
        />
      ) : null}
      {resultado.linhas.length > 0 ? (
        <p className="text-sm text-quiet">
          Exibindo {resultado.linhas.length} de{" "}
          {resultado.paginacao.totalLinhas} linhas.
        </p>
      ) : null}
      <PaginacaoRelatorio
        consulta={{ ...consulta, revisao: resultado.revisao }}
        paginacao={resultado.paginacao}
        slug={slug}
        relatorio={relatorio}
      />
    </section>
  );
}
