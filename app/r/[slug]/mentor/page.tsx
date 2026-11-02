import { ChatMentor } from "@/components/painel/mentor/chat-mentor";
import { exigirCasa } from "@/lib/auth/sessao";
import { conversasDaCasa, mensagensDaConversa } from "@/lib/mentor/leitura";

export const metadata = { title: "Mentor · repply food." };

// O mentor pode fazer até ~6 chamadas ao provedor de IA antes de responder, e a
// Vercel mata a função no tempo padrão. O Next aplica o `maxDuration` da página
// a toda função do servidor chamada por ela (`enviarMensagemAction`).
// No merge, conferir o teto do plano da Vercel.
export const maxDuration = 60;

export default async function PaginaMentor({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { casa, modoAdmin } = await exigirCasa(slug);

  // A conversa de hoje é a mais recente que tem mensagem (a lista já ignora as
  // vazias). Sem nenhuma, o chat abre no estado vazio. Falha de leitura vira a
  // tela de erro, nunca "nenhuma conversa" (mesmo princípio dos Ajustes).
  const [ultima] = await conversasDaCasa(casa.id);
  const mensagens = ultima ? await mensagensDaConversa(ultima.id, casa.id) : [];

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Mentor</h1>
      <ChatMentor
        key={casa.id}
        slug={slug}
        conversaId={ultima?.id ?? null}
        mensagensIniciais={mensagens}
        somenteLeitura={modoAdmin}
      />
    </section>
  );
}
