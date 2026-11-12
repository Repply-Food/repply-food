// @vitest-environment node
import { randomUUID } from "node:crypto";
import { createClient as criarCliente } from "@supabase/supabase-js";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  COFRE_DOS_ANEXOS,
  type CofreDoMentor,
  type FichasDoMentor,
  LOTE_REMOCAO,
  apurarOrfaos,
  confirmarApagar,
  criarCofreReal,
  criarFichasReais,
  lerConfig,
  limparOrfaos,
} from "../../scripts/limpar-arquivos-orfaos-mentor";
import type { Database } from "../../types/database.types";
import { URL_LOCAL, chaveLocal } from "../helpers/chaves-locais";
import { conectarBanco } from "../helpers/supabase-local";

// A varredura de órfãos do mentor (Fase 4, tarefa 5): o cofre `mentor-anexos`
// só perde a ficha em alguns caminhos (a faxina aposenta a ficha de 12 meses
// sem tocar no arquivo; apagar a casa leva as fichas em cascata, também sem
// tocar no arquivo; e um tombo entre o `move` e o `update` do vínculo deixa o
// arquivo novo sem ficha). O que sobra no cofre sem ficha é órfão, e este
// script apaga — em dry-run por padrão, só contra o banco local.

function cofreDublado(arquivos: string[]): CofreDoMentor & {
  removidos: string[];
} {
  const removidos: string[] = [];
  return {
    removidos,
    listarCaminhos: async () => [...arquivos],
    remover: async (caminhos: string[]) => {
      removidos.push(...caminhos);
    },
  };
}

function fichasDubladas(vinculados: string[]): FichasDoMentor {
  return {
    caminhosRegistrados: async () => new Set(vinculados),
  };
}

describe("apurarOrfaos (cofre dublado)", () => {
  it("lista só o arquivo sem ficha, nunca o vinculado", async () => {
    const cofre = cofreDublado([
      "pendente/solta.pdf",
      "casa-1/conversa-1/ficha-1-cardapio.pdf",
    ]);
    const fichas = fichasDubladas(["casa-1/conversa-1/ficha-1-cardapio.pdf"]);

    const orfaos = await apurarOrfaos(cofre, fichas);

    expect(orfaos).toEqual(["pendente/solta.pdf"]);
  });

  it("cofre vazio não tem órfão", async () => {
    expect(await apurarOrfaos(cofreDublado([]), fichasDubladas([]))).toEqual(
      []
    );
  });

  it("tudo vinculado não tem órfão", async () => {
    const cofre = cofreDublado(["a.pdf"]);
    expect(await apurarOrfaos(cofre, fichasDubladas(["a.pdf"]))).toEqual([]);
  });
});

describe("limparOrfaos (cofre dublado)", () => {
  it("dry-run lista o órfão sem apagar nada", async () => {
    const cofre = cofreDublado(["orfao.pdf", "vinculado.pdf"]);
    const fichas = fichasDubladas(["vinculado.pdf"]);

    const resultado = await limparOrfaos(cofre, fichas, { executar: false });

    expect(resultado.orfaos).toEqual(["orfao.pdf"]);
    expect(resultado.apagados).toBe(0);
    expect(cofre.removidos).toEqual([]);
  });

  it("com --executar apaga só o órfão, nunca o vinculado", async () => {
    const cofre = cofreDublado(["orfao.pdf", "vinculado.pdf"]);
    const fichas = fichasDubladas(["vinculado.pdf"]);

    const resultado = await limparOrfaos(cofre, fichas, { executar: true });

    expect(resultado.orfaos).toEqual(["orfao.pdf"]);
    expect(resultado.apagados).toBe(1);
    expect(cofre.removidos).toEqual(["orfao.pdf"]);
  });

  it("sem órfão não chama o cofre nem para apagar", async () => {
    const remover = vi.fn(async (_caminhos: string[]) => {});
    const cofre: CofreDoMentor = {
      listarCaminhos: async () => ["vinculado.pdf"],
      remover,
    };

    const resultado = await limparOrfaos(
      cofre,
      fichasDubladas(["vinculado.pdf"]),
      {
        executar: true,
      }
    );

    expect(resultado).toEqual({ orfaos: [], apagados: 0 });
    expect(remover).not.toHaveBeenCalled();
  });
  it("o cofre real apaga em lotes (não estoura a requisição)", async () => {
    const lotes: string[][] = [];
    const falsoBanco = {
      storage: {
        from: (balde: string) => {
          expect(balde).toBe(COFRE_DOS_ANEXOS);
          return {
            list: async () => ({ data: [], error: null }),
            remove: async (caminhos: string[]) => {
              lotes.push(caminhos);
              return { data: [], error: null };
            },
          };
        },
      },
    } as unknown as Parameters<typeof criarCofreReal>[0];
    const cofre = criarCofreReal(falsoBanco);
    const orfaos = Array.from(
      { length: LOTE_REMOCAO * 2 + 3 },
      (_, i) => `orfao-${i}.pdf`
    );

    await cofre.remover(orfaos);

    expect(lotes).toHaveLength(3);
    expect(lotes.map((lote) => lote.length)).toEqual([
      LOTE_REMOCAO,
      LOTE_REMOCAO,
      3,
    ]);
    expect(lotes.flat().sort()).toEqual([...orfaos].sort());
  });
});

