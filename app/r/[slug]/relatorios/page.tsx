import { exigirCasa } from "@/lib/auth/sessao";
import { redirect } from "next/navigation";

export const metadata = { title: "Relatórios · repply food." };

export default async function PaginaRelatorios({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await exigirCasa(slug);
  redirect(`/r/${slug}/resultados`);
}
