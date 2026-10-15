import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

/**
 * Página de endereço não encontrado, em português (o 404 padrão do Next é em
 * inglês, e a regra do projeto é tudo em PT-BR). Aparece quando uma página
 * chama `notFound()` — por exemplo o detalhe ou a edição de um restaurante
 * no admin com um id que não existe.
 */
export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Página não encontrada</h1>
        <p className="text-sm text-muted-foreground">
          O endereço que você abriu não existe ou foi movido.
        </p>
      </div>
      <Link
        href="/"
        className={cn(buttonVariants({ size: "toque" }), "w-full")}
      >
        Ir para o início
      </Link>
    </main>
  );
}
