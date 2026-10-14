import { EstadoVazio } from "@/components/painel/estado-vazio";

export const metadata = { title: "Resultados · repply food." };

export default function PaginaResultados() {
  return (
    <EstadoVazio
      titulo="Resultados"
      texto="Em breve: os números por período, em quatro abas: Vendas, Horários, Equipe e Descontos."
    />
  );
}
