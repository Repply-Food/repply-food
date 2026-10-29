import type { ResultadoCompletoDoRelatorio } from "@/lib/relatorios/pdf-dados";
import type { ConsultaRelatorio } from "@/lib/relatorios/tipos";
import {
  DocumentoBase,
  ResumoPdf,
  SecaoPdf,
  TabelaPdf,
  dataCivilPdf,
  valorPdf,
} from "./base";

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

export function DocumentoFinanceiro({
  casa,
  consulta,
  resultado,
  fuso,
  geradoEm,
}: {
  casa: { nome: string };
  consulta: ConsultaRelatorio;
  resultado: ResultadoCompletoDoRelatorio<"financeiro">;
  fuso: string;
  geradoEm: Date;
}) {
  const { componentes, totaisOficiais, entradas, meios, publico } =
    resultado.resumo;
  return (
    <DocumentoBase
      titulo="Resumo financeiro"
      casa={casa}
      consulta={consulta}
      resultado={resultado}
      fuso={fuso}
      geradoEm={geradoEm}
    >
      <SecaoPdf titulo="Componentes informados">
        {[
          ["Consumo", componentes.consumo],
          ["Serviço (separado do faturamento)", componentes.servico],
          ["Complemento", componentes.complemento],
          ["Taxas de entrada", componentes.taxasEntrada],
          ["Produto embutido", componentes.produtoEmbutido],
          ["Flyers", componentes.flyers],
        ].map(([rotulo, valor]) => (
          <ResumoPdf
            key={String(rotulo)}
            rotulo={String(rotulo)}
            valor={valorPdf(valor as string | null)}
          />
        ))}
      </SecaoPdf>
      <SecaoPdf titulo="Totais oficiais informados pela SCC">
        <ResumoPdf
          rotulo="Recebido oficial"
          valor={valorPdf(totaisOficiais.recebido)}
        />
        <ResumoPdf
          rotulo="Projetado informado"
          valor={valorPdf(totaisOficiais.projetado)}
        />
        <ResumoPdf
          rotulo="Notas assinadas"
          valor={valorPdf(totaisOficiais.notasAssinadas)}
        />
        <ResumoPdf
          rotulo="Descontos"
          valor={valorPdf(totaisOficiais.descontos)}
        />
      </SecaoPdf>
      <SecaoPdf titulo="Contagens de entradas">
        <TabelaPdf
          cabecalho={["Habilitados", "Reabilitados", "Encerrados", "Abertos"]}
          linhas={[
            [
              entradas.habilitados === null
                ? "Não informado pela SCC"
                : String(entradas.habilitados),
              entradas.reabilitados === null
                ? "Não informado pela SCC"
                : String(entradas.reabilitados),
              entradas.encerrados === null
                ? "Não informado pela SCC"
                : String(entradas.encerrados),
              entradas.abertos === null
                ? "Não informado pela SCC"
                : String(entradas.abertos),
            ],
          ]}
        />
      </SecaoPdf>
      <SecaoPdf titulo="Meios informados pela SCC">
        <ResumoPdf
          rotulo="Observação"
          valor="Meios de pagamento são apresentados separadamente do recebido oficial; não são somados a ele."
        />
        <TabelaPdf
          cabecalho={["Código", "Meio", "Classe", "Valor informado"]}
          larguras={[18, 34, 24, 24]}
          linhas={meios.map((meio) => [
            meio.codigo,
            meio.rotulo,
            nomesClasse[meio.classe] ?? meio.classe,
            valorPdf(meio.valor),
          ])}
        />
      </SecaoPdf>
      <SecaoPdf titulo="Público agregado por sexo e categoria">
        <ResumoPdf
          rotulo="Privacidade"
          valor="Contagens agregadas; este relatório não contém lista nem identificação de pessoas."
        />
        <TabelaPdf
          cabecalho={["Sexo (agregado)", "Categoria", "Quantidade"]}
          linhas={publico.map((celula) => [
            nomesSexo[celula.sexo] ?? celula.sexo,
            nomesCategoria[celula.categoria] ?? celula.categoria,
            String(celula.quantidade),
          ])}
        />
      </SecaoPdf>
      <SecaoPdf titulo="Movimento por dia">
        <TabelaPdf
          cabecalho={[
            "Dia",
            "Recebido oficial",
            "Consumo",
            "Serviço",
            "Entradas habilitadas",
          ]}
          larguras={[18, 22, 20, 20, 20]}
          linhas={resultado.linhas.map((linha) => [
            dataCivilPdf(linha.diaMovimento),
            valorPdf(linha.totaisOficiais.recebido),
            valorPdf(linha.componentes.consumo),
            valorPdf(linha.componentes.servico),
            linha.entradas.habilitados === null
              ? "Não informado pela SCC"
              : String(linha.entradas.habilitados),
          ])}
        />
      </SecaoPdf>
    </DocumentoBase>
  );
}
