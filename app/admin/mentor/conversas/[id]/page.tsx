import { ConversaDoMentor } from "@/components/admin/conversa-do-mentor";
import { exigirAdmin } from "@/lib/auth/sessao";
import { urlParaBaixar } from "@/lib/mentor/anexos";
import { anexosDaConversa, conversaParaAdmin } from "@/lib/mentor/leitura";
import { notFound } from "next/navigation";

export const metadata = { title: "Conversa do mentor · admin · repply food." };

/**
 * Uma conversa do dono com o mentor, para o suporte (D-38: o admin só lê). A
 * casa vem da própria conversa. Id que não é uuid ou que não existe é "não
 * encontrada", sem dizer qual dos dois.
 *
 * Os anexos vêm junto, cada um com o link assinado de 120 segundos gerado aqui
 * no servidor (com a chave de serviço, nunca o caminho do cofre): a tela só
 * abre o link, sem botão nem ação de escrita.
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
  const anexos = await anexosDaConversa(id, conversa.casa.id);
  const urls = await Promise.all(
    anexos.map((anexo) => urlParaBaixar(conversa.casa.id, anexo.id))
  );
  return (
    <ConversaDoMentor
      conversa={conversa}
      agoraIso={new Date().toISOString()}
      anexos={anexos.map((anexo, indice) => ({
        ...anexo,
        url: urls[indice] ?? null,
      }))}
    />
  );
}
