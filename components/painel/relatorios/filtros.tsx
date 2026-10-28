"use client";

import { dataBr, hojeNaCasa, somarDias } from "@/lib/admin/datas";
import type { OpcoesRelatorio } from "@/lib/relatorios/opcoes";
import { obterOpcoesAction } from "@/lib/relatorios/opcoes-actions";
import {
  type FiltroAdicional,
  REGISTRO_RELATORIOS,
} from "@/lib/relatorios/registro";
import type { ConsultaRelatorio } from "@/lib/relatorios/tipos";
import type { Relatorio } from "@/lib/validators/relatorios";
import Link from "next/link";
import { useState } from "react";

const rotulos: Record<
  Exclude<FiltroAdicional, "mesaDe" | "mesaAte">,
  string
> = {
  pdv: "PDV",
  grupo: "Grupo",
  garcom: "Garçom",
  operador: "Operador",
  tipo: "Tipo",
  categoria: "Categoria",
  cliente: "Código do cliente",
};

function urlComPeriodo(
  slug: string,
  relatorio: Relatorio,
  inicio: string,
  fim: string,
  fonte: "historico" | "online"
) {
  const query = new URLSearchParams({ inicio, fim, fonte });
  return `/r/${slug}/relatorios/${relatorio}?${query}`;
}

export function FiltrosRelatorioForm({
  relatorio,
  consulta,
  slug,
  recursos,
  fuso,
  opcoes = {},
  agora = new Date(),
}: {
  relatorio: Relatorio;
  consulta: ConsultaRelatorio;
  slug: string;
  recursos: readonly string[];
  fuso: string;
  opcoes?: Partial<Record<string, OpcoesRelatorio>>;
  agora?: Date;
}) {
  const [inicio, setInicio] = useState(consulta.filtros.inicio);
  const [fim, setFim] = useState(consulta.filtros.fim);
  const [fonte, setFonte] = useState(consulta.filtros.fonte);
  const hoje = hojeNaCasa(agora, fuso);
  const ontem = somarDias(hoje, -1);
  const primeiroDiaMes = `${hoje.slice(0, 7)}-01`;
  const filtros = REGISTRO_RELATORIOS[relatorio].filtros;

  return (
    <section
      aria-label="Filtros do relatório"
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
    >
      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          className="rounded-md border px-3 py-2 underline underline-offset-4"
          href={urlComPeriodo(slug, relatorio, hoje, hoje, "historico")}
        >
          Hoje
        </Link>
        <Link
          className="rounded-md border px-3 py-2 underline underline-offset-4"
          href={urlComPeriodo(
            slug,
            relatorio,
            somarDias(hoje, -6),
            hoje,
            "historico"
          )}
        >
          7 dias
        </Link>
        <Link
          className="rounded-md border px-3 py-2 underline underline-offset-4"
          href={urlComPeriodo(
            slug,
            relatorio,
            primeiroDiaMes,
            hoje,
            "historico"
          )}
        >
          Este mês
        </Link>
        <Link
          className="rounded-md border px-3 py-2 underline underline-offset-4"
          href={urlComPeriodo(slug, relatorio, ontem, ontem, "historico")}
        >
          Ontem
        </Link>
      </div>

      <form
        method="get"
        action={`/r/${slug}/relatorios/${relatorio}`}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <label className="flex flex-col gap-1 text-sm">
          Data inicial
          <input
            required
            type="date"
            name="inicio"
            value={inicio}
            onChange={(evento) => {
              const dia = evento.currentTarget.value;
              setInicio(dia);
              if (fonte === "online") setFim(dia);
            }}
            className="h-10 rounded-md border bg-background px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Data final
          <input
            required
            type="date"
            name="fim"
            value={fim}
            onChange={(evento) => {
              const dia = evento.currentTarget.value;
              setFim(dia);
              if (fonte === "online") setInicio(dia);
            }}
            className="h-10 rounded-md border bg-background px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Origem dos dados
          <select
            name="fonte"
            value={fonte}
            onChange={(evento) => {
              const selecionada = evento.currentTarget.value as
                | "historico"
                | "online";
              setFonte(selecionada);
              if (selecionada === "online") setInicio(fim);
            }}
            className="h-10 rounded-md border bg-background px-3"
          >
            <option value="historico">Histórico</option>
            <option value="online">On-line (dia em andamento)</option>
          </select>
        </label>

        {filtros
          .filter((filtro) => filtro !== "mesaDe" && filtro !== "mesaAte")
          .map((filtro) => {
            const disponivel = recursos.includes(filtro);
            return (
              <CampoFiltro
                key={filtro}
                slug={slug}
                relatorio={relatorio}
                filtro={filtro}
                rotulo={rotulos[filtro]}
                filtros={consulta.filtros}
                valorAtual={consulta.filtros[filtro]}
                opcoesIniciais={opcoes[filtro]}
                disponivel={disponivel}
              />
            );
          })}

        {filtros.some(
          (filtro) => filtro === "mesaDe" || filtro === "mesaAte"
        ) ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              Mesa a partir de
              <input
                name="mesaDe"
                type="number"
                min="1"
                disabled={!recursos.includes("mesa")}
                defaultValue={consulta.filtros.mesaDe ?? ""}
                className="h-10 rounded-md border bg-background px-3 disabled:opacity-60"
              />
              {!recursos.includes("mesa") ? (
                <span className="text-xs text-quiet">
                  A SCC ainda não enviou opções para este filtro.
                </span>
              ) : null}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Mesa até
              <input
                name="mesaAte"
                type="number"
                min="1"
                disabled={!recursos.includes("mesa")}
                defaultValue={consulta.filtros.mesaAte ?? ""}
                className="h-10 rounded-md border bg-background px-3 disabled:opacity-60"
              />
              {!recursos.includes("mesa") ? (
                <span className="text-xs text-quiet">
                  A SCC ainda não enviou opções para este filtro.
                </span>
              ) : null}
            </label>
          </>
        ) : null}

        <p className="text-xs text-quiet sm:col-span-2 xl:col-span-4">
          Período selecionado: {dataBr(inicio)} a {dataBr(fim)}.
          {fonte === "online"
            ? " O modo on-line mantém as duas datas no mesmo dia."
            : null}
        </p>
        <div className="sm:col-span-2 xl:col-span-4">
          <button
            type="submit"
            className="h-10 rounded-md bg-primary px-4 font-semibold text-primary-foreground"
          >
            Aplicar filtros
          </button>
        </div>
      </form>
    </section>
  );
}

