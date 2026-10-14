import { EstadoVazio } from "@/components/painel/estado-vazio";
import { exigirCasa } from "@/lib/auth/sessao";

export const metadata = { title: "Resultados · repply food." };

export default async function PaginaResultados({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await exigirCasa(slug);

  return (
    <EstadoVazio
      titulo="Resultados"
      texto="Em breve: os números por período, em quatro abas: Vendas, Horários, Equipe e Descontos."
    />
  );
}
