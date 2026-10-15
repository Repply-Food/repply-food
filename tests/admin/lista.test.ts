import { describe, expect, it } from "vitest";
import {
  type LinhaDaLista,
  contadoresDaLista,
  ordenarParaAtencao,
} from "../../lib/admin/lista";

const linha = (
  nome: string,
  estado: LinhaDaLista["estado"],
  situacao: LinhaDaLista["situacao"] = "ativo"
): LinhaDaLista => ({
  id: nome,
  slug: nome,
  nome,
  situacao,
  fuso: "America/Fortaleza",
  estado,
  ultimoEnvioOkEm: null,
  versaoScc: null,
});

const linhas = [
  linha("Bar do Zé", "em_dia"),
  linha("Zeca", "parado"),
  linha("Ana", "parado"),
  linha("Forno", "aguardando"),
  linha("Esquina", "fechado"),
  linha("Sumida", "em_dia", "suspenso"),
  linha("Cantina", "atrasado"),
  linha("Nova", null),
];

describe("lista do admin", () => {
  it("ordem de atenção: parado, atrasado, aguardando, em dia, fechado, suspenso; depois o nome", () => {
    expect(ordenarParaAtencao(linhas).map((l) => l.nome)).toEqual([
      "Ana",
      "Zeca",
      "Cantina",
      "Forno",
      "Nova",
      "Bar do Zé",
      "Esquina",
      "Sumida",
    ]);
  });

  it("não muda a lista recebida", () => {
    const copia = [...linhas];
    ordenarParaAtencao(linhas);
    expect(linhas).toEqual(copia);
  });

  it("contadores com o total e só os estados que existem", () => {
    expect(contadoresDaLista(linhas)).toEqual([
      "8 cadastrados",
      "1 em dia",
      "1 atrasado",
      "2 parados",
      "2 aguardando",
      "1 fechado",
      "1 suspenso",
    ]);
    expect(contadoresDaLista([linha("Única", "em_dia")])).toEqual([
      "1 cadastrado",
      "1 em dia",
    ]);
  });
});
