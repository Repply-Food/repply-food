import { BotaoSair } from "@/components/entrada/botao-sair";
import { buttonVariants } from "@/components/ui/button";
import { destinoDaSessao, exigirSessao } from "@/lib/auth/sessao";
import { WHATSAPP_REPPLY } from "@/lib/contato";
import { cn } from "@/lib/utils";
import { redirect } from "next/navigation";

export const metadata = { title: "Acesso · repply food." };

/** Login sem casa ativa: ainda não liberado, ou casa suspensa. */
export default async function PaginaAcessoPendente() {
  const sessao = await exigirSessao();
  const destino = destinoDaSessao(sessao);
  if (destino !== "/acesso-pendente") redirect(destino);
  const suspensa = sessao.casas.find((c) => c.situacao === "suspenso");

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">
          {suspensa ? "Acesso suspenso" : "Seu acesso ainda não foi liberado"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {suspensa
            ? `O acesso a ${suspensa.nome} está suspenso. Fale com a Repply para resolver.`
            : "Fale com a Repply para liberar o painel da sua casa."}
        </p>
      </div>
      {/* <a> comum com o visual do botão: o `render` do base-ui poria
          role="button" no link e o leitor de tela perderia o "link". Em 320 px
          o texto não cabe numa linha só, então o `nowrap` do botão sai. */}
      <a
        href={WHATSAPP_REPPLY.link}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          buttonVariants({ size: "toque" }),
          "h-auto min-h-11 w-full whitespace-normal py-2 text-center"
        )}
      >
        Falar com a Repply no WhatsApp
        <span className="sr-only">, abre em nova aba</span>
      </a>
      <BotaoSair />
    </section>
  );
}
