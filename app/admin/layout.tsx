import { TopoAdmin } from "@/components/admin/topo-admin";
import { exigirAdmin } from "@/lib/auth/sessao";
import type { ReactNode } from "react";

/**
 * Casca do admin (D-38, D-39): barra escura no topo e o conteúdo no tema
 * escolhido. Cada página chama `exigirAdmin()` de novo (o layout não roda em
 * toda navegação), e cada função do servidor também.
 */
export default async function LayoutAdmin({
  children,
}: { children: ReactNode }) {
  const sessao = await exigirAdmin();
  return (
    <div className="min-h-dvh bg-background">
      <TopoAdmin email={sessao.email} />
      <main className="mx-auto w-full max-w-7xl px-4 pt-4 pb-10 md:px-6 md:pt-6">
        {children}
      </main>
    </div>
  );
}