describe("lerConfig (travas local x produção)", () => {
  const chave = "chave-de-servico-ficticia";
  const ambienteLocal = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SERVICE_ROLE_KEY: chave,
  };
  const ambienteNuvem = {
    SUPABASE_URL: "https://projeto.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: chave,
  };

  it("dry-run é o padrão (sem flag não apaga), no banco local", () => {
    expect(lerConfig([], ambienteLocal)).toEqual({
      executar: false,
      producao: false,
      url: ambienteLocal.SUPABASE_URL,
      chave,
    });
  });

  it("dry-run na nuvem também só lista (não recusa, não apaga)", () => {
    expect(lerConfig([], ambienteNuvem)).toEqual({
      executar: false,
      producao: false,
      url: ambienteNuvem.SUPABASE_URL,
      chave,
    });
  });

  it("--executar libera o apagar no banco local", () => {
    expect(lerConfig(["--executar"], ambienteLocal).executar).toBe(true);
  });

  it("--executar na nuvem sem --producao é recusado", () => {
    expect(() => lerConfig(["--executar"], ambienteNuvem)).toThrow(
      "--producao"
    );
  });

  it("--producao no banco local é recusado (lá é --executar)", () => {
    expect(() => lerConfig(["--producao"], ambienteLocal)).toThrow(
      "--producao"
    );
  });

  it("--producao na nuvem libera o apagar (a confirmação vem no main)", () => {
    expect(lerConfig(["--producao"], ambienteNuvem)).toEqual({
      executar: true,
      producao: true,
      url: ambienteNuvem.SUPABASE_URL,
      chave,
    });
  });

  it("recusa sem a chave de serviço (local e produção)", () => {
    expect(() =>
      lerConfig([], { SUPABASE_URL: "http://127.0.0.1:54321" })
    ).toThrow("SUPABASE_SERVICE_ROLE_KEY");
    expect(() => lerConfig(["--producao"], {})).toThrow(
      "SUPABASE_SERVICE_ROLE_KEY"
    );
  });
});

describe("confirmarApagar (a trava do --producao)", () => {
  it("só a palavra exata libera", () => {
    expect(confirmarApagar("APAGAR")).toBe(true);
  });

  it("qualquer outra coisa recusa", () => {
    expect(confirmarApagar("apagar")).toBe(false);
    expect(confirmarApagar(" APAGAR")).toBe(false);
    expect(confirmarApagar("APAGAR ")).toBe(false);
    expect(confirmarApagar("")).toBe(false);
    expect(confirmarApagar(undefined)).toBe(false);
  });
});

describe("caso real no banco local (1 vinculado + 1 órfão)", () => {
  const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
  const sufixo = randomUUID().slice(0, 8);
  const servico = criarCliente<Database>(
    URL_LOCAL,
    chaveLocal("service_role"),
    opcoes
  );

  let banco: Client;
  let casa = "";
  const prefixo = `varredura-${sufixo}`;
  const caminhoVinculado = `${prefixo}/vinculado.pdf`;
  const caminhoOrfao = `${prefixo}/orfao.pdf`;

  beforeAll(async () => {
    banco = await conectarBanco();
    const casaNova = await banco.query<{ id: string }>(
      `insert into public.restaurantes (slug, nome)
        values ($1, 'Casa da varredura') returning id`,
      [`varredura-${sufixo}`]
    );
    casa = casaNova.rows[0]?.id ?? "";
    const vinculado = new Uint8Array([1, 2, 3]);
    const solto = new Uint8Array([4, 5, 6]);
    const subidaVinculada = await servico.storage
      .from(COFRE_DOS_ANEXOS)
      .upload(caminhoVinculado, vinculado, { contentType: "application/pdf" });
    if (subidaVinculada.error) throw new Error("não subiu o vinculado");
    const subidaOrfa = await servico.storage
      .from(COFRE_DOS_ANEXOS)
      .upload(caminhoOrfao, solto, { contentType: "application/pdf" });
    if (subidaOrfa.error) throw new Error("não subiu o órfão");
    const ficha = await servico.from("mentor_anexos").insert({
      restaurante_id: casa,
      conversa_id: null,
      nome_original: "vinculado.pdf",
      tipo: "pdf",
      tamanho_bytes: vinculado.length,
      caminho: caminhoVinculado,
    });
    if (ficha.error) throw new Error("não gravou a ficha do vinculado");
  });

  afterAll(async () => {
    try {
      if (!banco) return;
      await servico.storage
        .from(COFRE_DOS_ANEXOS)
        .remove([caminhoVinculado, caminhoOrfao]);
      // A ficha sai em cascata junto com a casa.
      await banco.query("delete from public.restaurantes where id = $1", [
        casa,
      ]);
    } finally {
      await banco?.end();
    }
  });

  it("apura o órfão de verdade sem tocar no vinculado", async () => {
    const orfaos = await apurarOrfaos(
      criarCofreReal(servico),
      criarFichasReais(servico)
    );

    expect(orfaos).toContain(caminhoOrfao);
    expect(orfaos).not.toContain(caminhoVinculado);
  });
});
