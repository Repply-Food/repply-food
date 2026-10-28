import { CatalogoRelatorios } from "@/components/painel/relatorios/catalogo";
import { exigirCasa } from "@/lib/auth/sessao";

export const metadata = { title: "Relatórios · repply food." };

export default async function PaginaRelatorios({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await exigirCasa(slug);

  return (
    <section className="flex flex-col gap-4 md:gap-5">
      <h1 className="text-lg font-semibold tracking-tight">Relatórios</h1>
      <CatalogoRelatorios slug={slug} />
    </section>
  );
}
