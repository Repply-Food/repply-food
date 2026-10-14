import { Button } from "@/components/ui/button";
import { sairAction } from "@/lib/auth/actions";

/** Sai só deste aparelho (o login é compartilhado, D-10). */
export function BotaoSair({
  variante = "ghost",
}: {
  variante?: "ghost" | "outline";
}) {
  return (
    <form action={sairAction}>
      <Button type="submit" variant={variante} size="toque" className="w-full">
        Sair
      </Button>
    </form>
  );
}
