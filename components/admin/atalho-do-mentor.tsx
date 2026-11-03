import { ChevronRight } from "lucide-react";
import Link from "next/link";

/**
 * A entrada do admin para a área do mentor de IA (cartilha e conversas), na
 * home do admin, logo abaixo da lista de restaurantes. É um cartão discreto no
 * mesmo desenho dos cartões de restaurante do celular (borda, cantos, 56 px de
 * altura), sem mexer no topo aprovado do admin (`TopoAdmin`). Leva ao editor da
 * cartilha; de lá, e das conversas, os dois lados se ligam entre si
 * (`NavegacaoDoMentor`). O texto vai por extenso, e o chevron só reforça que é
 * um link (a cor nunca é o único canal).
 */
export function AtalhoDoMentor() {
  return (
    <Link
      href="/admin/mentor"
      className="flex min-h-14 items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <strong>Mentor</strong>
        <span className="text-xs text-quiet">
          Cartilha e conversas dos donos com o mentor
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-quiet" />
    </Link>
  );
}
