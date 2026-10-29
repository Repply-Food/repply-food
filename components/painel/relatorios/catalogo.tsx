import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { REGISTRO_RELATORIOS } from "@/lib/relatorios/registro";
import Link from "next/link";

export function CatalogoRelatorios({ slug }: { slug: string }) {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Object.values(REGISTRO_RELATORIOS).map((relatorio) => (
        <li key={relatorio.slug}>
          <Card className="h-full transition-colors hover:border-foreground/30 focus-within:border-foreground/50">
            <CardHeader>
              <CardTitle>{relatorio.titulo}</CardTitle>
              <CardDescription>{relatorio.descricao}</CardDescription>
            </CardHeader>
            <CardFooter className="mt-auto">
              <Link
                className="font-semibold text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                href={`/r/${slug}/relatorios/${relatorio.slug}`}
              >
                Abrir relatório <span aria-hidden="true">→</span>
              </Link>
            </CardFooter>
          </Card>
        </li>
      ))}
    </ul>
  );
}
