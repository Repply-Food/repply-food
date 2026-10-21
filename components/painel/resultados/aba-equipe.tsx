import { Card, CardContent } from "@/components/ui/card";
import { formatarBRL } from "@/lib/format/dinheiro";
import type { DadosDeResultados } from "@/lib/metricas/resultados/tipos";

function nomeGarcom(codigo: number | null) {
  return codigo === null ? "Sem garçom" : `Garçom ${codigo}`;
}

export function AbaEquipe({ dados }: { dados: DadosDeResultados }) {
  if (dados.equipe.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-quiet">Sem contas pagas no período</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:hidden">
        {dados.equipe.map((pessoa, indice) => (
          <Card key={`${pessoa.codGarcom ?? "sem"}-${indice}`} size="sm">
            <CardContent className="grid grid-cols-2 gap-2">
              <strong>{nomeGarcom(pessoa.codGarcom)}</strong>
              <strong className="number-mono text-right">
                {formatarBRL(pessoa.faturamento)}
              </strong>
              <span className="text-xs text-quiet">{pessoa.contas} contas</span>
              <span className="text-right text-xs text-quiet">
                Taxa {formatarBRL(pessoa.taxaServico)}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="hidden md:flex">
        <CardContent className="overflow-x-auto px-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                {[
                  "Garçom",
                  "Faturamento",
                  "Contas",
                  "Pessoas",
                  "Por conta",
                  "Por pessoa",
                  "Taxa de serviço",
                ].map((coluna) => (
                  <th
                    key={coluna}
                    scope="col"
                    className="label-mono border-b px-4 py-2 font-normal text-quiet"
                  >
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dados.equipe.map((pessoa, indice) => (
                <tr key={`${pessoa.codGarcom ?? "sem"}-${indice}`}>
                  <th scope="row" className="border-b px-4 py-3 text-left">
                    {nomeGarcom(pessoa.codGarcom)}
                  </th>
                  <td className="number-mono border-b px-4 py-3">
                    {formatarBRL(pessoa.faturamento)}
                  </td>
                  <td className="number-mono border-b px-4 py-3">
                    {pessoa.contas}
                  </td>
                  <td className="number-mono border-b px-4 py-3">
                    {pessoa.pessoas}
                  </td>
                  <td className="number-mono border-b px-4 py-3">
                    {pessoa.ticketConta ? formatarBRL(pessoa.ticketConta) : "—"}
                  </td>
                  <td className="number-mono border-b px-4 py-3">
                    {pessoa.ticketPessoa
                      ? formatarBRL(pessoa.ticketPessoa)
                      : "—"}
                  </td>
                  <td className="number-mono border-b px-4 py-3">
                    {formatarBRL(pessoa.taxaServico)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
