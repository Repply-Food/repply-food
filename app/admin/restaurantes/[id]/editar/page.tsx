import { FormularioRestaurante } from "@/components/admin/formulario-restaurante";
import { restauranteParaEditar } from "@/lib/admin/dados";
import { exigirAdmin } from "@/lib/auth/sessao";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = { title: "Editar restaurante · admin · repply food." };

export default async function PaginaEditarRestaurante({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirAdmin();
  const restaurante = await restauranteParaEditar(id);
  if (!restaurante) notFound();
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href={`/admin/restaurantes/${restaurante.id}`}
        className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4"
      >
        {`‹ ${restaurante.nome}`}
      </Link>
      <h1 className="text-2xl font-semibold">Editar dados</h1>
      <FormularioRestaurante
        modo="edicao"
        restauranteId={restaurante.id}
        valoresIniciais={restaurante.valores}
      />
    </section>
  );
}
