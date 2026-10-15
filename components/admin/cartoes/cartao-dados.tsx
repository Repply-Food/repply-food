import { Cartao } from "@/components/admin/cartao";
import { buttonVariants } from "@/components/ui/button";
import { formatarCnpj } from "@/lib/admin/cnpj";
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
  const linhas: [string, string][] = [
    ["Nome", r.nome],
    ["CNPJ", r.cnpj ? formatarCnpj(r.cnpj) : "não informado"],
    ["Fuso", rotuloDoFuso(r.fuso)],
    ["O dia vira às", formatarHora(r.horaVirada)],
    ["Funcionamento", resumoDoHorario(r.horario)],
    ["Situação", r.situacao === "suspenso" ? "suspenso" : "ativo"],
  ];
  return (
    <Cartao titulo="Dados">
      <dl className="flex flex-col divide-y text-sm">
        {linhas.map(([rotulo, valor]) => (
          <div
            key={rotulo}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
          >
            <dt className="text-quiet">{rotulo}</dt>
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
