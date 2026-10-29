import { dataBr } from "@/lib/admin/datas";
import { formatarValor } from "@/lib/relatorios/formatacao";
import type { ResultadoDoRelatorio } from "@/lib/relatorios/tipos";
import {
  CartaoLinha,
  GradeIndicadores,
  Indicador,
  type LinhaTabela,
  SecaoRelatorio,
  TabelaResponsiva,
} from "./componentes-comuns";

function rotuloContagem(valor: number | null) {
  return valor === null ? "Não informado pela SCC" : String(valor);
}

const nomesSexo: Record<string, string> = {
  masculino: "Masculino",
  feminino: "Feminino",
  nao_informado: "Não informado",
};
const nomesCategoria: Record<string, string> = {
  pagante: "Pagante",
  convidado: "Convidado",
  lista: "Lista",
  camarote: "Camarote",
  vip: "VIP",
  servico: "Serviço",
  outro: "Outro",
};
const nomesClasse: Record<string, string> = {
  dinheiro: "Dinheiro",
  credito: "Crédito",
  debito: "Débito",
  pix: "Pix",
  nota_assinada: "Nota assinada",
  desconto: "Desconto",
  outro: "Outro",
};

export function PainelFinanceiro({
  resultado,
}: {
  resultado: ResultadoDoRelatorio<"financeiro">;
}) {
  const { componentes, totaisOficiais, entradas, meios, publico } =
    resultado.resumo;
  const linhasDias: LinhaTabela[] = resultado.linhas.map((linha) => ({
    chave: linha.diaMovimento,
    celulas: [
      dataBr(linha.diaMovimento),
      formatarValor(linha.componentes.consumo),
      formatarValor(linha.componentes.servico),
      formatarValor(linha.totaisOficiais.recebido),
      String(linha.entradas.habilitados ?? "Não informado pela SCC"),
    ],
    cartao: (
      <CartaoLinha
        titulo={dataBr(linha.diaMovimento)}
        campos={[
          {
            rotulo: "Consumo",
            valor: formatarValor(linha.componentes.consumo),
          },
          {
            rotulo: "Serviço",
            valor: formatarValor(linha.componentes.servico),
          },
          {
            rotulo: "Recebido oficial",
            valor: formatarValor(linha.totaisOficiais.recebido),
          },
          {
            rotulo: "Entradas habilitadas",
            valor: rotuloContagem(linha.entradas.habilitados),
          },
        ]}
      />
    ),
  }));
  const linhasMeios: LinhaTabela[] = meios.map((meio) => ({
    chave: `${meio.codigo}:${meio.classe}`,
    celulas: [
      <code key="codigo">{meio.codigo}</code>,
      meio.rotulo,
      nomesClasse[meio.classe] ?? meio.classe,
      formatarValor(meio.valor),
    ],
    cartao: (
      <CartaoLinha
        titulo={meio.rotulo}
        campos={[
          { rotulo: "Código", valor: <code>{meio.codigo}</code> },
          { rotulo: "Classe", valor: nomesClasse[meio.classe] ?? meio.classe },
          { rotulo: "Valor do meio", valor: formatarValor(meio.valor) },
        ]}
      />
    ),
  }));
  const linhasPublico: LinhaTabela[] = publico.map((celula) => ({
    chave: `${celula.sexo}:${celula.categoria}`,
    celulas: [
      nomesSexo[celula.sexo] ?? celula.sexo,
      nomesCategoria[celula.categoria] ?? celula.categoria,
      String(celula.quantidade),
    ],
    cartao: (
      <CartaoLinha
        titulo={`${nomesCategoria[celula.categoria] ?? celula.categoria} · ${celula.quantidade}`}
        campos={[
          {
            rotulo: "Sexo agregado",
            valor: nomesSexo[celula.sexo] ?? celula.sexo,
          },
        ]}
      />
    ),
  }));

  return (
    <div className="flex flex-col gap-5">
      <GradeIndicadores>
        <Indicador
          titulo="Recebido oficial pela SCC"
          valor={formatarValor(totaisOficiais.recebido)}
        />
        <Indicador
          titulo="Total projetado informado"
          valor={formatarValor(totaisOficiais.projetado)}
        />
        <Indicador
          titulo="Consumo"
          valor={formatarValor(componentes.consumo)}
        />
        <Indicador
          titulo="Serviço (separado)"
          valor={formatarValor(componentes.servico)}
        />
      </GradeIndicadores>

      <SecaoRelatorio titulo="Componentes informados">
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ["Consumo", componentes.consumo],
            ["Serviço", componentes.servico],
            ["Complemento", componentes.complemento],
            ["Taxas de entrada", componentes.taxasEntrada],
            ["Produto embutido", componentes.produtoEmbutido],
            ["Flyers", componentes.flyers],
          ].map(([rotulo, valor]) => (
            <div className="rounded-md border p-3" key={String(rotulo)}>
              <dt className="text-sm text-muted-foreground">{rotulo}</dt>
              <dd className="mt-1 font-mono tabular-nums">
                {formatarValor(valor as string | null)}
              </dd>
            </div>
          ))}
        </dl>
      </SecaoRelatorio>

      <SecaoRelatorio titulo="Totais oficiais da SCC">
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Projetado", totaisOficiais.projetado],
            ["Recebido", totaisOficiais.recebido],
            ["Notas assinadas", totaisOficiais.notasAssinadas],
            ["Descontos", totaisOficiais.descontos],
          ].map(([rotulo, valor]) => (
            <div className="rounded-md border p-3" key={String(rotulo)}>
              <dt className="text-sm text-muted-foreground">{rotulo}</dt>
              <dd className="mt-1 font-mono tabular-nums">
                {formatarValor(valor as string | null)}
              </dd>
            </div>
          ))}
        </dl>
      </SecaoRelatorio>

      <SecaoRelatorio titulo="Meios informados pela SCC">
        <p className="text-sm text-muted-foreground">
          O total oficial recebido é apresentado separadamente dos meios de
          pagamento.
        </p>
        <TabelaResponsiva
          rotulo="Meios de pagamento"
          colunas={["Código", "Meio", "Classe", "Valor"]}
          linhas={linhasMeios}
        />
      </SecaoRelatorio>

      <SecaoRelatorio titulo="Contagens de entradas">
        <dl className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {[
            ["Habilitados", entradas.habilitados],
            ["Reabilitados", entradas.reabilitados],
            ["Encerrados", entradas.encerrados],
            ["Abertos", entradas.abertos],
          ].map(([rotulo, valor]) => (
            <div className="rounded-md border p-3" key={String(rotulo)}>
              <dt className="text-sm text-muted-foreground">{rotulo}</dt>
              <dd className="mt-1 font-mono tabular-nums">
                {rotuloContagem(valor as number | null)}
              </dd>
            </div>
          ))}
        </dl>
      </SecaoRelatorio>

      <SecaoRelatorio titulo="Público agregado">
        <p className="text-sm text-muted-foreground">
          Apenas contagens agrupadas por sexo e categoria, sem registros de
          pessoas.
        </p>
        <TabelaResponsiva
          rotulo="Público agregado por sexo e categoria"
          colunas={["Sexo (agregado)", "Categoria", "Quantidade"]}
          linhas={linhasPublico}
        />
      </SecaoRelatorio>

      <SecaoRelatorio titulo="Resumo por dia">
        <TabelaResponsiva
          rotulo="Resumo financeiro por dia"
          colunas={[
            "Movimento",
            "Consumo",
            "Serviço",
            "Recebido oficial",
            "Entradas habilitadas",
          ]}
          linhas={linhasDias}
        />
      </SecaoRelatorio>
    </div>
  );
}
