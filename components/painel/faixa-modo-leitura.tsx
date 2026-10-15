import Link from "next/link";

/**
 * O admin vendo o painel de um cliente (D-58): faixa fixa em todas as telas da
 * casa, com o caminho de volta. Fundo laranja com texto quase-preto (nunca
 * branco sobre laranja). O link ganha área de toque de 44 px pelo
 * pseudo-elemento, sem mudar o desenho.
 */
export function FaixaModoLeitura({
  nome,
  restauranteId,
}: {
  nome: string;
  restauranteId: string;
}) {
  return (
    <section
      aria-label="Modo leitura do admin"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-primary px-4 py-2 text-sm text-primary-foreground md:px-8"
    >
      <p>
        Você está vendo o painel de <strong>{nome}</strong> · só leitura
      </p>
      <Link
        href={`/admin/restaurantes/${restauranteId}`}
        className="relative font-bold underline underline-offset-4 after:absolute after:-inset-x-2 after:-inset-y-3"
      >
        Voltar ao admin
      </Link>
    </section>
  );
}
