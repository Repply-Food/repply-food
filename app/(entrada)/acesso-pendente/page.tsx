import { BotaoSair } from "@/components/entrada/botao-sair";
import { Button } from "@/components/ui/button";
import { destinoDaSessao, exigirSessao } from "@/lib/auth/sessao";
import { WHATSAPP_REPPLY } from "@/lib/contato";
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
      <Button
        size="toque"
        className="w-full"
        render={
          // biome-ignore lint/a11y/useAnchorContent: o texto vem do <Button>, que injeta os filhos dentro do <a> do `render`.
          <a
            href={WHATSAPP_REPPLY.link}
            target="_blank"
            rel="noopener noreferrer"
          />
        }
        nativeButton={false}
      >
        Falar com a Repply no WhatsApp
      </Button>
      <BotaoSair />
    </section>
  );
}
