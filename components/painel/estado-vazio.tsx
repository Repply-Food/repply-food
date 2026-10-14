/** Tela ainda sem números: diz o que vem, sem inventar dado. */
export function EstadoVazio({
  titulo,
  texto,
}: {
  titulo: string;
  texto: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      <div className="brand-surface rounded-lg p-6">
        <p className="text-quiet">{texto}</p>
      </div>
    </section>
  );
}
