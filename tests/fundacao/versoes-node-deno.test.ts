// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * O schema do envelope (supabase/functions/_shared/recepcao.ts) é o mesmo
 * arquivo no Node (testes, gerador) e no Deno (a função na nuvem). As duas
 * pontas precisam da mesma versão de zod e de supabase-js, senão a recepção
 * pode validar de um jeito nos testes e de outro em produção.
 */
const CAMINHO_DENO_JSON = "supabase/functions/receber-envio/deno.json";
const PACOTES = ["zod", "@supabase/supabase-js"] as const;

type DenoJson = { imports: Record<string, string> };

/** Versão pedida no especificador `npm:pacote@versao` do deno.json. */
function versaoPedida(
  imports: Record<string, string>,
  pacote: string
): string | undefined {
  const prefixo = `npm:${pacote}@`;
  const especificador = imports[pacote];
  return especificador?.startsWith(prefixo)
    ? especificador.slice(prefixo.length)
    : undefined;
}

function versaoInstalada(pacote: string): string {
  const texto = readFileSync(`node_modules/${pacote}/package.json`, "utf8");
  return (JSON.parse(texto) as { version: string }).version;
}

function mensagem(
  pacote: string,
  pedida: string | undefined,
  instalada: string
): string {
  return [
    `O deno.json pede ${pacote}@${pedida ?? "(nada)"}, mas o node_modules tem ${instalada}.`,
    `Alinhe ${CAMINHO_DENO_JSON} ao instalado ("npm:${pacote}@${instalada}"):`,
    "o schema do envelope roda no Node e no Deno e precisa da mesma versão nas duas pontas.",
  ].join(" ");
}

describe("versões do Node e do Deno na recepção", () => {
  const { imports } = JSON.parse(
    readFileSync(CAMINHO_DENO_JSON, "utf8")
  ) as DenoJson;

  it.each(PACOTES)("o deno.json pede o %s que está instalado", (pacote) => {
    const pedida = versaoPedida(imports, pacote);
    const instalada = versaoInstalada(pacote);
    expect(pedida, mensagem(pacote, pedida, instalada)).toBe(instalada);
  });

  it("o leitor acha a versão em pacote comum e em pacote com escopo", () => {
    const amostra = {
      zod: "npm:zod@4.6.7",
      "@supabase/supabase-js": "npm:@supabase/supabase-js@2.117.3",
      outro: "jsr:@std/path@1.0.0",
    };
    expect(versaoPedida(amostra, "zod")).toBe("4.6.7");
    expect(versaoPedida(amostra, "@supabase/supabase-js")).toBe("2.117.3");
    expect(versaoPedida(amostra, "outro")).toBeUndefined();
    expect(versaoPedida(amostra, "ausente")).toBeUndefined();
  });
});
