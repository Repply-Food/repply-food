import { Card, CardContent } from "@/components/ui/card";
import { formatarBRL } from "@/lib/format/dinheiro";
import { cn } from "@/lib/utils";

export function CartaoComparativo({
  titulo,
  valor,
  variacao,
  dinheiro = false,
}: {
  titulo: string;
  valor: string | number | null;
  variacao: number | null;
  dinheiro?: boolean;
}) {
  const acima = variacao !== null && variacao >= 0;
  const texto =
    variacao === null ? "—" : `${Math.round(Math.abs(variacao) * 100)}%`;

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="label-mono text-quiet">{titulo}</span>
        <span className="number-mono text-xl font-bold tracking-tight">
          {valor === null ? "—" : dinheiro ? formatarBRL(valor) : valor}
        </span>
        <span
          className={cn(
            "number-mono text-xs font-bold",
            variacao !== null && (acima ? "text-success" : "text-destructive")
          )}
        >
          {variacao === null ? null : (
            <span aria-hidden="true">{acima ? "▲" : "▼"} </span>
          )}
          {texto}
        </span>
      </CardContent>
    </Card>
  );
}
