import { SecaoMeta } from "@/components/painel/ajustes/secao-meta";
import { SecaoTurnos } from "@/components/painel/ajustes/secao-turnos";
import { SeletorTema } from "@/components/painel/seletor-tema";
import { Button } from "@/components/ui/button";
import { formatarCnpj } from "@/lib/admin/cnpj";
import { emailsDosLoginsDaCasa } from "@/lib/admin/dados";
import {
  formatarHora,
  intervalosSchema,
  resumoDoHorario,
} from "@/lib/admin/horario";
import { sairAction } from "@/lib/auth/actions";
import { exigirCasa } from "@/lib/auth/sessao";
import { WHATSAPP_REPPLY } from "@/lib/contato";
import { logError } from "@/lib/logger";
import { mesAtualNoFuso } from "@/lib/painel/mes";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const metadata = { title: "Ajustes · repply food." };

/** "HH:MM[:SS]" -> milissegundos desde a meia-noite. */
function horaEmMs(hora: string): number {
  const [h = "0", m = "0"] = hora.split(":");
  return (Number(h) * 60 + Number(m)) * 60_000;
}

export default async function PaginaAjustes({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sessao, casa, modoAdmin } = await exigirCasa(slug);

  const supabase = await createClient();
  const [restaurante, metasQuery, loginsDoCliente] = await Promise.all([
    supabase
      .from("restaurantes")
      .select("cnpj, hora_virada, horario_funcionamento, turnos")
      .eq("id", casa.id)
      .maybeSingle(),
    supabase
      .from("metas")
      .select("mes, valor")
      .eq("restaurante_id", casa.id)
      .order("mes", { ascending: false }),
    modoAdmin
      ? emailsDosLoginsDaCasa(casa.id)
      : Promise.resolve([] as string[]),
  ]);

  // Falha de leitura vira a tela de erro (app/error.tsx), nunca um estado falso
  // numa tela de ESCRITA (mesmo princípio da tela Hoje; pendência 27).
  if (restaurante.error || !restaurante.data || metasQuery.error) {
    logError("falha_leitura_ajustes");
    throw new Error("falha_leitura_ajustes");
  }
  const dados = restaurante.data;

  const almocoAte =
    (dados.turnos as { almoco_ate?: string } | null)?.almoco_ate ?? "17:00";
  const metas = (metasQuery.data ?? []).map((m) => ({
    mes: String(m.mes),
    valor: String(m.valor),
  }));
  // Mês atual no fuso E na virada do dia da casa (igual à tela Hoje): recua a
  // virada antes de olhar o mês, para não adiantar o mês logo após a meia-noite.
  const mesAtualISO = mesAtualNoFuso(
    new Date(Date.now() - horaEmMs(dados.hora_virada)),
    casa.fuso
  );
  const horario = resumoDoHorario(
    intervalosSchema.safeParse(dados.horario_funcionamento).data ?? []
  );

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Ajustes</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <SecaoMeta
          slug={slug}
          metas={metas}
          mesAtualISO={mesAtualISO}
          somenteLeitura={modoAdmin}
        />
        <SecaoTurnos
          slug={slug}
          almocoAteInicial={almocoAte}
          somenteLeitura={modoAdmin}
        />

        <div className="brand-surface flex flex-col divide-y rounded-lg">
          {modoAdmin ? (
            <Link
              href={`/admin/restaurantes/${casa.id}`}
              className="flex min-h-14 items-center justify-between gap-4 px-4 py-2"
            >
              <span className="shrink-0">Login do cliente</span>
              <span className="min-w-0 break-all text-right text-quiet">
                {`${loginsDoCliente.length > 0 ? loginsDoCliente.join(", ") : "ainda não criado"} (ver no admin)`}
              </span>
            </Link>
          ) : (
            <>
              <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2">
                <span className="shrink-0">E-mail</span>
                <span className="min-w-0 break-all text-right text-quiet">
                  {sessao.email}
                </span>
              </div>
              <Link
                href={`/trocar-senha?voltar=${encodeURIComponent(`/r/${slug}/ajustes`)}`}
                className="flex min-h-14 items-center justify-between px-4"
              >
                <span>Trocar senha</span>
                <span aria-hidden="true">›</span>
              </Link>
            </>
          )}
          <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2">
            <span>Tema</span>
            <SeletorTema />
          </div>
        </div>

        <div className="brand-surface flex flex-col gap-2 rounded-lg p-4">
          <h2 className="text-lg font-semibold">Dados da casa</h2>
          <p className="text-sm text-quiet">Esses dados mudam com a Repply.</p>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-quiet">Nome</dt>
              <dd className="text-right">{casa.nome}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-quiet">CNPJ</dt>
              <dd className="text-right">
                {dados.cnpj ? formatarCnpj(dados.cnpj) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-quiet">Funcionamento</dt>
              <dd className="text-right">{horario}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-quiet">Virada do dia</dt>
              <dd className="text-right">
                {formatarHora(dados.hora_virada.slice(0, 5))}
              </dd>
            </div>
          </dl>
        </div>

        <a
          href={WHATSAPP_REPPLY.link}
          target="_blank"
          rel="noopener noreferrer"
          className="brand-surface flex min-h-14 items-center justify-between rounded-lg px-4"
        >
          <span>Falar com a Repply</span>
          <span className="text-quiet">
            WhatsApp <span aria-hidden="true">›</span>
            <span className="sr-only">, abre em nova aba</span>
          </span>
        </a>
      </div>

      {modoAdmin ? null : (
        <form action={sairAction}>
          <Button
            type="submit"
            variant="outline"
            size="toque"
            className="w-full md:w-auto"
          >
            Sair
          </Button>
        </form>
      )}
    </section>
  );
}