function CampoFiltro({
  slug,
  relatorio,
  filtro,
  rotulo,
  filtros,
  valorAtual,
  opcoesIniciais,
  disponivel,
}: {
  slug: string;
  relatorio: Relatorio;
  filtro: Exclude<FiltroAdicional, "mesaDe" | "mesaAte">;
  rotulo: string;
  filtros: ConsultaRelatorio["filtros"];
  valorAtual: string | number | undefined;
  opcoesIniciais?: OpcoesRelatorio;
  disponivel: boolean;
}) {
  const [opcoes, setOpcoes] = useState(opcoesIniciais?.opcoes ?? []);
  const [mais, setMais] = useState(opcoesIniciais?.mais ?? false);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function buscar(paginaNova: number, substituir: boolean) {
    setCarregando(true);
    setErro("");
    try {
      const resposta = await obterOpcoesAction(
        slug,
        relatorio,
        filtros,
        filtro,
        busca,
        paginaNova
      );
      if (!resposta.ok) {
        setErro(
          resposta.error === "filtro_indisponivel"
            ? "A SCC ainda não enviou opções para este filtro."
            : "Não foi possível carregar as opções agora."
        );
        return;
      }
      setOpcoes((atuais) =>
        substituir ? resposta.data.opcoes : [...atuais, ...resposta.data.opcoes]
      );
      setMais(resposta.data.mais);
      setPagina(paginaNova);
    } catch {
      setErro("Não foi possível carregar as opções agora.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={`filtro-${filtro}`}>{rotulo}</label>
      <select
        id={`filtro-${filtro}`}
        name={filtro}
        disabled={!disponivel}
        defaultValue={valorAtual === undefined ? "" : String(valorAtual)}
        className="h-10 rounded-md border bg-background px-3 disabled:opacity-60"
      >
        <option value="">Todos</option>
        {valorAtual !== undefined &&
        !opcoes.some((opcao) => opcao.codigo === String(valorAtual)) ? (
          <option value={String(valorAtual)}>{String(valorAtual)}</option>
        ) : null}
        {opcoes.map((opcao) => (
          <option key={opcao.codigo} value={opcao.codigo}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
      {disponivel ? (
        <div className="flex flex-wrap gap-2">
          <input
            aria-label={`Buscar ${rotulo.toLocaleLowerCase("pt-BR")}`}
            value={busca}
            onChange={(evento) => setBusca(evento.currentTarget.value)}
            maxLength={80}
            className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3"
          />
          <button
            type="button"
            disabled={carregando}
            onClick={() => void buscar(1, true)}
            className="h-9 rounded-md border px-3 font-medium disabled:opacity-50"
          >
            Buscar opções
          </button>
          {mais ? (
            <button
              type="button"
              disabled={carregando}
              onClick={() => void buscar(pagina + 1, false)}
              className="h-9 rounded-md border px-3 font-medium disabled:opacity-50"
            >
              Mais opções
            </button>
          ) : null}
        </div>
      ) : (
        <span className="text-xs text-quiet">
          A SCC ainda não enviou opções para este filtro.
        </span>
      )}
      {erro ? (
        <span role="alert" className="text-xs text-destructive">
          {erro}
        </span>
      ) : null}
    </div>
  );
}
