"use client";

export default function ErroRelatorioPagina({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-5">
      <h1 className="text-lg font-semibold">
        Não foi possível abrir este relatório
      </h1>
      <p className="text-sm text-quiet">
        Tente novamente. Se o problema continuar, fale com quem administra a
        casa.
      </p>
      <button
        type="button"
        onClick={reset}
        className="w-fit rounded-lg bg-primary px-4 py-3 font-bold text-primary-foreground"
      >
        Tentar novamente
      </button>
    </section>
  );
}
