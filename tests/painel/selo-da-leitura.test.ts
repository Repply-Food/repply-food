import { afterEach, describe, expect, it, vi } from "vitest";
import { logError } from "../../lib/logger";
import { seloDaLeitura, seloDoSinal } from "../../lib/painel/selo";

const fuso = "America/Fortaleza";
const agora = new Date("2026-10-10T00:40:00Z"); // sexta 21:40 em Fortaleza

describe("selo quando a leitura do sinal de vida falha", () => {
  it("erro na leitura diz 'sem leitura agora', nunca 'aguardando o 1º envio'", () => {
    const selo = seloDaLeitura({
      dados: null,
      erro: { message: "timeout" },
      agora,
      fuso,
    });
    expect(selo).toEqual({ tom: "neutro", texto: "sem leitura agora" });
    expect(selo.texto).not.toContain("aguardando");
  });

  it("com erro, ignora qualquer dado que tenha vindo junto", () => {
    expect(
      seloDaLeitura({
        dados: { estado: "em_dia", ultimo_envio_ok_em: "2026-10-10T00:38:00Z" },
        erro: { message: "falha parcial" },
        agora,
        fuso,
      })
    ).toEqual({ tom: "neutro", texto: "sem leitura agora" });
  });

  it("sem erro e sem linha de sinal de vida continua 'aguardando o 1º envio'", () => {
    expect(seloDaLeitura({ dados: null, erro: null, agora, fuso })).toEqual({
      tom: "neutro",
      texto: "aguardando o 1º envio",
    });
  });

  it.each([
    ["em_dia", "2026-10-10T00:38:00Z"],
    ["atrasado", "2026-10-10T00:20:00Z"],
    ["parado", "2026-10-09T22:40:00Z"],
    ["fechado", "2026-10-09T05:14:00Z"],
    ["aguardando", null],
  ] as const)("sem erro, %s segue o selo do vigia", (estado, ultimo) => {
    expect(
      seloDaLeitura({
        dados: { estado, ultimo_envio_ok_em: ultimo },
        erro: null,
        agora,
        fuso,
      })
    ).toEqual(seloDoSinal({ estado, ultimoEnvioOkEm: ultimo, agora, fuso }));
  });

  it("sem erro, estado que o banco não conhece cai em 'aguardando o 1º envio'", () => {
    expect(
      seloDaLeitura({
        dados: { estado: "qualquer", ultimo_envio_ok_em: null },
        erro: null,
        agora,
        fuso,
      })
    ).toEqual({ tom: "neutro", texto: "aguardando o 1º envio" });
  });
});

describe("registro da falha de leitura do sinal de vida", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registra só o código, sem mensagem nem dado do erro", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("falha_leitura_sinal");
    const saida = JSON.stringify(erro.mock.calls);
    expect(saida).toContain("falha_leitura_sinal");
    expect(saida).not.toContain("erro_interno");
  });
});
