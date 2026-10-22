import { CartaoAcesso } from "@/components/admin/cartoes/cartao-acesso";
import { CartaoDados } from "@/components/admin/cartoes/cartao-dados";
import { CartaoEnvios } from "@/components/admin/cartoes/cartao-envios";
import { CartaoHistorico } from "@/components/admin/cartoes/cartao-historico";
import { CartaoReenvio } from "@/components/admin/cartoes/cartao-reenvio";
import { CartaoSituacao } from "@/components/admin/cartoes/cartao-situacao";
import { CartaoToken } from "@/components/admin/cartoes/cartao-token";
import { DetalheFechavel } from "@/components/admin/detalhe-fechavel";
import {
  EtiquetaDemonstracao,
  EtiquetaSuspenso,
  ListaRestaurantes,
} from "@/components/admin/lista-restaurantes";
import { SeloDados } from "@/components/painel/selo-dados";
import { detalheDoRestaurante, listarRestaurantes } from "@/lib/admin/dados";
import { exigirAdmin } from "@/lib/auth/sessao";
import { seloDoSinal } from "@/lib/painel/selo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export const metadata = { title: "Restaurante · admin · repply food." };

/**
 * Detalhe do restaurante (desenho §1.1). No computador, a lista continua à
 * esquerda, com a casa marcada; no celular, tela própria com "‹ Restaurantes".
 *
 * A lista é buscada e mostrada NA HORA; o detalhe (6 consultas + logins) entra
 * por streaming, com um esqueleto só no lado do detalhe (`DetalhePane` dentro
 * de `<Suspense>`). Assim trocar de casa ou abrir uma não "recarrega" a tela
 * toda — a lista fica parada e só o detalhe pisca.
 */
export default async function PaginaRestaurante({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirAdmin();
  const linhas = await listarRestaurantes();

  return (
    <div className="lg:grid lg:grid-cols-[1.35fr_1fr] lg:items-start lg:gap-6">
      <div className="hidden lg:block">
        <ListaRestaurantes
          linhas={linhas}
          agoraIso={new Date().toISOString()}
          selecionado={id}
          tituloPrincipal={false}
        />
      </div>
      <DetalheFechavel className="flex flex-col gap-4">
        <Link
          href="/admin"
          className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4 lg:hidden"
        >
          ‹ Restaurantes
        </Link>
        <Suspense key={id} fallback={<DetalheCarregando />}>
          <DetalhePane id={id} />
        </Suspense>
      </DetalheFechavel>
    </div>
  );
}

/** O detalhe em si (streaming). Suspende enquanto busca na nuvem. */
async function DetalhePane({ id }: { id: string }) {
  const detalhe = await detalheDoRestaurante(id);
  if (!detalhe) notFound();
  const { restaurante, sinal } = detalhe;
  const selo = seloDoSinal({
    estado: sinal.estado,
    ultimoEnvioOkEm: sinal.ultimoEnvioOkEm,
    agora: new Date(detalhe.agoraIso),
    fuso: restaurante.fuso,
  });

  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{restaurante.nome}</h1>
          {restaurante.situacao === "suspenso" ? <EtiquetaSuspenso /> : null}
          {restaurante.demonstracao ? <EtiquetaDemonstracao /> : null}
        </div>
        <SeloDados selo={selo} />
      </header>
      <CartaoDados detalhe={detalhe} />
      <CartaoToken detalhe={detalhe} />
      <CartaoAcesso detalhe={detalhe} />
      <CartaoEnvios detalhe={detalhe} />
      <CartaoReenvio detalhe={detalhe} />
      <CartaoSituacao detalhe={detalhe} />
      <CartaoHistorico detalhe={detalhe} />
    </>
  );
}

/** Esqueleto SÓ do detalhe (a lista ao lado continua à mostra). */
function DetalheCarregando() {
  const bloco = "animate-pulse rounded-xl bg-muted";
  const cartoes = ["c1", "c2", "c3", "c4"];
  return (
    <div
      className="flex flex-col gap-4"
      aria-busy="true"
      aria-label="Carregando o restaurante"
    >
      <div className={`${bloco} h-8 w-48`} />
      {cartoes.map((chave) => (
        <div key={chave} className={`${bloco} h-28 w-full`} />
      ))}
    </div>
  );
}
