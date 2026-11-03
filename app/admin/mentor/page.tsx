import { FormularioCartilha } from "@/components/admin/formulario-cartilha";
import { NavegacaoDoMentor } from "@/components/admin/navegacao-do-mentor";
import { VersoesDaCartilha } from "@/components/admin/versoes-da-cartilha";
import { momentoNaCasa } from "@/lib/admin/datas";
import { FUSO_PADRAO } from "@/lib/admin/fusos";
import { exigirAdmin } from "@/lib/auth/sessao";
import { cartilhaAtiva, historicoCartilhas } from "@/lib/mentor/cartilha";

export const metadata = { title: "Cartilha do mentor · admin · repply food." };

/**
 * O editor da cartilha: o texto que afina o jeito do mentor responder, e abaixo
 * as versões anteriores (só leitura, para conferir e copiar de volta). Só o
 * admin chega aqui (a página, as leituras e a função de salvar conferem cada uma
 * por conta própria). O dono nunca vê esta tela nem este texto.
 */
export default async function PaginaCartilhaDoMentor() {
  await exigirAdmin();
  const [ativa, versoes] = await Promise.all([
    cartilhaAtiva(),
    historicoCartilhas(),
  ]);
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <NavegacaoDoMentor atual="cartilha" />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Cartilha do mentor</h1>
        <p className="text-quiet">
          É o texto que afina o jeito do mentor responder. Vale para todas as
          casas, e o dono nunca o vê. Cada vez que você salva nasce uma versão
          nova, e a anterior fica guardada.
        </p>
        <p className="text-sm text-quiet">
          {ativa
            ? `Versão ativa desde ${momentoNaCasa(ativa.criada_em, new Date(), FUSO_PADRAO)}.`
            : "Nenhuma cartilha ativa: o mentor responde só com as regras fixas do sistema."}
        </p>
      </div>
      <FormularioCartilha textoInicial={ativa?.texto ?? ""} />
      <VersoesDaCartilha
        versoes={versoes}
        agoraIso={new Date().toISOString()}
      />
    </section>
  );
}
