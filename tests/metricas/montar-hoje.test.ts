import {
  type LinhasDoHoje,
  montarDadosDoHoje,
} from "@/lib/metricas/montar-hoje";
// @vitest-environment node
import { describe, expect, it } from "vitest";

/**
 * O mapeamento das linhas das seis funções `metrica_*` para `DadosDoHoje`.
 * É só junção de campos: aqui se confere que nada é recalculado, que dinheiro
 * continua string e que "sem dado" continua null.
 */

function linhas(sobrescritas: Partial<LinhasDoHoje> = {}): LinhasDoHoje {
  return {
    faturamento: [
      {
        faturamento: "8420.00",
        taxa_servico: "842.00",
        contas_pagas: 31,
        pessoas_pagas: 74,
      },
    ],
    comparacao: [
      {
        faturamento_hoje: "8420.00",
        por_pessoa_hoje: "113.78",
        media_faturamento: "7451.25",
        media_por_pessoa: "108.10",
        variacao_faturamento: 0.13,
        variacao_por_pessoa: 0.0525,
        ocorrencias: 4,
      },
    ],
    mesasAbertas: [
      { quantidade: 6, valor_em_aberto: "1290.50", pessoas_na_casa: 17 },
    ],
    curva: [
      { minuto_do_dia: 0, acumulado_hoje: "0", acumulado_tipico: "0.00" },
      {
        minuto_do_dia: 30,
        acumulado_hoje: "580.00",
        acumulado_tipico: "412.50",
      },
      { minuto_do_dia: 60, acumulado_hoje: null, acumulado_tipico: "900.00" },
    ],
    contasEsquecidas: [
      {
        cod_entrada: 9001,
        cod_cartao_mesa: 12,
        aberta_em: "2026-10-09T22:10:00+00:00",
        aberta_ha: "05:12:00",
        valor_em_aberto: "310.00",
      },
      {
        cod_entrada: 9002,
        cod_cartao_mesa: null,
        aberta_em: "2026-10-09T23:40:00+00:00",
        aberta_ha: "03:42:00",
        valor_em_aberto: "0",
      },
    ],
    meta: [
      {
        faturamento_mes: "58000.00",
        meta: "120000.00",
        andamento: 0.4833,
        projecao: "116000.00",
        projecao_disponivel: true,
      },
    ],
    ...sobrescritas,
  };
}

