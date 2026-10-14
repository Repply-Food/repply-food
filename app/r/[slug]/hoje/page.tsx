import { EstadoVazio } from "@/components/painel/estado-vazio";
import { exigirCasa } from "@/lib/auth/sessao";

export const metadata = { title: "Hoje · repply food." };

export default async function PaginaHoje({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await exigirCasa(slug);

  return (
    <EstadoVazio
      titulo="Hoje"
      texto="Em breve: o faturamento de hoje comparado com o mesmo dia da semana, as mesas abertas, as contas esquecidas e a meta do mês."
    />
  );
}
