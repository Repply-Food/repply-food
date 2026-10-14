import { describe, expect, it } from "vitest";
import { estadoDoSinal, seloDoSinal, tempoDesde } from "../../lib/painel/selo";

const fuso = "America/Fortaleza";
const agora = new Date("2026-10-10T00:40:00Z"); // sexta 21:40 em Fortaleza

describe("selo do painel (D-53: segue o estado do vigia)", () => {
  it.each([
    ["em_dia", "2026-10-10T00:38:00Z", "ok", "atualizado há 2 min"],
    [
      "atrasado",
      "2026-10-10T00:20:00Z",
      "atencao",
      "atrasado · últimos dados há 20 min",
    ],
    ["parado", "2026-10-09T22:40:00Z", "alerta", "sem dados há 2 h"],
    [
      "fechado",
      "2026-10-09T05:14:00Z",
      "neutro",
      "fechado agora · últimos dados às 02:14",
    ],
    ["aguardando", null, "neutro", "aguardando o 1º envio"],
  ] as const)("%s", (estado, ultimo, tom, texto) => {
    expect(
      seloDoSinal({ estado, ultimoEnvioOkEm: ultimo, agora, fuso })
    ).toEqual({ tom, texto });
  });

  it("sem linha de sinal de vida é 'aguardando o 1º envio'", () => {
    expect(
      seloDoSinal({ estado: null, ultimoEnvioOkEm: null, agora, fuso })
    ).toEqual({ tom: "neutro", texto: "aguardando o 1º envio" });
  });

  it("fechado sem nenhum envio diz só 'fechado agora'", () => {
    expect(
      seloDoSinal({ estado: "fechado", ultimoEnvioOkEm: null, agora, fuso })
    ).toEqual({ tom: "neutro", texto: "fechado agora" });
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
