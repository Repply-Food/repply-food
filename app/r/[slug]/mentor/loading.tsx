import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto da aba Mentor enquanto o servidor lê a última conversa: o título,
 * duas falas e o campo de envio, no mesmo lugar em que a tela de verdade
 * aparece.
 */
export default function Carregando() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-hidden="true">
      <Skeleton className="h-8 w-32" />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Skeleton className="ml-auto h-12 w-3/5" />
        <Skeleton className="h-24 w-4/5" />
        <Skeleton className="mt-8 h-11 w-full" />
      </div>
    </div>
  );
}
