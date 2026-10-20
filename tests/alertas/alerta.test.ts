import { describe, expect, it } from "vitest";
import {
  chaveIdempotenciaAlerta,
  codigoSeguro,
  montarEmailAlerta,
} from "../../supabase/functions/_shared/alerta";

const alerta = {
  id: "11111111-1111-4111-8111-111111111111",
  tipo: "parado" as const,
  nomeRestaurante: "Casa & Cozinha <teste>",
  ultimoEnvioEm: "2026-10-20T15:00:00.000Z",
  fuso: "America/Fortaleza",
  urlAdmin:
    "https://food.repplyhub.com.br/admin/restaurantes/22222222-2222-4222-8222-222222222222",
};

describe("conteúdo do alerta", () => {
  it("usa uma chave de idempotência estável por alerta", () => {
    expect(chaveIdempotenciaAlerta(alerta.id)).toBe(
      "rf-alerta-11111111-1111-4111-8111-111111111111"
    );
  });

  it("escapa o nome no HTML e preserva texto simples", () => {
    const email = montarEmailAlerta(alerta);

    expect(email.subject).toContain("SCC parado");
    expect(email.html).toContain("Casa &amp; Cozinha &lt;teste&gt;");
    expect(email.text).toContain("Casa & Cozinha <teste>");
    expect(email.html).toContain(alerta.urlAdmin);
  });

  it("troca o assunto quando o SCC voltou", () => {
    const email = montarEmailAlerta({ ...alerta, tipo: "voltou" });

    expect(email.subject).toContain("SCC voltou a enviar");
  });

  it("não devolve detalhes externos no código de falha", () => {
    expect(
      codigoSeguro(new Error("token=segredo destinatario@exemplo.com"))
    ).toBe("erro_provedor");
  });
});
