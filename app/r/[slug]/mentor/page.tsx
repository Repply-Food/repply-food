import { ChatMentor } from "@/components/painel/mentor/chat-mentor";
import { ListaConversas } from "@/components/painel/mentor/lista-conversas";
import { exigirCasa } from "@/lib/auth/sessao";
import {
  anexosDaConversa,
  conversasDaCasa,
  mensagensDaConversa,
} from "@/lib/mentor/leitura";
import { casaTemModulo } from "@/lib/painel/modulos";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = { title: "Mentor · repply food." };

// O mentor pode fazer até ~6 chamadas ao provedor de IA antes de responder, e a
// Vercel mata a função no tempo padrão. O Next aplica o `maxDuration` da página
// a toda função do servidor chamada por ela (`enviarMensagemAction`).
// No merge, conferir o teto do plano da Vercel.
export const maxDuration = 60;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function PaginaMentor({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{
    conversa?: string | string[];
    nova?: string | string[];
  }>;
}) {
  const { slug } = await params;
  const { casa, modoAdmin } = await exigirCasa(slug);
  if (!casaTemModulo(casa.modulos, "mentor")) notFound();

  // Uma leitura só: a principal traz as arquivadas marcadas, e a tela separa
  // (a excluída nem vem: sumiu da vista do dono). Falha de leitura vira a tela
  // de erro, nunca "nenhuma conversa" (mesmo princípio dos Ajustes).
  const todas = await conversasDaCasa(casa.id);
  const abertas = todas.filter((c) => c.arquivada_em === null);
  const arquivadas = todas.filter((c) => c.arquivada_em !== null);

  // A conversa aberta vem do endereço; id desconhecido (ou de conversa excluída)
  // é ignorado e cai na lista, nunca numa conversa de outra casa. Sem nada
  // escolhido, a lista é a primeira tela (no celular) e o painel fica no estado
  // vazio de hoje (no computador, ao lado da lista).
  const consulta = (await searchParams) ?? {};
  const pedido = primeiro(consulta.conversa);
  const ativa =
    typeof pedido === "string"
      ? (todas.find((c) => c.id === pedido) ?? null)
      : null;
  const nova = primeiro(consulta.nova) === "1" && ativa === null;
  const chatAberto = ativa !== null || nova;
  const mensagens = ativa ? await mensagensDaConversa(ativa.id, casa.id) : [];
  // Os anexos entram junto das mensagens: mesma conversa, mesmos filtros, sem
  // leitura extra quando ninguém abriu nada.
  const anexos = ativa ? await anexosDaConversa(ativa.id, casa.id) : [];
  const agoraIso = new Date().toISOString();

  // A chave inclui a conversa aberta: trocar de conversa remonta o chat com as
  // mensagens dela (o estado interno não acompanha prop nova). Trocar no meio
  // de "Pensando…" desmonta o chat com o envio no ar — cancela só a vista, sem
  // duplicar o envio (o `emAndamento` do chat já trava).
  const chat = (
    <ChatMentor
      key={`${casa.id}:${ativa?.id ?? "nova"}`}
      slug={slug}
      conversaId={ativa?.id ?? null}
      mensagensIniciais={mensagens}
      somenteLeitura={modoAdmin}
      anexosIniciais={anexos}
      fuso={casa.fuso}
      agoraIso={agoraIso}
    />
  );

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Mentor</h1>
        <Link
          href={`/r/${slug}/mentor/lembrancas`}
          className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-bold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          O que o mentor lembra
        </Link>
      </div>
      {todas.length === 0 ? (
        chat
      ) : (
        <div className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:items-start">
          <div className={cn(chatAberto && "hidden md:block")}>
            <ListaConversas
              slug={slug}
              conversas={abertas}
              arquivadas={arquivadas}
              ativaId={ativa?.id ?? null}
              fuso={casa.fuso}
              agoraIso={agoraIso}
              somenteLeitura={modoAdmin}
            />
          </div>
          <div className={cn(!chatAberto && "hidden md:block")}>
            {chatAberto ? (
              <Link
                href={`/r/${slug}/mentor`}
                className="mb-4 inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm font-bold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
              >
                <ArrowLeft aria-hidden="true" className="size-5" />
                Conversas
              </Link>
            ) : null}
            {chat}
          </div>
        </div>
      )}
    </section>
  );
}
