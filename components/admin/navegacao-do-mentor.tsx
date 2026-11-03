import Link from "next/link";

/** Para onde vai o link do lado: quem está na cartilha vai às conversas e vice-versa. */
const IRMA = {
  cartilha: { href: "/admin/mentor/conversas", texto: "Conversas do mentor ›" },
  conversas: { href: "/admin/mentor", texto: "Cartilha do mentor ›" },
} as const;

const LINK =
  "inline-flex min-h-11 items-center text-sm underline underline-offset-4";

/**
 * A faixa de cima das duas telas do mentor no admin (cartilha e conversas):
 * "voltar" para a lista de restaurantes à esquerda e o link para a tela irmã à
 * direita, para a equipe circular entre as duas sem digitar endereço. Cada link
 * tem 44 px de altura (toque no celular) e, se faltar largura, o da direita
 * desce para a linha de baixo em vez de ser cortado.
 */
export function NavegacaoDoMentor({
  atual,
}: {
  atual: "cartilha" | "conversas";
}) {
  const irma = IRMA[atual];
  return (
    <nav
      aria-label="Mentor"
      className="flex flex-wrap items-center justify-between gap-x-4"
    >
      <Link href="/admin" className={LINK}>
        ‹ Restaurantes
      </Link>
      <Link href={irma.href} className={LINK}>
        {irma.texto}
      </Link>
    </nav>
  );
}
