import { serializarConsulta } from "@/lib/relatorios/filtros";
import type { ConsultaRelatorio } from "@/lib/relatorios/tipos";
import type { Relatorio } from "@/lib/validators/relatorios";
import Link from "next/link";

export function PaginacaoRelatorio({
  consulta,
  paginacao,
  slug,
  relatorio,
}: {
  consulta: ConsultaRelatorio;
  paginacao: { pagina: number; tamanho: number; totalLinhas: number };
  slug: string;
  relatorio: Relatorio;
}) {
  const totalPaginas = Math.max(
    1,
    Math.ceil(paginacao.totalLinhas / paginacao.tamanho)
  );
  const href = (pagina: number) => {
    const query = serializarConsulta({ ...consulta, pagina });
    return `/r/${slug}/relatorios/${relatorio}?${query}`;
  };
  if (paginacao.totalLinhas <= paginacao.tamanho) return null;

  return (
    <nav
      aria-label="Paginação do relatório"
      className="flex items-center justify-between gap-3 text-sm"
    >
      {paginacao.pagina > 1 ? (
        <Link
          href={href(paginacao.pagina - 1)}
          className="underline underline-offset-4"
        >
          Página anterior
        </Link>
      ) : (
        <span aria-disabled="true" className="text-quiet">
          Página anterior
        </span>
      )}
      <span aria-live="polite">
        Página {paginacao.pagina} de {totalPaginas}
      </span>
      {paginacao.pagina < totalPaginas ? (
        <Link
          href={href(paginacao.pagina + 1)}
          className="underline underline-offset-4"
        >
          Próxima página
        </Link>
      ) : (
        <span aria-disabled="true" className="text-quiet">
          Próxima página
        </span>
      )}
    </nav>
  );
}
