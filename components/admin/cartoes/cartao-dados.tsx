import { Cartao } from "@/components/admin/cartao";
import { DicaDoCampo } from "@/components/forms/dica-do-campo";
import { buttonVariants } from "@/components/ui/button";
import { formatarCnpj } from "@/lib/admin/cnpj";
import {
  DICA_CNPJ,
  DICA_DIA_VIRA,
  DICA_FUSO,
} from "@/lib/admin/dicas-dos-campos";
import { rotuloDoFuso } from "@/lib/admin/fusos";
import { formatarHora, resumoDoHorario } from "@/lib/admin/horario";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";
import { cn } from "@/lib/utils";
import Link from "next/link";

const BOTAO = cn(
  buttonVariants({ variant: "outline", size: "toque" }),
  "md:h-9 md:text-sm"
);

/** Cartão 1 do detalhe (desenho §1.1). */
export function CartaoDados({ detalhe }: { detalhe: DetalheDoRestaurante }) {
  const r = detalhe.restaurante;
  const linhas: { rotulo: string; valor: string; dica?: string }[] = [
    { rotulo: "Nome", valor: r.nome },
    {
      rotulo: "CNPJ",
      valor: r.cnpj ? formatarCnpj(r.cnpj) : "não informado",
      dica: DICA_CNPJ,
    },
    { rotulo: "Fuso", valor: rotuloDoFuso(r.fuso), dica: DICA_FUSO },
    {
      rotulo: "O dia vira às",
      valor: formatarHora(r.horaVirada),
      dica: DICA_DIA_VIRA,
    },
    { rotulo: "Funcionamento", valor: resumoDoHorario(r.horario) },
    {
      rotulo: "Situação",
      valor: r.situacao === "suspenso" ? "suspenso" : "ativo",
    },
  ];
  return (
    <Cartao titulo="Dados">
      <dl className="flex flex-col divide-y text-sm">
        {linhas.map(({ rotulo, valor, dica }) => (
          <div
            key={rotulo}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
          >
            <dt className="relative flex items-center gap-1.5 text-quiet">
              {rotulo}
              {dica ? <DicaDoCampo titulo={rotulo}>{dica}</DicaDoCampo> : null}
            </dt>
            <dd className="text-right">{valor}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Link href={`/admin/restaurantes/${r.id}/editar`} className={BOTAO}>
          Editar dados
        </Link>
        {/* <a> comum, sem pré-carregamento: abrir o painel registra "abriu o
            painel do cliente" no histórico (D-59), e isso só pode acontecer
            quando o admin abre de fato. */}
        <a href={`/r/${r.slug}/hoje`} className={BOTAO}>
          Ver o painel do cliente
        </a>
      </div>
    </Cartao>
  );
}
