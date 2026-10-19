import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = { title: "Criar senha nova · repply food." };

const TIPOS_ACEITOS = new Set(["recovery", "invite"]);

/**
 * O link do e-mail cai aqui (GET) e só mostra um botão. Quem clica faz o POST
 * para /auth/confirmar/validar, que gasta o token. O antivírus de e-mail faz só
 * o GET e não gasta nada (dívida 40). Sem campo sensível digitado: um form POST
 * nativo basta e funciona sem JavaScript.
 */
export default async function PaginaConfirmar({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;
  const valido = Boolean(token_hash) && TIPOS_ACEITOS.has(type ?? "");

  // `/auth/confirmar` não está no grupo `(entrada)`, então não herda o cartão
  // centralizado daquele layout. O `<main>` abaixo centraliza por conta própria,
  // como `app/error.tsx` e `app/not-found.tsx`.
  const molduraCentral =
    "mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6";

  if (!valido) {
    return (
      <main className={molduraCentral}>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">Link inválido</h1>
          <p className="text-sm text-muted-foreground">
            Este link não vale mais. Peça outro em “Esqueci a senha”.
          </p>
        </div>
        <Link
          href="/entrar"
          className="flex min-h-11 items-center justify-center text-center text-sm underline underline-offset-4"
        >
          Voltar para entrar
        </Link>
      </main>
    );
  }

  return (
    <main className={molduraCentral}>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Crie sua senha nova</h1>
        <p className="text-sm text-muted-foreground">
          Clique no botão para confirmar o pedido e criar a senha nova.
        </p>
      </div>
      <form
        method="post"
        action="/auth/confirmar/validar"
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next ?? "/nova-senha"} />
        <Button type="submit" size="toque" className="w-full">
          Criar minha senha nova
        </Button>
      </form>
    </main>
  );
}
