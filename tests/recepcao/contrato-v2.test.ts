import { describe, expect, it } from "vitest";
import { validarEnvioSccV2 } from "../../lib/validators/recepcao";
import { fixtures } from "./fixtures-v2";

describe("contrato SCC v2", () => {
  it.each(fixtures)("aceita $tipo_envio", (envio) => {
    expect(validarEnvioSccV2(envio).success).toBe(true);
  });
  it("recusa campos desconhecidos e dados de outro tipo", () => {
    expect(
      validarEnvioSccV2({ ...fixtures[0], restaurante_id: "1" }).success
    ).toBe(false);
    expect(
      validarEnvioSccV2({ ...fixtures[0], dados: fixtures[1].dados }).success
    ).toBe(false);
  });
  it("valida limites, correlações e escalares", () => {
    const entrada = fixtures[0];
    const foto = fixtures[2];
    for (const alteracao of [
      { versao_formato: 1 },
      { modo: "fotografia" },
      { sequencia: "9223372036854775808" },
      { sequencia: "0" },
      { id_envio: "inválido" },
      { enviado_em: "2026-11-01T10:00:00" },
      { pagina: { numero: 2, total: 1 } },
      { total_registros: 0 },
      { pagina: { numero: 1, total: 201 } },
      { pagina: { numero: 1, total: 1, extra: true } },
      { janela: { desde: "2026-02-30", ate: "2026-11-01" } },
      { dados: [{ ...entrada.dados[0], ValorItens: 1 }] },
      { dados: [{ ...entrada.dados[0], extra: true }] },
    ])
      expect(validarEnvioSccV2({ ...entrada, ...alteracao }).success).toBe(
        false
      );
    expect(
      validarEnvioSccV2({ ...entrada, sequencia: "9223372036854775807" })
        .success
    ).toBe(true);
    expect(
      validarEnvioSccV2({ ...entrada, total_registros: 0, dados: [] }).success
    ).toBe(true);
    expect(
      validarEnvioSccV2({ ...foto, recursos: ["pdv", "pdv"] }).success
    ).toBe(false);
    expect(
      validarEnvioSccV2({
        ...foto,
        dados: [{ ...foto.dados[0], codigo_produto: "inválido!" }],
      }).success
    ).toBe(false);
    expect(
      validarEnvioSccV2({
        ...foto,
        dados: [{ ...foto.dados[0], vendas: "1.1234567" }],
      }).success
    ).toBe(false);
  });
  it("aceita extras conhecidos da entrada e recusa valores compostos", () => {
    const envio = fixtures[0];
    expect(
      validarEnvioSccV2({
        ...envio,
        dados: [{ ...envio.dados[0], ECF: "1", Flyer: true }],
      }).success
    ).toBe(true);
    expect(
      validarEnvioSccV2({ ...envio, dados: [{ ...envio.dados[0], ECF: {} }] })
        .success
    ).toBe(false);
  });
  it("rejeita duplicatas e objetos desconhecidos no financeiro", () => {
    const financeiro = fixtures[7];
    const linha = financeiro.dados[0];
    const meio = { codigo: "1", rotulo: "Pix", classe: "pix", valor: "1" };
    const publico = { sexo: "masculino", categoria: "vip", quantidade: 1 };
    for (const dados of [
      [{ ...linha, meios: [meio, meio] }],
      [{ ...linha, publico: [publico, publico] }],
      [{ ...linha, componentes: { ...linha.componentes, extra: 1 } }],
      [linha, linha],
    ])
      expect(validarEnvioSccV2({ ...financeiro, dados }).success).toBe(false);
  });
});
