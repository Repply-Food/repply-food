import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto mostrado enquanto uma aba do painel (Hoje, Resultados, Ajustes)
 * busca os dados no servidor. Sem ele, a tela da aba anterior fica congelada
 * até o round-trip terminar — o que parecia "travar e pular". O Next pinta
 * este esqueleto na hora do clique e ainda consegue pré-aquecer a transição.
 */
export default function Carregando() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-hidden="true">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
