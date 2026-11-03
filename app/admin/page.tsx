import { AtalhoDoMentor } from "@/components/admin/atalho-do-mentor";
import { ListaRestaurantes } from "@/components/admin/lista-restaurantes";
import { listarRestaurantes } from "@/lib/admin/dados";
import { exigirAdmin } from "@/lib/auth/sessao";

export const metadata = { title: "Admin · repply food." };

/**
 * Lista de restaurantes. No computador, à direita, "Escolha um restaurante".
 * Abaixo da lista fica o atalho para a área do mentor de IA (cartilha e
 * conversas), a única entrada do admin para ela.
 */
export default async function PaginaAdmin() {
  await exigirAdmin();
  const linhas = await listarRestaurantes();
  return (
    <div className="lg:grid lg:grid-cols-[1.35fr_1fr] lg:items-start lg:gap-6">
      <div className="flex flex-col gap-6">
        <ListaRestaurantes
          linhas={linhas}
          agoraIso={new Date().toISOString()}
        />
        <AtalhoDoMentor />
      </div>
      <aside className="hidden lg:block">
        <p className="brand-surface rounded-xl p-6 text-quiet">
          Escolha um restaurante para ver os dados, o token de envio, o acesso
          do cliente e os últimos envios.
        </p>
      </aside>
    </div>
  );
}
