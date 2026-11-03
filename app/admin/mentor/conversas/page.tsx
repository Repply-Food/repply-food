import { ListaConversasDoMentor } from "@/components/admin/lista-conversas-do-mentor";
import { exigirAdmin } from "@/lib/auth/sessao";
import { conversasParaAdmin } from "@/lib/mentor/leitura";

export const metadata = { title: "Conversas do mentor · admin · repply food." };

/**
 * As conversas dos donos com o mentor, de todas as casas, para o suporte (D-38:
 * o admin só lê). Só o admin chega aqui: a página e a leitura conferem cada uma
 * por conta própria. O caminho até ela: o cartão "Mentor" da home do admin leva
 * à cartilha, e a faixa de cima (`NavegacaoDoMentor`) liga as duas telas.
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
