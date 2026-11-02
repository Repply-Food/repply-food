// @vitest-environment node
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { criarAmostrasV2, criarCorrecaoV2 } from "../../scripts/scc/amostra-v2";
import {
  type EnvioSccV2,
  envioSccV2Schema,
} from "../../supabase/functions/_shared/scc/schemas";

function tipo<T extends EnvioSccV2["tipo_envio"]>(
  cargas: EnvioSccV2[],
  nome: T
): Extract<EnvioSccV2, { tipo_envio: T }> {
  const carga = cargas.find((item) => item.tipo_envio === nome);
  if (!carga) throw new Error(`Falta ${nome}`);
  return carga as Extract<EnvioSccV2, { tipo_envio: T }>;
}

function soma(valores: string[]) {
  return valores
    .reduce((total, valor) => total.plus(valor), new Decimal(0))
    .toFixed(2);
}

describe("massa fictícia v2", () => {
  it.each([
    [
      "original",
      criarAmostrasV2,
      "106.00",
      "10.60",
      "116.60",
      "96.60",
      "3.00",
      "106.00",
      "93.50",
    ],
    [
      "correção",
      criarCorrecaoV2,
      "104.00",
      "10.40",
      "114.40",
      "94.40",
      "5.00",
      "94.40",
      "81.90",
    ],
  ])(
    "valida e concilia valores literais: %s",
    (
      _nome,
      criar,
      vendas,
      servico,
      projetado,
      recebido,
      descontos,
      creditos,
      saldo
    ) => {
      const cargas = criar();
      expect(cargas).toHaveLength(8);
      expect(new Set(cargas.map((c) => c.tipo_envio)).size).toBe(8);
      expect(new Set(cargas.map((c) => c.id_envio)).size).toBe(8);
      for (const carga of cargas)
        expect(envioSccV2Schema.safeParse(carga).success).toBe(true);
      const entradas = tipo(cargas, "entradas").dados;
      const itens = tipo(cargas, "itens_vendidos").dados;
      expect(entradas).toHaveLength(2);
      expect(
        entradas.every((e) => e.Pago === true && e.DataEntrada === "2026-11-01")
      ).toBe(true);
      expect(entradas.reduce((n, e) => n + e.NumeroOcupantes, 0)).toBe(4);
      expect(
        soma(
          entradas.map((e) =>
            new Decimal(e.ValorConsumido).minus(e.TaxaServico).toString()
          )
        )
      ).toBe(vendas);
      expect(soma(entradas.map((e) => e.TaxaServico))).toBe(servico);
      expect(soma(entradas.map((e) => e.ValorDescontos))).toBe(descontos);
      expect(soma(itens.map((i) => i.vendas))).toBe(vendas);
      expect(soma(itens.map((i) => i.quantidade))).toBe("6.00");
      expect(soma(itens.map((i) => i.custos ?? "0"))).toBe("41.00");
      expect(new Decimal(vendas).minus("41.00").toFixed(2)).toBe(
        _nome === "original" ? "65.00" : "63.00"
      );
      for (const entrada of entradas) {
        const vendasEntrada = soma(
          itens
            .filter((i) => i.codigo_entrada === String(entrada.codEntrada))
            .map((i) => i.vendas)
        );
        expect(vendasEntrada).toBe(
          new Decimal(entrada.ValorConsumido)
            .minus(entrada.TaxaServico)
            .toFixed(2)
        );
        expect(
          new Decimal(entrada.ValorItens)
            .minus(entrada.ValorDescontos)
            .plus(entrada.ValorAcrescimos)
            .plus(entrada.TaxaServico)
            .plus(entrada.Complemento)
            .toFixed(2)
        ).toBe(new Decimal(entrada.ValorConsumido).toFixed(2));
      }
      const comissoes = tipo(cargas, "comissoes").dados;
      expect(comissoes).toHaveLength(2);
      expect(soma(comissoes.map((c) => c.vendas_elegiveis))).toBe(vendas);
      expect(soma(comissoes.map((c) => c.comissao_oficial ?? "0"))).toBe(
        servico
      );
      const caixa = tipo(cargas, "movimentos_caixa").dados;
      expect(
        soma(caixa.filter((c) => c.tipo === "credito").map((c) => c.valor))
      ).toBe(creditos);
      expect(
        soma(caixa.filter((c) => c.tipo === "debito").map((c) => c.valor))
      ).toBe("12.50");
      expect(new Decimal(creditos).minus("12.50").toFixed(2)).toBe(saldo);
      const notas = tipo(cargas, "notas_assinadas").dados;
      expect(notas).toHaveLength(1);
      expect(soma(notas.map((n) => n.valor))).toBe("20.00");
      const financeiro = tipo(cargas, "financeiro").dados[0];
      expect(financeiro?.totais_oficiais).toEqual({
        projetado,
        recebido,
        notas_assinadas: "20.00",
        descontos,
      });
      expect(soma(financeiro?.meios.map((m) => m.valor) ?? [])).toBe(projetado);
      const auditoria = tipo(cargas, "eventos_auditoria").dados;
      expect(auditoria).toHaveLength(6);
      expect(auditoria[0]).toEqual(auditoria[1]);
      expect(auditoria[0]?.tipo).toBe("cancelamento_produto");
    }
  );

  it("preserva detalhes e referências de produtos, operadores e pagamentos", () => {
    const cargas = criarAmostrasV2();
    const cadastro = tipo(cargas, "cadastro_produtos").dados;
    const itens = tipo(cargas, "itens_vendidos").dados;
    expect(cadastro.map((p) => p.codigo_produto)).toEqual([
      "P100",
      "P200",
      "P300",
    ]);
    for (const [codigo, quantidade, vendas, custos] of [
      ["P100", "3.00", "73.00", "30.00"],
      ["P200", "2.00", "16.00", "6.00"],
      ["P300", "1.00", "17.00", "5.00"],
    ]) {
      const linhas = itens.filter((i) => i.codigo_produto === codigo);
      expect(soma(linhas.map((i) => i.quantidade))).toBe(quantidade);
      expect(soma(linhas.map((i) => i.vendas))).toBe(vendas);
      expect(soma(linhas.map((i) => i.custos ?? "0"))).toBe(custos);
    }
    const meios = tipo(cargas, "financeiro").dados[0]?.meios;
    expect(meios?.map((m) => [m.classe, m.valor])).toEqual([
      ["dinheiro", "50.00"],
      ["pix", "46.60"],
      ["nota_assinada", "20.00"],
    ]);
    const corrigidas = criarCorrecaoV2();
    expect(corrigidas.every((c) => c.sequencia === "2")).toBe(true);
    expect(
      corrigidas.every(
        (c) => !cargas.some((original) => original.id_envio === c.id_envio)
      )
    ).toBe(true);
    expect(criarAmostrasV2()).toEqual(cargas);
    expect(criarCorrecaoV2()).toEqual(corrigidas);
    expect(tipo(corrigidas, "entradas").dados[1]).toMatchObject({
      ValorDescontos: "5.00",
      TaxaServico: "3.80",
      ValorConsumido: "41.80",
    });
    const entradas = tipo(cargas, "entradas").dados;
    const operadores = new Set(
      tipo(cargas, "comissoes").dados.map((c) => c.codigo_operador)
    );
    const produtos = new Set(cadastro.map((p) => p.codigo_produto));
    expect(
      itens.every(
        (i) =>
          produtos.has(i.codigo_produto) &&
          entradas.some((e) => String(e.codEntrada) === i.codigo_entrada) &&
          operadores.has(i.codigo_garcom ?? "")
      )
    ).toBe(true);
    expect(
      tipo(cargas, "movimentos_caixa").dados.every((c) =>
        operadores.has(c.codigo_operador ?? "")
      )
    ).toBe(true);
    expect(
      tipo(cargas, "notas_assinadas").dados.every((n) =>
        entradas.some(
          (e) =>
            String(e.codEntrada) === n.codigo_entrada &&
            String(e.codCliente) === n.codigo_cliente
        )
      )
    ).toBe(true);
  });
});
