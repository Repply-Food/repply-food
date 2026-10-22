// @vitest-environment jsdom

import { CartaoDados } from "@/components/admin/cartoes/cartao-dados";
import { CartaoEnvios } from "@/components/admin/cartoes/cartao-envios";
import { CartaoHistorico } from "@/components/admin/cartoes/cartao-historico";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

const ID = "11111111-1111-4111-8111-111111111111";

function detalhe(
  parcial: Partial<DetalheDoRestaurante> = {}
): DetalheDoRestaurante {
  return {
    agoraIso: "2026-10-15T00:40:00Z",
    restaurante: {
      id: ID,
      slug: "bar-do-ze",
      nome: "Bar do Zé",
      cnpj: "12345678000195",
      fuso: "America/Fortaleza",
      horaVirada: "05:00",
      horario: [2, 3, 4, 5, 6, 0].flatMap((dia) => [
        { dia, abre: "11:00", fecha: "15:00" },
        { dia, abre: "18:00", fecha: "02:00" },
      ]),
      situacao: "ativo",
      pedidoReenvioDesde: null,
      intervaloEnvioSegundos: 300,
      demonstracao: false,
    },
    sinal: { estado: "em_dia", ultimoEnvioOkEm: "2026-10-15T00:38:00Z" },
    tokens: [],
    logins: [],
    envios: [],
    historico: [],
    ...parcial,
  };
}

describe("cartão Dados", () => {
  it("mostra os dados no formato da casa e as duas ações", () => {
    render(<CartaoDados detalhe={detalhe()} />);
    for (const texto of [
      "12.345.678/0001-95",
      "Fortaleza · CE, RN, PB, PI e MA (UTC−3)",
      "5h",
      "ter–dom · 11h–15h e 18h–2h",
      "ativo",
    ]) {
      expect(screen.getByText(texto)).toBeTruthy();
    }
    expect(
      screen.getByRole("link", { name: "Editar dados" }).getAttribute("href")
    ).toBe(`/admin/restaurantes/${ID}/editar`);
    expect(
      screen
        .getByRole("link", { name: "Ver o painel do cliente" })
        .getAttribute("href")
    ).toBe("/r/bar-do-ze/hoje");
  });

  it("sem CNPJ diz 'não informado'", () => {
    const base = detalhe();
    render(
      <CartaoDados
        detalhe={{ ...base, restaurante: { ...base.restaurante, cnpj: null } }}
      />
    );
    expect(screen.getByText("não informado")).toBeTruthy();
  });
});

describe("cartão Últimos envios", () => {
  it("sem envios, diz isso", () => {
    render(<CartaoEnvios detalhe={detalhe()} />);
    expect(screen.getByText("Nenhum envio ainda.")).toBeTruthy();
  });

  it("mostra hora no fuso da casa, resultado em texto, contagens, versão e campos novos", () => {
    render(
      <CartaoEnvios
        detalhe={detalhe({
          envios: [
            {
              id: 2,
              recebidoEm: "2026-10-15T00:38:00Z",
              httpStatus: 200,
              erro: null,
              recebidas: 212,
              gravadas: 8,
              inalteradas: 203,
              removidas: 1,
              versaoScc: "5.2.1",
              camposDesconhecidos: ["Pix"],
            },
            {
              id: 1,
              recebidoEm: "2026-10-15T00:28:00Z",
              httpStatus: 422,
              erro: "formato inválido",
              recebidas: null,
              gravadas: null,
              inalteradas: null,
              removidas: null,
              versaoScc: null,
              camposDesconhecidos: [],
            },
          ],
        })}
      />
    );
    expect(screen.getByText("hoje 21:38")).toBeTruthy();
    expect(screen.getByText("ok")).toBeTruthy();
    expect(screen.getByText("erro")).toBeTruthy();
    expect(
      screen.getByText(
        "212 recebidas · 8 gravadas · 203 iguais · 1 removida · SCC 5.2.1"
      )
    ).toBeTruthy();
    expect(screen.getByText("formato inválido (422)")).toBeTruthy();
    expect(screen.getByText("campos novos: Pix")).toBeTruthy();
  });
});

describe("cartão Histórico", () => {
  it("sem ações, diz isso", () => {
    render(<CartaoHistorico detalhe={detalhe()} />);
    expect(screen.getByText("Nenhuma ação registrada ainda.")).toBeTruthy();
  });

  it("cada ação numa linha, sem senha nem token", () => {
    render(
      <CartaoHistorico
        detalhe={detalhe({
          historico: [
            {
              id: 1,
              criadoEm: "2026-10-15T00:03:00Z",
              autor: "Lucas Ferreira",
              acao: "gerou_token",
              detalhe: "o antigo parou na hora",
            },
          ],
        })}
      />
    );
    expect(
      screen.getByText(
        "14/10 21:03 · Lucas Ferreira · gerou um token novo (o antigo parou na hora)"
      )
    ).toBeTruthy();
  });
});
