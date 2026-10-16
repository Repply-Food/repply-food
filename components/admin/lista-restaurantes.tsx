import { SeloDados } from "@/components/painel/selo-dados";
import { buttonVariants } from "@/components/ui/button";
import { momentoNaCasa } from "@/lib/admin/datas";
import {
  type LinhaDaLista,
  contadoresDaLista,
  ordenarParaAtencao,
} from "@/lib/admin/lista";
import { seloDoSinal } from "@/lib/painel/selo";
import { cn } from "@/lib/utils";
import Link from "next/link";

/** Etiqueta "suspenso", sempre com texto (a cor nunca é o único canal). */
export function EtiquetaSuspenso() {
  return (
    <span className="number-mono inline-flex w-fit items-center rounded-full border border-current px-2 py-0.5 text-xs">
      suspenso
    </span>
  );
}

type Props = {
  linhas: readonly LinhaDaLista[];
  /** Momento da leitura, para "há X min" e "hoje 21:38" (no fuso de cada casa). */
  agoraIso: string;
  selecionado?: string | null;
  /** `false` no detalhe do computador, onde o título da página é o restaurante. */
  tituloPrincipal?: boolean;
};

/**
 * Lista de restaurantes (desenho §1.1): ordem de atenção, contadores, selo do
 * vigia (D-53), último envio no fuso da casa e versão do SCC. Cartões no
 * celular; tabela no computador.
 */
export function ListaRestaurantes({
  linhas,
  agoraIso,
  selecionado = null,
  tituloPrincipal = true,
}: Props) {
  const agora = new Date(agoraIso);
  const ordenadas = ordenarParaAtencao(linhas);
  const Titulo = tituloPrincipal ? "h1" : "h2";
  const selo = (l: LinhaDaLista) =>
    seloDoSinal({
      estado: l.estado,
      ultimoEnvioOkEm: l.ultimoEnvioOkEm,
      agora,
      fuso: l.fuso,
    });
  const endereco = (l: LinhaDaLista) => `/admin/restaurantes/${l.id}`;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Titulo className="text-2xl font-semibold">Restaurantes</Titulo>
        <Link
          href="/admin/restaurantes/novo"
          className={cn(buttonVariants({ size: "toque" }), "md:h-9 md:text-sm")}
        >
          + Cadastrar restaurante
        </Link>
      </div>

      {linhas.length === 0 ? (
        <p className="brand-surface rounded-xl p-6 text-quiet">
          Nenhum restaurante cadastrado ainda.
        </p>
      ) : (
        <>
          <ul aria-label="Resumo dos envios" className="flex flex-wrap gap-2">
            {contadoresDaLista(linhas).map((texto) => (
              <li
                key={texto}
                className="number-mono rounded-full border px-3 py-1 text-xs"
              >
                {texto}
              </li>
            ))}
          </ul>

          <ul
            aria-label="Restaurantes"
            className="flex flex-col gap-2 md:hidden"
          >
            {ordenadas.map((l) => (
              <li key={l.id}>
                <Link
                  href={l.id === selecionado ? "/admin" : endereco(l)}
                  data-linha-restaurante
                  aria-current={l.id === selecionado ? "page" : undefined}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <strong className="truncate">{l.nome}</strong>
                    <span className="number-mono text-xs text-quiet">
                      {momentoNaCasa(l.ultimoEnvioOkEm, agora, l.fuso)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <SeloDados selo={selo(l)} compacto />
                    {l.situacao === "suspenso" ? <EtiquetaSuspenso /> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <table className="hidden w-full border-separate border-spacing-0 overflow-hidden rounded-xl border text-sm md:table">
            <thead>
              <tr className="text-left">
                {["Restaurante", "Envio de dados", "Último envio", "SCC"].map(
                  (coluna) => (
                    <th
                      key={coluna}
                      scope="col"
                      className="label-mono border-b px-3 py-2 font-normal text-quiet"
                    >
                      {coluna}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((l) => {
                const atual = l.id === selecionado;
                return (
                  <tr
                    key={l.id}
                    className={cn("relative", atual && "bg-muted")}
                  >
                    <td
                      className={cn(
                        "border-b px-3 py-2",
                        atual && "border-l-4 border-l-primary"
                      )}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        {/* Link "esticado": o `after:inset-0` se ancora no <tr>
                            `relative` e cobre a linha toda, deixando qualquer
                            ponto dela clicável (continua link de verdade —
                            teclado e abrir em nova aba funcionam). A linha já
                            aberta aponta para /admin: clicar de novo fecha. */}
                        <Link
                          href={atual ? "/admin" : endereco(l)}
                          data-linha-restaurante
                          aria-current={atual ? "page" : undefined}
                          className={cn(
                            "underline-offset-4 after:absolute after:inset-0 hover:underline",
                            atual && "font-bold"
                          )}
                        >
                          {l.nome}
                        </Link>
                        {l.situacao === "suspenso" ? (
                          <EtiquetaSuspenso />
                        ) : null}
                      </span>
                    </td>
                    <td className="border-b px-3 py-2">
                      <SeloDados selo={selo(l)} />
                    </td>
                    <td className="number-mono border-b px-3 py-2">
                      {momentoNaCasa(l.ultimoEnvioOkEm, agora, l.fuso)}
                    </td>
                    <td className="number-mono border-b px-3 py-2">
                      {l.versaoScc ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
