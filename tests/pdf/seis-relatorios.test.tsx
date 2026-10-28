import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
// @vitest-environment node
import { DocumentoRelatorio } from "@/lib/pdf/relatorios";
import type { ResultadoCompletoDoRelatorio } from "@/lib/relatorios/pdf-dados";
import { resultadoSchemas } from "@/lib/relatorios/schemas-saida";
import type { ConsultaRelatorio } from "@/lib/relatorios/tipos";
import type { Relatorio } from "@/lib/validators/relatorios";
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

const executar = promisify(execFile);

async function textoPdf(pdf: Buffer): Promise<string | null> {
  const diretorio = await mkdtemp(join(tmpdir(), "repply-relatorio-pdf-"));
  const arquivo = join(diretorio, "relatorio.pdf");
  try {
    await writeFile(arquivo, pdf);
    const { stdout } = await executar("pdftotext", [
      "-enc",
      "UTF-8",
      arquivo,
      "-",
    ]);
    return stdout;
  } catch (erro) {
    if (
      typeof erro === "object" &&
      erro !== null &&
      "code" in erro &&
      erro.code === "ENOENT"
    )
      return null;
    throw erro;
  } finally {
    await rm(diretorio, { recursive: true, force: true });
  }
}

const consulta: ConsultaRelatorio = {
  filtros: { inicio: "2026-02-14", fim: "2026-02-14", fonte: "historico" },
  pagina: 1,
};
const envelope = {
  situacao: "completo" as const,
  revisao: "1",
  cobertura: {
    esperados: 1,
    recebidos: 1,
    ausentes: [],
    capturadoEm: "2026-02-15T08:00:00+00:00",
    simulacao: true,
    recursos: [],
  },
  paginacao: { pagina: 1, tamanho: 1, totalLinhas: 1 },
};

const resultados = {
  produtos: resultadoSchemas.produtos.parse({
    ...envelope,
    linhas: [
      {
        codigoProduto: "P1",
        produto: "Produto fictício",
        codigoPdv: "D1",
        pdv: "PDV fictício",
        codigoGrupo: "G1",
        grupo: "Grupo fictício",
        quantidade: "1.500",
        vendas: "15.00",
        custos: null,
        diferenca: null,
      },
    ],
    resumo: {
      quantidade: "1.500",
      vendas: "15.00",
      custos: null,
      diferenca: null,
      grupos: [
        {
          codigoPdv: "D1",
          codigoGrupo: "G1",
          quantidade: "1.500",
          vendas: "15.00",
          custos: null,
          diferenca: null,
        },
      ],
    },
  }),
  comissao: resultadoSchemas.comissao.parse({
    ...envelope,
    linhas: [
      {
        codigoOperador: "O1",
        operador: "Operador fictício",
        funcao: null,
        vendasElegiveis: "100.00",
        comissaoOficial: null,
      },
    ],
    resumo: {
      vendasElegiveis: "100.00",
      comissaoOficial: null,
      operadoresSemComissao: 1,
    },
  }),
  caixa: resultadoSchemas.caixa.parse({
    ...envelope,
    linhas: [
      {
        codigoLancamento: "L1",
        diaMovimento: "2026-02-14",
        diaCivil: "2026-02-14",
        momento: "2026-02-14T20:00:00-03:00",
        codigoOperador: "O1",
        operador: "Operador fictício",
        tipo: "credito",
        codigoCategoria: "C1",
        categoria: "Categoria fictícia",
        valor: "20.00",
      },
    ],
    resumo: {
      creditos: "20.00",
      debitos: "0.00",
      saldo: "20.00",
      grupos: [
        {
          codigoOperador: "O1",
          diaCivil: "2026-02-14",
          creditos: "20.00",
          debitos: "0.00",
          saldo: "20.00",
        },
      ],
    },
  }),
  auditoria: resultadoSchemas.auditoria.parse({
    ...envelope,
    linhas: [
      {
        tipo: "transferencia_produtos",
        momento: "2026-02-14T20:00:00-03:00",
        codigoOperador: "O1",
        operador: "Operador fictício",
        cartaoAnterior: "M1",
        cartaoNovo: "M2",
        codigoProduto: "P1",
        produto: "Produto fictício",
        quantidade: "1.000",
        valorUnitario: null,
        total: null,
        limiteMinimoAnterior: null,
        limiteMinimoNovo: null,
        limiteMaximoAnterior: null,
        limiteMaximoNovo: null,
        diaMovimento: "2026-02-14",
      },
    ],
    resumo: {
      ocorrencias: 1,
      porTipo: [
        {
          tipo: "transferencia_produtos",
          ocorrencias: 1,
          quantidade: null,
          total: null,
        },
      ],
    },
  }),
  "notas-assinadas": resultadoSchemas["notas-assinadas"].parse({
    ...envelope,
    linhas: [
      {
        codigoNota: "N1",
        codigoEntrada: "E1",
        diaMovimento: "2026-02-14",
        codigoCliente: "CL1",
        valor: "5.00",
      },
    ],
    resumo: { notas: 1, valor: "5.00" },
  }),
  financeiro: resultadoSchemas.financeiro.parse({
    ...envelope,
    linhas: [
      {
        diaMovimento: "2026-02-14",
        componentes: {
          consumo: "100.00",
          servico: "8.00",
          complemento: null,
          taxasEntrada: null,
          produtoEmbutido: null,
          flyers: null,
        },
        totaisOficiais: {
          projetado: "108.00",
          recebido: "93.00",
          notasAssinadas: "10.00",
          descontos: "5.00",
        },
        entradas: {
          habilitados: 5,
          reabilitados: 0,
          encerrados: 2,
          abertos: null,
        },
        meios: [
          {
            codigo: "DIN",
            rotulo: "Dinheiro",
            classe: "dinheiro",
            valor: "93.00",
          },
        ],
        publico: [
          { sexo: "nao_informado", categoria: "pagante", quantidade: 5 },
        ],
      },
    ],
    resumo: {
      componentes: {
        consumo: "100.00",
        servico: "8.00",
        complemento: null,
        taxasEntrada: null,
        produtoEmbutido: null,
        flyers: null,
      },
      totaisOficiais: {
        projetado: "108.00",
        recebido: "93.00",
        notasAssinadas: "10.00",
        descontos: "5.00",
      },
      entradas: {
        habilitados: 5,
        reabilitados: 0,
        encerrados: 2,
        abertos: null,
      },
      meios: [
        {
          codigo: "DIN",
          rotulo: "Dinheiro",
          classe: "dinheiro",
          valor: "93.00",
        },
      ],
      publico: [{ sexo: "nao_informado", categoria: "pagante", quantidade: 5 }],
    },
  }),
} satisfies Record<Relatorio, unknown>;

