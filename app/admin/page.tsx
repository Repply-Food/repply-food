import { ListaRestaurantes } from "@/components/admin/lista-restaurantes";
import { listarRestaurantes } from "@/lib/admin/dados";
import { exigirAdmin } from "@/lib/auth/sessao";

export const metadata = { title: "Admin · repply food." };

/** Lista de restaurantes. No computador, à direita, "Escolha um restaurante". */
export default async function PaginaAdmin() {
  await exigirAdmin();
  const linhas = await listarRestaurantes();
  return (
    <div className="lg:grid lg:grid-cols-[1.35fr_1fr] lg:items-start lg:gap-6">
      <ListaRestaurantes linhas={linhas} agoraIso={new Date().toISOString()} />
      <aside className="hidden lg:block">
        <p className="brand-surface rounded-xl p-6 text-quiet">
          Escolha um restaurante para ver os dados, o token de envio, o acesso
          do cliente e os últimos envios.
        </p>
      </aside>
    </div>
  );
}
