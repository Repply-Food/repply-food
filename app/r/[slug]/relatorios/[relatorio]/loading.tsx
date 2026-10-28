import { Skeleton } from "@/components/ui/skeleton";

export default function CarregandoRelatorio() {
  return (
    <section aria-label="Carregando relatório" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
    </section>
  );
}