function completo<R extends Relatorio>(
  relatorio: R
): ResultadoCompletoDoRelatorio<R> {
  const resultado = resultados[relatorio];
  return {
    ...resultado,
    paginacao: {
      pagina: 1,
      tamanho: resultado.linhas.length,
      totalLinhas: resultado.paginacao.totalLinhas,
    },
  } as ResultadoCompletoDoRelatorio<R>;
}

describe("PDFs dos seis relatórios", () => {
  it.each(Object.keys(resultados) as Relatorio[])(
    "renderiza PDF válido para %s",
    async (relatorio) => {
      const pdf = await renderToBuffer(
        <DocumentoRelatorio
          casa={{ nome: "Casa Fictícia" }}
          relatorio={relatorio}
          consulta={consulta}
          resultado={completo(relatorio)}
          fuso="America/Recife"
          geradoEm={new Date("2026-02-15T12:00:00.000Z")}
        />
      );
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
      expect(pdf.byteLength).toBeGreaterThan(1000);
      const texto = await textoPdf(pdf);
      if (texto !== null) {
        expect(texto).toContain("Casa Fictícia");
        expect(texto).toContain("Dados fictícios de demonstração");
        switch (relatorio) {
          case "produtos":
            expect(texto).toContain("Totais completos por PDV e grupo");
            expect(texto).toContain("Não informado pela SCC");
            break;
          case "comissao":
            expect(texto).toContain("Vendas elegíveis");
            expect(texto).toContain("Operador fictício");
            expect(texto).toContain("Não informado pela SCC");
            break;
          case "caixa":
            expect(texto).toContain("Créditos");
            expect(texto).toContain(
              "Totais completos por operador e dia civil"
            );
            break;
          case "auditoria":
            expect(texto).toContain(
              "Transferência não representa valor perdido"
            );
            break;
          case "notas-assinadas":
            expect(texto).toContain("CL1");
            expect(texto).not.toContain("Nome do cliente");
            break;
          case "financeiro":
            expect(texto).toContain("Recebido oficial");
            expect(texto).toContain("Público agregado");
            break;
        }
      }
    }
  );

  it("quebra uma exportação de 205 produtos em múltiplas páginas reais", async () => {
    const resultado = resultadoSchemas.produtos.parse({
      ...envelope,
      linhas: Array.from({ length: 205 }, (_, indice) => ({
        codigoProduto: `P${indice + 1}`,
        produto: `Produto fictício ${indice + 1}`,
        codigoPdv: "D1",
        pdv: "PDV fictício",
        codigoGrupo: "G1",
        grupo: "Grupo fictício",
        quantidade: "1.000",
        vendas: "10.00",
        custos: "4.00",
        diferenca: "6.00",
      })),
      resumo: {
        quantidade: "205.000",
        vendas: "2050.00",
        custos: "820.00",
        diferenca: "1230.00",
        grupos: [
          {
            codigoPdv: "D1",
            codigoGrupo: "G1",
            quantidade: "205.000",
            vendas: "2050.00",
            custos: "820.00",
            diferenca: "1230.00",
          },
        ],
      },
      paginacao: { pagina: 1, tamanho: 100, totalLinhas: 205 },
    });
    const pdf = await renderToBuffer(
      <DocumentoRelatorio
        casa={{ nome: "Casa Fictícia" }}
        relatorio="produtos"
        consulta={consulta}
        resultado={
          {
            ...resultado,
            paginacao: { pagina: 1, tamanho: 205, totalLinhas: 205 },
          } as ResultadoCompletoDoRelatorio<Relatorio>
        }
        fuso="America/Recife"
        geradoEm={new Date("2026-02-15T12:00:00.000Z")}
      />
    );
    const paginas = pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? [];
    expect(paginas.length).toBeGreaterThanOrEqual(2);
    const texto = await textoPdf(pdf);
    if (texto !== null) expect(texto).toContain("Produto fictício 205");
  });
});
