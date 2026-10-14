import { BotaoSair } from "@/components/entrada/botao-sair";
import { Logo } from "@/components/marca/logo";
import { exigirAdmin } from "@/lib/auth/sessao";

export const metadata = { title: "Admin · repply food." };

/** Provisório: o admin de verdade é a etapa 3. */
export default async function PaginaAdmin() {
  const sessao = await exigirAdmin();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6">
      <Logo variante="claro" tamanho="grande" />
      <h1 className="text-3xl font-semibold">Admin da Repply</h1>
      <p className="text-muted-foreground">
        Entrou como {sessao.email}. O cadastro de restaurantes, tokens e acessos
        chega na próxima etapa.
      </p>
      <BotaoSair variante="outline" />
    </main>
  );
}
