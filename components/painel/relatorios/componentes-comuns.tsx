import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReactNode } from "react";

export function Indicador({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string;
}) {
  return (
    <Card className="min-w-0 gap-2 py-3">
      <CardHeader className="gap-0 px-3">
        <CardTitle className="text-xs leading-snug text-muted-foreground">
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3">
        <p className="break-words font-mono text-lg font-semibold tabular-nums sm:text-xl">
          {valor}
        </p>
      </CardContent>
    </Card>
  );
}

export function GradeIndicadores({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {children}
    </div>
  );
}

export type LinhaTabela = {
  chave: string;
  celulas: ReactNode[];
  cartao: ReactNode;
};

export function TabelaResponsiva({
  rotulo,
  colunas,
  linhas,
}: {
  rotulo: string;
  colunas: string[];
  linhas: LinhaTabela[];
}) {
  if (linhas.length === 0)
    return (
      <p className="rounded-md border p-3 text-sm text-muted-foreground">
        Nenhuma linha para exibir.
      </p>
    );

  return (
    <>
      <ul className="grid gap-2 md:hidden" aria-label={rotulo}>
        {linhas.map((linha) => (
          <li key={linha.chave}>{linha.cartao}</li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-md border md:block">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <caption className="sr-only">{rotulo}</caption>
          <thead className="bg-surface-subtle text-xs text-muted-foreground">
            <tr>
              {colunas.map((coluna) => (
                <th className="px-3 py-2 font-medium" key={coluna} scope="col">
                  {coluna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhas.map((linha) => (
              <tr key={linha.chave}>
                {linha.celulas.map((celula, indice) => (
                  <td
                    className="px-3 py-2 align-top"
                    key={`${linha.chave}-${colunas[indice]}`}
                  >
                    {celula}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function CartaoLinha({
  titulo,
  campos,
}: {
  titulo: string;
  campos: { rotulo: string; valor: ReactNode }[];
}) {
  return (
    <dl className="grid gap-2 rounded-md border p-3 text-sm">
      <div className="border-b pb-2 font-semibold">{titulo}</div>
      {campos.map(({ rotulo, valor }) => (
        <div
          className="grid grid-cols-[minmax(6rem,0.7fr)_minmax(0,1fr)] gap-2"
          key={rotulo}
        >
          <dt className="text-muted-foreground">{rotulo}</dt>
          <dd className="min-w-0 break-words">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SecaoRelatorio({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={titulo}>
      <h2 className="text-base font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

export function rotuloAusente(valor: string | null | undefined): string {
  return valor ?? "Não informado pela SCC";
}
