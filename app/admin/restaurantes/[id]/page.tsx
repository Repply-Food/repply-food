import { CartaoAcesso } from "@/components/admin/cartoes/cartao-acesso";
import { CartaoDados } from "@/components/admin/cartoes/cartao-dados";
import { CartaoEnvios } from "@/components/admin/cartoes/cartao-envios";
import { CartaoHistorico } from "@/components/admin/cartoes/cartao-historico";
import { CartaoReenvio } from "@/components/admin/cartoes/cartao-reenvio";
import { CartaoSituacao } from "@/components/admin/cartoes/cartao-situacao";
import { CartaoToken } from "@/components/admin/cartoes/cartao-token";
import {
  EtiquetaSuspenso,
  ListaRestaurantes,
} from "@/components/admin/lista-restaurantes";
import { SeloDados } from "@/components/painel/selo-dados";
import { detalheDoRestaurante, listarRestaurantes } from "@/lib/admin/dados";
import { exigirAdmin } from "@/lib/auth/sessao";
import { seloDoSinal } from "@/lib/painel/selo";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = { title: "Restaurante · admin · repply food." };

/**
 * Detalhe do restaurante (desenho §1.1). No computador, a lista continua à
 * esquerda, com a casa marcada; no celular, tela própria com "‹ Restaurantes".
 */
export default async function PaginaRestaurante({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirAdmin();
  const [detalhe, linhas] = await Promise.all([
    detalheDoRestaurante(id),
    listarRestaurantes(),
  ]);
  if (!detalhe) notFound();
  const { restaurante, sinal } = detalhe;
  const selo = seloDoSinal({
    estado: sinal.estado,
    ultimoEnvioOkEm: sinal.ultimoEnvioOkEm,
    agora: new Date(detalhe.agoraIso),
    fuso: restaurante.fuso,
  });

  return (
    <div className="lg:grid lg:grid-cols-[1.35fr_1fr] lg:items-start lg:gap-6">
      <div className="hidden lg:block">
        <ListaRestaurantes
          linhas={linhas}
          agoraIso={detalhe.agoraIso}
          selecionado={restaurante.id}
          tituloPrincipal={false}
        />
      </div>
      <div className="flex flex-col gap-4">
        <Link
          href="/admin"
          className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4 lg:hidden"
        >
          ‹ Restaurantes
        </Link>
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{restaurante.nome}</h1>
            {restaurante.situacao === "suspenso" ? <EtiquetaSuspenso /> : null}
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
      </div>
    </div>
  );
}
