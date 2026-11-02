import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { criarAmostrasV2, criarCorrecaoV2 } from "../../scripts/scc/amostra-v2";
import { criarColecao } from "../../scripts/scc/gerar-insomnia-v2";
import { envioSccV2Schema } from "../../supabase/functions/_shared/scc/schemas";

describe("coleção Insomnia v2", () => {
  it("usa IDs distintos nas seis correções históricas e em todas as cargas novas", () => {
    const requests = criarColecao().resources.filter(
      (r) => r._type === "request"
    );
    const historicos = requests.filter(
      (r) => r.parentId === "fld_4" && r.name?.endsWith(" histórico")
    );
    expect(historicos).toHaveLength(6);
    const corposHistoricos = historicos.map((r) =>
      JSON.parse(r.body?.text ?? "")
    );
    expect(corposHistoricos.map((c) => c.tipo_envio)).toEqual(
      criarCorrecaoV2()
        .filter((c) => c.modo === "fotografia")
        .map((c) => c.tipo_envio)
    );
    expect(
      corposHistoricos.every(
        (c) => c.fonte === "historico" && c.sequencia === "2"
      )
    ).toBe(true);
    const reutilizacoesIntencionais = [
      "Reenvio idêntico",
      "401 sem token",
      "401 token inválido",
      "409 mesmo ID divergente",
      "422 campo desconhecido",
    ];
    const novas = requests.filter(
      (r) => !reutilizacoesIntencionais.includes(r.name ?? "")
    );
    const ids = novas.map((r) => JSON.parse(r.body?.text ?? "").id_envio);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("é reproduzível, sem token, e cobre a sequência e os cenários", () => {
    const colecao = criarColecao();
    expect(
      JSON.parse(
        readFileSync("docs/integracao-scc/insomnia-webhook-v2.json", "utf8")
      )
    ).toEqual(colecao);
    const recursos = colecao.resources;
    const ambiente = recursos.find((r) => r._type === "environment");
    expect(ambiente?.data).toEqual({
      base_url: "http://127.0.0.1:54321/functions/v1/receber-envio",
      token: "",
    });
    expect(
      recursos.filter((r) => r._type === "request_group").map((r) => r.name)
    ).toEqual([
      "00 Preparação",
      "01 Sucesso on-line",
      "02 Fechamento histórico",
      "03 Idempotência",
      "04 Correção",
      "05 Paginação incompleta",
      "06 Erros 401-409-422",
    ]);
    const requests = recursos.filter((r) => r._type === "request");
    const corpos = requests.map((r) => JSON.parse(r.body?.text ?? ""));
    expect(corpos.slice(0, 8)).toEqual(criarAmostrasV2());
    expect(corpos.slice(15, 23)).toEqual(criarCorrecaoV2());
    expect(
      corpos.filter((c) => !envioSccV2Schema.safeParse(c).success)
    ).toHaveLength(1);
    expect(corpos.slice(0, 8).map((c) => c.tipo_envio)).toEqual([
      "entradas",
      "cadastro_produtos",
      "itens_vendidos",
      "comissoes",
      "movimentos_caixa",
      "eventos_auditoria",
      "notas_assinadas",
      "financeiro",
    ]);
    expect(corpos.slice(8, 14).every((c) => c.fonte === "historico")).toBe(
      true
    );
    expect(corpos[14]).toEqual(corpos[2]);
    expect(new Set(corpos.slice(0, 14).map((c) => c.id_envio)).size).toBe(14);
    expect(corpos[15].sequencia).toBe("2");
    expect(
      corpos.some((c) => c.pagina.numero === 1 && c.pagina.total === 2)
    ).toBe(true);
    expect(requests.every((r) => r.url === "{{ _.base_url }}")).toBe(true);
  });
});
