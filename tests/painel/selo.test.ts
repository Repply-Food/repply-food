import { describe, expect, it } from "vitest";
import { estadoDoSinal, seloDoSinal, tempoDesde } from "../../lib/painel/selo";

const fuso = "America/Fortaleza";
const agora = new Date("2026-10-10T00:40:00Z"); // sexta 21:40 em Fortaleza

describe("selo do painel (D-53: segue o estado do vigia)", () => {
  it.each([
    ["em_dia", "2026-10-10T00:38:00Z", "ok", "atualizado há 2 min", "há 2 min"],
    [
      "atrasado",
      "2026-10-10T00:20:00Z",
      "atencao",
      "atrasado · últimos dados há 20 min",
      "atrasado · há 20 min",
    ],
    [
      "parado",
      "2026-10-09T22:40:00Z",
      "alerta",
      "sem dados há 2 h",
      "sem dados há 2 h",
    ],
    [
      "fechado",
      "2026-10-09T05:14:00Z",
      "neutro",
      "fechado agora · últimos dados às 02:14",
      "fechado",
    ],
    ["aguardando", null, "neutro", "aguardando o 1º envio", "aguardando"],
  ] as const)("%s", (estado, ultimo, tom, texto, textoCurto) => {
    expect(
      seloDoSinal({ estado, ultimoEnvioOkEm: ultimo, agora, fuso })
    ).toEqual({ tom, texto, textoCurto });
  });

  it("sem linha de sinal de vida é 'aguardando o 1º envio'", () => {
    expect(
      seloDoSinal({ estado: null, ultimoEnvioOkEm: null, agora, fuso })
    ).toEqual({
      tom: "neutro",
      texto: "aguardando o 1º envio",
      textoCurto: "aguardando",
    });
  });

  it("fechado sem nenhum envio diz só 'fechado agora'", () => {
    expect(
      seloDoSinal({ estado: "fechado", ultimoEnvioOkEm: null, agora, fuso })
    ).toEqual({
      tom: "neutro",
      texto: "fechado agora",
      textoCurto: "fechado",
    });
  });

  it.each([
    ["em_dia", "ok", "atualizado", "atualizado"],
    ["atrasado", "atencao", "atrasado", "atrasado"],
    ["parado", "alerta", "sem dados", "sem dados"],
  ] as const)(
    "%s sem nenhum envio não inventa tempo",
    (estado, tom, texto, textoCurto) => {
      expect(
        seloDoSinal({ estado, ultimoEnvioOkEm: null, agora, fuso })
      ).toEqual({ tom, texto, textoCurto });
    }
  );

  describe("data do último envio que não vira data", () => {
    it.each([
      ["em_dia", "ok", "atualizado", "atualizado"],
      ["atrasado", "atencao", "atrasado", "atrasado"],
      ["parado", "alerta", "sem dados", "sem dados"],
      ["fechado", "neutro", "fechado agora", "fechado"],
    ] as const)(
      "%s trata 'lixo' como ausente, nunca 'há NaN dias'",
      (estado, tom, texto, textoCurto) => {
        const selo = seloDoSinal({
          estado,
          ultimoEnvioOkEm: "lixo",
          agora,
          fuso,
        });
        expect(selo).toEqual({ tom, texto, textoCurto });
        expect(selo.texto).not.toContain("NaN");
        expect(selo.textoCurto).not.toContain("NaN");
      }
    );

    it("texto vazio também vale como ausente", () => {
      expect(
        seloDoSinal({ estado: "em_dia", ultimoEnvioOkEm: "", agora, fuso })
      ).toEqual({ tom: "ok", texto: "atualizado", textoCurto: "atualizado" });
    });
  });

  describe("fechado", () => {
    it("com fuso inválido não lança erro e cai no texto relativo", () => {
      const chamar = () =>
        seloDoSinal({
          estado: "fechado",
          ultimoEnvioOkEm: "2026-10-09T05:14:00Z",
          agora,
          fuso: "Fuso/Inexistente",
        });
      expect(chamar).not.toThrow();
      expect(chamar()).toEqual({
        tom: "neutro",
        texto: "fechado agora · últimos dados há 19 h",
        textoCurto: "fechado",
      });
    });

    it("com fuso inválido e sem envio continua só 'fechado agora'", () => {
      expect(
        seloDoSinal({
          estado: "fechado",
          ultimoEnvioOkEm: null,
          agora,
          fuso: "Fuso/Inexistente",
        })
      ).toEqual({
        tom: "neutro",
        texto: "fechado agora",
        textoCurto: "fechado",
      });
    });

    it("com o último dado de exatas 24 h atrás ainda mostra a hora", () => {
      expect(
        seloDoSinal({
          estado: "fechado",
          ultimoEnvioOkEm: "2026-10-09T00:40:00Z",
          agora,
          fuso,
        })
      ).toEqual({
        tom: "neutro",
        texto: "fechado agora · últimos dados às 21:40",
        textoCurto: "fechado",
      });
    });

    it.each([
      ["2026-10-09T00:30:00Z", "há 1 dia"],
      ["2026-10-07T05:14:00Z", "há 2 dias"],
    ])(
      "com o último dado de mais de 24 h atrás (%s) diz '%s', não a hora",
      (ultimo, relativo) => {
        expect(
          seloDoSinal({
            estado: "fechado",
            ultimoEnvioOkEm: ultimo,
            agora,
            fuso,
          })
        ).toEqual({
          tom: "neutro",
          texto: `fechado agora · últimos dados ${relativo}`,
          textoCurto: "fechado",
        });
      }
    );
  });

  it("aceita só os estados que o banco conhece", () => {
    expect(estadoDoSinal("em_dia")).toBe("em_dia");
    expect(estadoDoSinal("qualquer")).toBeNull();
    expect(estadoDoSinal(null)).toBeNull();
  });

  it.each([
    [30, "há menos de 1 min"],
    [60, "há 1 min"],
    [59 * 60, "há 59 min"],
    [60 * 60, "há 1 h"],
    [23 * 3600, "há 23 h"],
    [24 * 3600, "há 1 dia"],
    [3 * 86400, "há 3 dias"],
  ])("%i segundos viram '%s'", (segundos, texto) => {
    const desde = new Date(agora.getTime() - segundos * 1000);
    expect(tempoDesde(desde, agora)).toBe(texto);
  });
});