describe("montarDadosDoHoje", () => {
  it("monta o faturamento do dia com a taxa separada e o dinheiro em string", () => {
    const dados = montarDadosDoHoje(linhas());

    expect(dados.faturamento).toEqual({
      valor: "8420.00",
      media: "7451.25",
      variacao: 0.13,
      taxaServico: "842.00",
      contasPagas: 31,
      pessoasPagas: 74,
    });
    expect(typeof dados.faturamento.valor).toBe("string");
    expect(typeof dados.faturamento.taxaServico).toBe("string");
  });

  it("monta o valor por pessoa com a média e a variação dele", () => {
    const dados = montarDadosDoHoje(linhas());

    expect(dados.porPessoa).toEqual({
      valor: "113.78",
      media: "108.10",
      variacao: 0.0525,
    });
  });

  it("não mexe no formato do dinheiro: '0', '0.00' e '580.00' passam como vieram", () => {
    const dados = montarDadosDoHoje(
      linhas({
        faturamento: [
          {
            faturamento: "0",
            taxa_servico: "0.00",
            contas_pagas: 0,
            pessoas_pagas: 0,
          },
        ],
        mesasAbertas: [
          { quantidade: 0, valor_em_aberto: "0", pessoas_na_casa: 0 },
        ],
      })
    );

    expect(dados.faturamento.valor).toBe("0");
    expect(dados.faturamento.taxaServico).toBe("0.00");
    expect(dados.mesasAbertas.valorEmAberto).toBe("0");
    expect(dados.curva[1]?.hoje).toBe("580.00");
  });

  it("sem histórico (menos de 2 ocorrências): média e variação ficam null", () => {
    const dados = montarDadosDoHoje(
      linhas({
        comparacao: [
          {
            faturamento_hoje: "8420.00",
            por_pessoa_hoje: "113.78",
            media_faturamento: null,
            media_por_pessoa: null,
            variacao_faturamento: null,
            variacao_por_pessoa: null,
            ocorrencias: 1,
          },
        ],
      })
    );

    expect(dados.faturamento).toMatchObject({
      valor: "8420.00",
      media: null,
      variacao: null,
    });
    expect(dados.porPessoa).toEqual({
      valor: "113.78",
      media: null,
      variacao: null,
    });
  });

  it("sem ninguém que pagou ainda: o valor por pessoa é null (divisão por zero)", () => {
    const dados = montarDadosDoHoje(
      linhas({
        comparacao: [
          {
            faturamento_hoje: "0",
            por_pessoa_hoje: null,
            media_faturamento: "7451.25",
            media_por_pessoa: "108.10",
            variacao_faturamento: -1,
            variacao_por_pessoa: null,
            ocorrencias: 4,
          },
        ],
      })
    );

    expect(dados.porPessoa.valor).toBeNull();
    expect(dados.porPessoa.variacao).toBeNull();
    expect(dados.faturamento.variacao).toBe(-1);
  });

  it("variação 0 é uma variação (igual à média), não 'sem histórico'", () => {
    const dados = montarDadosDoHoje(
      linhas({
        comparacao: [
          {
            faturamento_hoje: "7451.25",
            por_pessoa_hoje: "108.10",
            media_faturamento: "7451.25",
            media_por_pessoa: "108.10",
            variacao_faturamento: 0,
            variacao_por_pessoa: 0,
            ocorrencias: 4,
          },
        ],
      })
    );

    expect(dados.faturamento.variacao).toBe(0);
    expect(dados.porPessoa.variacao).toBe(0);
  });

  it("comparação com 0 linhas vira 'sem comparação', nunca erro, e o faturamento vem da própria função", () => {
    const dados = montarDadosDoHoje(linhas({ comparacao: [] }));

    expect(dados.faturamento).toMatchObject({
      valor: "8420.00",
      media: null,
      variacao: null,
    });
    expect(dados.porPessoa).toEqual({
      valor: null,
      media: null,
      variacao: null,
    });
  });

  it("monta as mesas abertas", () => {
    expect(montarDadosDoHoje(linhas()).mesasAbertas).toEqual({
      quantidade: 6,
      valorEmAberto: "1290.50",
      pessoasNaCasa: 17,
    });
  });

  it("monta a curva na ordem do banco, mantendo os pontos sem dado como null", () => {
    expect(montarDadosDoHoje(linhas()).curva).toEqual([
      { minuto: 0, hoje: "0", tipico: "0.00" },
      { minuto: 30, hoje: "580.00", tipico: "412.50" },
      { minuto: 60, hoje: null, tipico: "900.00" },
    ]);
  });

  it("curva sem histórico: o dia típico é null em todos os pontos", () => {
    const dados = montarDadosDoHoje(
      linhas({
        curva: [
          { minuto_do_dia: 0, acumulado_hoje: "0", acumulado_tipico: null },
          {
            minuto_do_dia: 30,
            acumulado_hoje: "10.00",
            acumulado_tipico: null,
          },
        ],
      })
    );

    expect(dados.curva.map((p) => p.tipico)).toEqual([null, null]);
    expect(dados.curva.map((p) => p.hoje)).toEqual(["0", "10.00"]);
  });

  it("monta as contas esquecidas na ordem do banco, com mesa null quando o SCC não mandou", () => {
    expect(montarDadosDoHoje(linhas()).contasEsquecidas).toEqual([
      {
        cod: 9001,
        mesa: 12,
        abertaEm: "2026-10-09T22:10:00+00:00",
        abertaHa: "05:12:00",
        valor: "310.00",
      },
      {
        cod: 9002,
        mesa: null,
        abertaEm: "2026-10-09T23:40:00+00:00",
        abertaHa: "03:42:00",
        valor: "0",
      },
    ]);
  });

  it("nenhuma conta esquecida é lista vazia", () => {
    expect(
      montarDadosDoHoje(linhas({ contasEsquecidas: [] })).contasEsquecidas
    ).toEqual([]);
  });

  it("monta a meta do mês com a projeção", () => {
    expect(montarDadosDoHoje(linhas()).meta).toEqual({
      faturamentoMes: "58000.00",
      meta: "120000.00",
      andamento: 0.4833,
      projecao: "116000.00",
      projecaoDisponivel: true,
    });
  });

  it("a projeção independe da meta: sem meta, a projeção continua como o banco mandou", () => {
    const dados = montarDadosDoHoje(
      linhas({
        meta: [
          {
            faturamento_mes: "58000.00",
            meta: null,
            andamento: null,
            projecao: "116000.00",
            projecao_disponivel: true,
          },
        ],
      })
    );

    expect(dados.meta).toEqual({
      faturamentoMes: "58000.00",
      meta: null,
      andamento: null,
      projecao: "116000.00",
      projecaoDisponivel: true,
    });
  });

  it("início de mês: sem projeção disponível, projeção null", () => {
    const dados = montarDadosDoHoje(
      linhas({
        meta: [
          {
            faturamento_mes: "0",
            meta: "120000.00",
            andamento: 0,
            projecao: null,
            projecao_disponivel: false,
          },
        ],
      })
    );

    expect(dados.meta).toEqual({
      faturamentoMes: "0",
      meta: "120000.00",
      andamento: 0,
      projecao: null,
      projecaoDisponivel: false,
    });
  });

  it("meta com 0 linhas: sem meta e sem projeção, nunca erro", () => {
    expect(montarDadosDoHoje(linhas({ meta: [] })).meta).toEqual({
      faturamentoMes: "0",
      meta: null,
      andamento: null,
      projecao: null,
      projecaoDisponivel: false,
    });
  });

  it("faturamento ou mesas sem linha é falha de leitura, não zero", () => {
    expect(() => montarDadosDoHoje(linhas({ faturamento: [] }))).toThrow();
    expect(() => montarDadosDoHoje(linhas({ mesasAbertas: [] }))).toThrow();
  });
});
