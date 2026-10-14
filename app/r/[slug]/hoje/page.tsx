import { EstadoVazio } from "@/components/painel/estado-vazio";

export const metadata = { title: "Hoje · repply food." };

export default function PaginaHoje() {
  return (
    <EstadoVazio
      titulo="Hoje"
      texto="Em breve: o faturamento de hoje comparado com o mesmo dia da semana, as mesas abertas, as contas esquecidas e a meta do mês."
    />
  );
}
