import { exigirCasa } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { obterResultados } from "@/lib/metricas/resultados";
import { parseFiltrosResultados } from "@/lib/metricas/resultados/filtros";
import { DocumentoResultadosPdf } from "@/lib/pdf/resultados";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;
  let casa: { id: string; nome: string };

  try {
    ({ casa } = await exigirCasa(slug));
  } catch {
    return new Response(null, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const { data: config, error } = await supabase
      .from("restaurantes")
      .select("fuso, hora_virada")
      .eq("id", casa.id)
      .maybeSingle();
    if (error || !config) throw new Error("falha_leitura_resultados");

    const filtros = parseFiltrosResultados(
      request.nextUrl.searchParams,
      new Date(),
      config.fuso,
      config.hora_virada
    );
    const dados = await obterResultados(casa.id, filtros);
    const pdf = await renderToBuffer(
      DocumentoResultadosPdf({
        casa,
        filtros,
        dados,
        fuso: config.fuso,
        geradoEm: new Date(),
      })
    );

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="resultados-${filtros.inicio}-a-${filtros.fim}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    logError("falha_pdf_resultados");
    return new Response("falha_pdf_resultados", { status: 500 });
  }
}
