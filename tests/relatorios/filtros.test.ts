import { parseConsulta, serializarConsulta } from "@/lib/relatorios/filtros";
import type { Relatorio } from "@/lib/validators/relatorios";
import { describe, expect, it } from "vitest";

const base = "inicio=2026-02-14&fim=2026-02-14&fonte=historico";
const parse = (extra = "", relatorio: Relatorio = "produtos") =>
  parseConsulta(relatorio, new URLSearchParams(`${base}${extra}`));

describe("consulta fechada dos relatórios", () => {
  it("exige datas completas e fonte explícita", () => {
    for (const query of [
      "fim=2026-02-14",
      "inicio=2026-02-14",
      "inicio=2026-02-14&fim=2026-02-14",
      `${base}&fonte=online`,
    ]) {
      expect(() =>
        parseConsulta("produtos", new URLSearchParams(query))
      ).toThrow();
    }
    expect(parse()).toEqual({
      filtros: { inicio: "2026-02-14", fim: "2026-02-14", fonte: "historico" },
      pagina: 1,
    });
  });

  it.each([
    "&pdv=P1&pdv=P1",
    "&intruso=x",
    "&pagina=0",
    "&pagina=-1",
    "&pagina=1.5",
    "&pagina=9007199254740992",
    "&pdv=",
    "&pdv=P%201",
    "&pdv=O%27",
    `&grupo=${"a".repeat(81)}`,
    "&revisao=-1",
    "&revisao=1.5",
  ])("recusa parâmetro inválido %s", (extra) => {
    expect(() => parse(extra)).toThrow();
  });

  it.each([
    "inicio=2026-02-30&fim=2026-03-01&fonte=historico",
    "inicio=2026-02-14&fim=2026-02-13&fonte=historico",
    "inicio=2025-01-01&fim=2026-01-02&fonte=historico",
    "inicio=2026-2-14&fim=2026-02-14&fonte=historico",
    "inicio=2026-02-14&fim=2026-02-14&fonte=outra",
  ])("recusa período/fonte inválido %s", (query) => {
    expect(() =>
      parseConsulta("produtos", new URLSearchParams(query))
    ).toThrow();
  });

  it("aceita 366 dias inclusivos e dia bissexto", () => {
    expect(
      parseConsulta(
        "financeiro",
        new URLSearchParams("inicio=2024-01-01&fim=2024-12-31&fonte=historico")
      ).filtros.fim
    ).toBe("2024-12-31");
    expect(
      parseConsulta(
        "financeiro",
        new URLSearchParams("inicio=2024-02-29&fim=2024-02-29&fonte=online")
      ).filtros.fonte
    ).toBe("online");
  });

  it("on-line exige um dia de movimento", () => {
    expect(() =>
      parseConsulta(
        "notas-assinadas",
        new URLSearchParams("inicio=2026-02-14&fim=2026-02-15&fonte=online")
      )
    ).toThrow();
  });

  it.each<[Relatorio, string]>([
    ["financeiro", "&garcom=O1"],
    ["notas-assinadas", "&operador=O1"],
    ["comissao", "&cliente=C1"],
    ["produtos", "&tipo=credito"],
    ["caixa", "&grupo=G1"],
    ["auditoria", "&categoria=credito:C1"],
  ])("recusa filtro de outro relatório em %s", (relatorio, extra) => {
    expect(() => parse(extra, relatorio)).toThrow();
  });

  it.each<[Relatorio, string, object]>([
    [
      "produtos",
      "&pdv=P1&grupo=G1&garcom=O1",
      { pdv: "P1", grupo: "G1", garcom: "O1" },
    ],
    ["comissao", "&operador=O1", { operador: "O1" }],
    [
      "caixa",
      "&operador=O1&tipo=debito&categoria=debito:C1",
      { operador: "O1", tipo: "debito", categoria: "debito:C1" },
    ],
    [
      "auditoria",
      "&operador=O1&tipo=perda_cartao",
      { operador: "O1", tipo: "perda_cartao" },
    ],
    ["notas-assinadas", "&cliente=C1", { cliente: "C1" }],
    ["financeiro", "", {}],
  ])("aceita os filtros próprios de %s", (relatorio, extra, filtros) => {
    expect(parse(extra, relatorio).filtros).toEqual({
      inicio: "2026-02-14",
      fim: "2026-02-14",
      fonte: "historico",
      ...filtros,
    });
  });

  it("valida limites de mesa e conserva códigos exatos", () => {
    expect(
      parse(
        "&mesaDe=0&mesaAte=2147483647&pdv=P_1.-&grupo=G1&garcom=O1&pagina=2&revisao=0"
      )
    ).toEqual({
      filtros: {
        inicio: "2026-02-14",
        fim: "2026-02-14",
        fonte: "historico",
        pdv: "P_1.-",
        grupo: "G1",
        garcom: "O1",
        mesaDe: 0,
        mesaAte: 2147483647,
      },
      pagina: 2,
      revisao: "0",
    });
    for (const extra of [
      "&mesaDe=2&mesaAte=1",
      "&mesaDe=-1",
      "&mesaAte=2147483648",
      "&mesaDe=1.1",
      "&mesaDe=",
    ])
      expect(() => parse(extra)).toThrow();
  });

  it("restringe tipos e categoria à identidade da direção", () => {
    expect(
      parse("&tipo=credito&categoria=credito:C1", "caixa").filtros.categoria
    ).toBe("credito:C1");
    expect(parse("&categoria=debito:C1", "caixa").filtros.categoria).toBe(
      "debito:C1"
    );
    for (const extra of [
      "&tipo=cancelamento_produto",
      "&categoria=C1",
      "&tipo=credito&categoria=debito:C1",
      "&categoria=credito:C:1",
    ])
      expect(() => parse(extra, "caixa")).toThrow();
    expect(
      parse("&tipo=transferencia_produtos", "auditoria").filtros.tipo
    ).toBe("transferencia_produtos");
    expect(() => parse("&tipo=credito", "auditoria")).toThrow();
  });

  it("serializa somente campos públicos e permite ida e volta", () => {
    const consulta = parse("&pdv=P1&mesaDe=0&pagina=2&revisao=123");
    expect(serializarConsulta(consulta)).toBe(
      `${base}&pdv=P1&mesaDe=0&pagina=2&revisao=123`
    );
    expect(
      parseConsulta(
        "produtos",
        new URLSearchParams(serializarConsulta(consulta))
      )
    ).toEqual(consulta);
  });
});
