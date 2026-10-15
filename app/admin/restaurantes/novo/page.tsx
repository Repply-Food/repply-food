import { FormularioRestaurante } from "@/components/admin/formulario-restaurante";
import { VALORES_INICIAIS } from "@/lib/admin/schemas";
import { exigirAdmin } from "@/lib/auth/sessao";
import Link from "next/link";

export const metadata = {
  title: "Cadastrar restaurante · admin · repply food.",
};

export default async function PaginaNovoRestaurante() {
  await exigirAdmin();
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/admin"
        className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4"
      >
        ‹ Restaurantes
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Cadastrar restaurante</h1>
        <p className="text-sm text-quiet">
          O endereço do painel sai do nome e não muda depois. Turnos, limite da
          conta esquecida e intervalo de envio ficam com o padrão.
        </p>
      </div>
      <FormularioRestaurante
        modo="cadastro"
        valoresIniciais={VALORES_INICIAIS}
      />
    </section>
  );
}
