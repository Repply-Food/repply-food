import { PainelRelatorio } from "@/components/painel/relatorios/painel-relatorio";
import { resultadoSchemas } from "@/lib/relatorios/schemas-saida";
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

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
  paginacao: { pagina: 1, tamanho: 25, totalLinhas: 1 },
};

describe("painel discriminado dos seis relatórios", () => {
  it("mostra produtos com totais completos por grupo e null explícito", () => {
    const resultado = resultadoSchemas.produtos.parse({
      ...envelope,
      paginacao: { pagina: 2, tamanho: 1, totalLinhas: 2 },
      linhas: [
        {
          codigoProduto: "P1",
          produto: "Produto fictício",
          codigoPdv: "D1",
          pdv: "PDV fictício",
          codigoGrupo: "G1",
          grupo: "Grupo fictício",
          quantidade: "1.250",
          vendas: "100.00",
          custos: null,
          diferenca: null,
        },
      ],
      resumo: {
        quantidade: "1.250",
        vendas: "100.00",
        custos: null,
        diferenca: null,
        grupos: [
          {
            codigoPdv: "D1",
            codigoGrupo: "G1",
            quantidade: "2.500",
            vendas: "150.00",
            custos: null,
            diferenca: null,
          },
        ],
      },
    });

    render(<PainelRelatorio relatorio="produtos" resultado={resultado} />);
    expect(
      screen.getByRole("list", { name: "Produtos vendidos" })
    ).toBeTruthy();
    expect(
      screen.getByRole("table", { name: "Produtos vendidos" })
    ).toBeTruthy();
    expect(screen.getAllByText("Produto fictício").length).toBeGreaterThan(0);
    expect(screen.getAllByText("R$ 100,00").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Não informado pela SCC").length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("R$ 0,00")).toBeNull();
    expect(screen.getByText("Totais completos por grupo")).toBeTruthy();
    expect(
      screen.getAllByText(/Este grupo pode continuar da página anterior/).length
    ).toBeGreaterThan(0);
  });

  it("mostra comissão oficial ausente sem converter em zero", () => {
    const resultado = resultadoSchemas.comissao.parse({
      ...envelope,
      linhas: [
        {
          codigoOperador: "O1",
          operador: "Operadora fictícia",
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
    });

    render(<PainelRelatorio relatorio="comissao" resultado={resultado} />);
    expect(screen.getAllByText("Vendas elegíveis").length).toBeGreaterThan(0);
    expect(screen.getAllByText("R$ 100,00").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Não informado pela SCC").length
    ).toBeGreaterThan(0);
    expect(screen.getByText(/1 operador sem comissão informada/)).toBeTruthy();
  });

  it("mostra créditos, débitos e grupos completos do caixa", () => {
    const resultado = resultadoSchemas.caixa.parse({
      ...envelope,
      linhas: [
        {
          codigoLancamento: "L1",
          diaMovimento: "2026-02-14",
          diaCivil: "2026-02-15",
          momento: "2026-02-15T01:30:00-03:00",
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
            diaCivil: "2026-02-15",
            creditos: "20.00",
            debitos: "0.00",
            saldo: "20.00",
          },
        ],
      },
    });

    render(
      <PainelRelatorio
        relatorio="caixa"
        resultado={resultado}
        fuso="America/Recife"
      />
    );
    expect(screen.getAllByText("Créditos").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Operador fictício").length).toBeGreaterThan(0);
    expect(screen.getAllByText("15/02/2026 01:30").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Totais completos por operador e dia civil")
    ).toBeTruthy();
  });

  it("apresenta auditoria como eventos e não chama transferência de prejuízo", () => {
    const resultado = resultadoSchemas.auditoria.parse({
      ...envelope,
      linhas: [
        {
          tipo: "transferencia_produtos",
          momento: "2026-02-14T20:30:00-03:00",
          codigoOperador: "O1",
          operador: "Operador fictício",
          cartaoAnterior: "M1",
          cartaoNovo: "M2",
          codigoProduto: "P1",
          produto: "Produto fictício",
          quantidade: "2.000",
          valorUnitario: "5.00",
          total: "10.00",
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
    });

    render(
      <PainelRelatorio
        relatorio="auditoria"
        resultado={resultado}
        fuso="America/Recife"
      />
    );
    expect(
      screen.getAllByText("Transferência de produtos").length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/transferência não representa valor perdido/i).length
    ).toBe(1);
  });

  it("mostra notas assinadas só com código de cliente", () => {
    const resultado = resultadoSchemas["notas-assinadas"].parse({
      ...envelope,
      linhas: [
        {
          codigoNota: "N1",
          codigoEntrada: "E1",
          diaMovimento: "2026-02-14",
          codigoCliente: "CL1",
          valor: "0.00",
        },
      ],
      resumo: { notas: 1, valor: "0.00" },
    });

    render(
      <PainelRelatorio relatorio="notas-assinadas" resultado={resultado} />
    );
    expect(screen.getAllByText("CL1").length).toBeGreaterThan(0);
    expect(screen.getByText("Total das notas")).toBeTruthy();
    expect(screen.queryByText(/nome do cliente/i)).toBeNull();
  });

  it("separa total recebido de meios e mantém público agregado", () => {
    const resultado = resultadoSchemas.financeiro.parse({
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
        publico: [
          { sexo: "nao_informado", categoria: "pagante", quantidade: 5 },
        ],
      },
    });

    render(<PainelRelatorio relatorio="financeiro" resultado={resultado} />);
    expect(screen.getByText("Recebido oficial pela SCC")).toBeTruthy();
    expect(screen.getByText("Meios informados pela SCC")).toBeTruthy();
    expect(screen.getAllByText(/Público agregado/).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Não informado pela SCC").length
    ).toBeGreaterThan(0);
  });
});
