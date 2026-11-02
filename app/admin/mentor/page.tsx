import { FormularioCartilha } from "@/components/admin/formulario-cartilha";
import { momentoNaCasa } from "@/lib/admin/datas";
import { FUSO_PADRAO } from "@/lib/admin/fusos";
import { exigirAdmin } from "@/lib/auth/sessao";
import { cartilhaAtiva } from "@/lib/mentor/cartilha";
import Link from "next/link";

export const metadata = { title: "Cartilha do mentor · admin · repply food." };

/**
 * O editor da cartilha: o texto que afina o jeito do mentor responder. Só o
 * admin chega aqui (a página, a leitura e a função de salvar conferem cada uma
 * por conta própria). O dono nunca vê esta tela nem este texto.
 */
export default async function PaginaCartilhaDoMentor() {
  await exigirAdmin();
  const ativa = await cartilhaAtiva();
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/admin"
        className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4"
      >
        ‹ Restaurantes
      </Link>
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
    </section>
  );
}
