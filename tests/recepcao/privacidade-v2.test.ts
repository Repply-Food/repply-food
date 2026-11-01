import { describe, expect, it } from "vitest";
import { sanitizarAntesDeValidar } from "../../supabase/functions/_shared/scc/privacidade";
import { validarEnvioSccV2 } from "../../supabase/functions/_shared/scc/schemas";
import { fixtures } from "./fixtures-v2";

describe("privacidade v2", () => {
  it("descarta dados pessoais das entradas e preserva campos desconhecidos", () => {
    const bruto = {
      ...fixtures[0],
      dados: [
        {
          ...fixtures[0].dados[0],
          NomeCliente: "pessoa",
          RG: "documento",
          FoneCliente: "telefone",
          Sexo: "individual",
          desconhecido: 1,
        },
      ],
    };
    const limpo = sanitizarAntesDeValidar(bruto);
    expect(JSON.stringify(limpo)).not.toMatch(
      /NomeCliente|RG|FoneCliente|Sexo|pessoa|documento|telefone|individual/
    );
    expect(JSON.stringify(limpo)).toContain("desconhecido");
    expect(validarEnvioSccV2(limpo).success).toBe(false);
    expect(bruto.dados[0]?.NomeCliente).toBe("pessoa");
  });
  it("não remove sexo agregado financeiro", () => {
    const financeiro = {
      ...fixtures[7],
      dados: [
        {
          ...fixtures[7].dados[0],
          publico: [{ sexo: "feminino", categoria: "vip", quantidade: 1 }],
        },
      ],
    };
    expect(sanitizarAntesDeValidar(financeiro)).toEqual(financeiro);
  });
});
