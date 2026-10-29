import "server-only";
import type { Relatorio } from "@/lib/validators/relatorios";
import { obterRelatorio } from "./leitura";
import type { ConsultaRelatorio, ResultadoDoRelatorio } from "./tipos";

export type CodigoErroPdfRelatorio = "limite_pdf" | "dados_alterados";

export class ErroPdfRelatorio extends Error {
  constructor(readonly codigo: CodigoErroPdfRelatorio) {
    super(codigo);
    this.name = "ErroPdfRelatorio";
  }
}

export type ResultadoCompletoDoRelatorio<R extends Relatorio> = Omit<
  ResultadoDoRelatorio<R>,
  "paginacao"
> & {
  paginacao: { pagina: number; tamanho: number; totalLinhas: number };
};

const TAMANHO_PAGINA = 100;
const LIMITE_LINHAS = 2000;

/** Reúne as páginas de uma mesma revisão; os resumos SQL vêm da primeira. */
export async function carregarDadosPdf<R extends Relatorio>(
  casaId: string,
  relatorio: R,
  consulta: ConsultaRelatorio
): Promise<ResultadoCompletoDoRelatorio<R>> {
  const primeira = await obterRelatorio(
    casaId,
    relatorio,
    {
      ...consulta,
      pagina: 1,
    },
    TAMANHO_PAGINA
  );
  const total = primeira.paginacao.totalLinhas;
  if (total > LIMITE_LINHAS) throw new ErroPdfRelatorio("limite_pdf");

  const linhas = [...primeira.linhas];
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  for (let pagina = 2; pagina <= totalPaginas; pagina += 1) {
    const seguinte = await obterRelatorio(
      casaId,
      relatorio,
      { ...consulta, pagina, revisao: primeira.revisao },
      TAMANHO_PAGINA
    );
    if (
      seguinte.revisao !== primeira.revisao ||
      seguinte.paginacao.totalLinhas !== total
    )
      throw new ErroPdfRelatorio("dados_alterados");

    const linhasEsperadas = Math.min(
      TAMANHO_PAGINA,
      total - (pagina - 1) * TAMANHO_PAGINA
    );
    if (seguinte.linhas.length !== linhasEsperadas)
      throw new ErroPdfRelatorio("dados_alterados");
    linhas.push(...seguinte.linhas);
  }

  const linhasIniciaisEsperadas = Math.min(TAMANHO_PAGINA, total);
  if (primeira.linhas.length !== linhasIniciaisEsperadas)
    throw new ErroPdfRelatorio("dados_alterados");

  return {
    ...primeira,
    linhas,
    paginacao: { pagina: 1, tamanho: linhas.length, totalLinhas: total },
  } as ResultadoCompletoDoRelatorio<R>;
}
