import { ListaConversasDoMentor } from "@/components/admin/lista-conversas-do-mentor";
import { exigirAdmin } from "@/lib/auth/sessao";
import { conversasParaAdmin } from "@/lib/mentor/leitura";

export const metadata = { title: "Conversas do mentor · admin · repply food." };

/**
 * As conversas dos donos com o mentor, de todas as casas, para o suporte (D-38:
 * o admin só lê). Só o admin chega aqui: a página e a leitura conferem cada uma
 * por conta própria. Fica alcançável pelo endereço; o caminho até ela no menu
 * do admin é uma decisão de produto ainda aberta.
 */
export default async function PaginaConversasDoMentor() {
  await exigirAdmin();
  const { conversas, haMais } = await conversasParaAdmin();
  return (
    <ListaConversasDoMentor
      conversas={conversas}
      agoraIso={new Date().toISOString()}
      haMais={haMais}
    />
  );
}
