import { ConversaDoMentor } from "@/components/admin/conversa-do-mentor";
import { exigirAdmin } from "@/lib/auth/sessao";
import { conversaParaAdmin } from "@/lib/mentor/leitura";
import { notFound } from "next/navigation";

export const metadata = { title: "Conversa do mentor · admin · repply food." };

/**
 * Uma conversa do dono com o mentor, para o suporte (D-38: o admin só lê). A
 * casa vem da própria conversa. Id que não é uuid ou que não existe é "não
 * encontrada", sem dizer qual dos dois.
 */
export default async function PaginaConversaDoMentor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirAdmin();
  const conversa = await conversaParaAdmin(id);
  if (!conversa) notFound();
  return (
    <ConversaDoMentor conversa={conversa} agoraIso={new Date().toISOString()} />
  );
}
