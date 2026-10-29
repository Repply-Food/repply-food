import { exigirCasa } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { DocumentoRelatorio } from "@/lib/pdf/relatorios";
import { parseConsulta } from "@/lib/relatorios/filtros";
import { ErroRelatorio } from "@/lib/relatorios/leitura";
import { ErroPdfRelatorio, carregarDadosPdf } from "@/lib/relatorios/pdf-dados";
import type { ConsultaRelatorio } from "@/lib/relatorios/tipos";
import type { Relatorio } from "@/lib/validators/relatorios";
import { RELATORIOS } from "@/lib/validators/relatorios";
import { renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

function ehRelatorio(valor: string): valor is Relatorio {
  return (RELATORIOS as readonly string[]).includes(valor);
}

function respostaErro(status: number, texto: string) {
  return new Response(texto, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; relatorio: string }> }
): Promise<Response> {
  const { slug, relatorio: slugRelatorio } = await params;
  if (!ehRelatorio(slugRelatorio))
    return respostaErro(404, "Relatório não encontrado.");

  let acesso: Awaited<ReturnType<typeof exigirCasa>>;
  try {
    acesso = await exigirCasa(slug);
  } catch {
    return respostaErro(404, "Casa não encontrada.");
  }

  let consulta: ConsultaRelatorio;
  try {
    consulta = parseConsulta(slugRelatorio, request.nextUrl.searchParams);
  } catch {
    return respostaErro(
      422,
      "Confira as datas e os filtros antes de gerar o PDF."
    );
  }
  // A exportação sempre reinicia a navegação na página 1, mantendo filtros e revisão.
  consulta = { ...consulta, pagina: 1 };

  try {
    const resultado = await carregarDadosPdf(
      acesso.casa.id,
      slugRelatorio,
      consulta
    );
    const pdf = await renderToBuffer(
      DocumentoRelatorio({
        casa: { nome: acesso.casa.nome },
        relatorio: slugRelatorio,
        consulta,
        resultado,
        fuso: acesso.casa.fuso,
        geradoEm: new Date(),
      })
    );
    const nome = `${slugRelatorio}-${consulta.filtros.inicio}-a-${consulta.filtros.fim}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nome}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erro) {
    if (erro instanceof ErroPdfRelatorio) {
      if (erro.codigo === "dados_alterados")
        return respostaErro(
          409,
          "Os dados mudaram durante a exportação. Atualize o relatório e tente novamente."
        );
      return respostaErro(
        422,
        "Este relatório excede o limite de 2.000 linhas por PDF."
      );
    }
    if (erro instanceof ErroRelatorio) {
      if (erro.codigo === "dados_alterados")
        return respostaErro(
          409,
          "Os dados mudaram durante a exportação. Atualize o relatório e tente novamente."
        );
      return respostaErro(
        422,
        "Esse filtro não está disponível para os dados recebidos pela SCC."
      );
    }
    logError("falha_leitura_relatorios");
    return respostaErro(
      500,
      "Não foi possível gerar o PDF agora. Tente novamente."
    );
  }
}
