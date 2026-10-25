// @vitest-environment node
import { createHash } from "node:crypto";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  lerReservasSecretas,
  medirIngestao,
  validarTokenDaReserva,
} from "../../scripts/desempenho/medir-ingestao.ts";
import {
  type ClienteIngestao,
  RESERVAS_INGESTAO,
} from "../../scripts/desempenho/preparar-ingestao.ts";
import * as dadosScc from "../helpers/supabase-local.ts";

function ambiente(
  opcoes: {
    falharChamada?: number;
    respostaInvalida?: unknown;
    corromperChamada?: number;
    corromper?: (estado: Linha[]) => void;
    foraDaReserva?: boolean;
    marcador?: boolean;
    cron?: boolean;
    token?: boolean;
    reserva?: boolean;
    status?: number;
    textoResposta?: string;
    erroRede?: Error;
    duracoes?: Map<number, number>;
  } = {}
) {
  const estados = new Map<string, Linha[]>();
  const eventos: string[] = [];
  const envios: Array<{ quantidade: number; primeiro: number | undefined }> =
    [];
  let chamadas = 0;
  let ativos = 0;
  let maximoAtivos = 0;
  let tempo = 0;
  const cliente: ClienteIngestao = {
    connect: async () => {
      eventos.push("conectar");
    },
    end: async () => {
      eventos.push("fechar");
    },
    query: async <T extends Record<string, unknown>>(
      sql: string,
      valores?: readonly string[]
    ) => {
      tempo += 100; // Validar/preparar não deve entrar na duração HTTP.
      let rows: Record<string, unknown>[] = [];
      if (sql.includes("benchmark_isolation_guard")) {
        eventos.push("marcador");
        rows =
          opcoes.marcador === false
            ? []
            : [{ marcador: "repply-food-perf-20261025-55422" }];
      } else if (sql.includes("cron.job")) {
        eventos.push("cron");
        rows = [{ ativos: opcoes.cron === false ? "1" : "0" }];
      } else if (sql.includes("public.tokens_envio")) {
        eventos.push("token");
        rows = [{ valido: opcoes.token !== false }];
      } else if (sql.includes("public.restaurantes")) {
        eventos.push("reserva");
        rows = [{ valida: opcoes.reserva !== false }];
      } else if (sql.startsWith("update public.sinal_de_vida")) {
        eventos.push("pacing");
        return { rows: [], rowCount: chamadas === 0 ? 0 : 1 };
      } else if (sql.includes("from public.entradas")) {
        eventos.push("estado");
        rows = structuredClone(estados.get(valores?.[0] ?? "") ?? []);
        if (opcoes.foraDaReserva) rows.push({ cod_entrada: "1" });
      } else throw new Error("SQL inesperado ou escrita proibida");
      return { rows: rows as T[], rowCount: rows.length };
    },
  };
  const reservas = RESERVAS_INGESTAO.map((reserva) => ({
    ...reserva,
    token: `rf_teste_${reserva.quantidade}`,
  }));
  const fetcher: typeof fetch = async (_url, init) => {
    eventos.push("http");
    ativos++;
    maximoAtivos = Math.max(ativos, maximoAtivos);
    chamadas++;
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeDefined();
    await Promise.resolve();
    ativos--;
    if (chamadas === opcoes.falharChamada)
      throw (
        opcoes.erroRede ?? new Error("SEGREDO token payload SQL credencial")
      );
    const token = new Headers(init?.headers).get("authorization");
    const reserva = reservas.find((item) => `Bearer ${item.token}` === token);
    if (!reserva) throw new Error("Token incorreto");
    const corpo = JSON.parse(String(init?.body)) as {
      lote: { numero: number; total: number };
      entradas: Array<{
        codEntrada: number;
        ValorItens: number;
        ValorConsumido: number;
      }>;
    };
    expect(corpo.lote).toEqual({ numero: 1, total: 1 });
    const primeiroCodigo = { 10: 9_100_000, 500: 14_000_000, 2000: 29_000_000 }[
      reserva.quantidade
    ];
    expect(
      corpo.entradas.every(
        (item) =>
          item.codEntrada >= primeiroCodigo &&
          item.codEntrada < primeiroCodigo + reserva.quantidade
      )
    ).toBe(true);
    envios.push({
      quantidade: corpo.entradas.length,
      primeiro: corpo.entradas[0]?.ValorItens,
    });
    const anterior = estados.get(reserva.restauranteId) ?? [];
    const anteriores = new Map(
      anterior.map((linha) => [linha.cod_entrada, linha])
    );
    const codigosRecebidos = new Set(
      corpo.entradas.map((item) => String(item.codEntrada))
    );
    const atuais: Linha[] = [];
    let gravadas = 0;
    let inalteradas = 0;
    let removidas = 0;
    for (const item of corpo.entradas) {
      const hash = createHash("md5").update(JSON.stringify(item)).digest("hex");
      const previa = anteriores.get(String(item.codEntrada));
      if (previa?.hash_origem === hash) inalteradas++;
      else gravadas++;
      atuais.push({
        cod_entrada: String(item.codEntrada),
        valor_itens: `${item.ValorItens}.00`,
        valor_consumido: `${item.ValorConsumido}.00`,
        removida_em: null,
        hash_origem: hash,
        demais: "campos originais",
        restante_valido: true,
      });
    }
    for (const previa of anterior) {
      if (!codigosRecebidos.has(previa.cod_entrada)) {
        if (!previa.removida_em) removidas++;
        atuais.push({ ...previa, removida_em: "2026-10-25T00:00:00Z" });
      }
    }
    if (chamadas === opcoes.corromperChamada) opcoes.corromper?.(atuais);
    estados.set(reserva.restauranteId, atuais);
    tempo += opcoes.duracoes?.get(chamadas) ?? 7;
    return new Response(
      opcoes.textoResposta ??
        JSON.stringify(
          opcoes.respostaInvalida ?? {
            ok: true,
            recebidas: corpo.entradas.length,
            gravadas,
            inalteradas,
            removidas,
            janela_confirmada: { desde: "2026-10-09", ate: "2026-10-10" },
            proximo_envio_em_segundos: 300,
          }
        ),
      { status: opcoes.status ?? 200 }
    );
  };
  return {
    estados,
    eventos,
    envios,
    reservas,
    maximoAtivos: () => maximoAtivos,
    executar: (extras = {}) =>
      medirIngestao({
        httpUrl: "http://127.0.0.1:55421",
        dbUrl: "postgresql://postgres:postgres@127.0.0.1:55422/postgres",
        reservas,
        criarCliente: () => cliente,
        fetcher,
        relogio: () => tempo,
        ...extras,
      }),
  };
}

type Linha = {
  cod_entrada: string;
  valor_itens: string;
  valor_consumido: string;
  removida_em: string | null;
  hash_origem: string;
  demais: string;
  restante_valido: boolean;
};

describe("série SCC isolada", () => {
  it("recusa token revogado ou expirado mesmo quando o hash pertence à casa", async () => {
    const query = async (sql: string, valores: string[]) => {
      expect(valores).toEqual([
        "casa-reservada",
        "slug-reservado",
        createHash("sha256").update("token-local").digest("hex"),
      ]);
      // Simula a fronteira SQL: sem ambos os predicados, o token inativo passa.
      return {
        rows: [
          {
            valido: !(
              /revogado_em is null/.test(sql) && /expira_em > now\(\)/.test(sql)
            ),
          },
        ],
      };
    };
    await expect(
      validarTokenDaReserva(
        query,
        "token-local",
        "casa-reservada",
        "slug-reservado"
      )
    ).rejects.toThrow(/token/i);
  });

  it("encadeia preparo + 5 aquecimentos + 30 ciclos medidos por tamanho sem sobreposição", async () => {
    const a = ambiente();
    const resultado = await a.executar();
    expect(resultado.completa).toBe(true);
    expect(a.maximoAtivos()).toBe(1);
    expect(a.eventos.slice(0, 6)).toEqual([
      "conectar",
      "marcador",
      "cron",
      "reserva",
      "token",
      "estado",
    ]);
    expect(a.eventos.at(-1)).toBe("fechar");
    expect(a.envios).toHaveLength(423);
    expect(a.envios.slice(0, 9)).toEqual([
      { quantidade: 10, primeiro: 100 },
      { quantidade: 10, primeiro: 100 },
      { quantidade: 10, primeiro: 101 },
      { quantidade: 9, primeiro: 100 },
      { quantidade: 10, primeiro: 100 },
      { quantidade: 10, primeiro: 100 },
      { quantidade: 10, primeiro: 101 },
      { quantidade: 9, primeiro: 100 },
      { quantidade: 10, primeiro: 100 },
    ]);
    for (const tamanho of resultado.resultados) {
      expect(tamanho.chamadasHttp).toBe(141);
      expect(
        tamanho.tentativas.filter((item) => item.fase === "preparo")
      ).toHaveLength(1);
      for (const caso of tamanho.casos) {
        expect(caso.duracoesBrutas).toEqual(Array(30).fill(7));
        expect(caso).toMatchObject({
          p50: 7,
          p95: 7,
          dispersaoMs: 0,
          erros: 0,
        });
      }
      expect(
        tamanho.tentativas.every(
          (item) =>
            item.status === 200 &&
            item.bytesEnviados > 0 &&
            (item.bytesRecebidos ?? 0) > 0
        )
      ).toBe(true);
      expect(
        tamanho.tentativas.filter((item) => item.caso === "reaparecimento")[0]
          ?.contagens
      ).toMatchObject({
        gravadas: 1,
        inalteradas: tamanho.quantidade - 1,
        removidas: 0,
      });
    }
    expect(JSON.stringify(resultado)).not.toMatch(
      /rf_teste|campos originais|hash_origem/
    );
  });

  it("preserva amostras válidas e status ausente em falha de rede, abortando escalas seguintes", async () => {
    const a = ambiente({ falharChamada: 23 });
    const resultado = await a.executar();
    expect(resultado.completa).toBe(false);
    expect(resultado.resultados).toHaveLength(1);
    const parcial = resultado.resultados[0];
    expect(parcial?.chamadasHttp).toBe(23);
    expect(parcial?.casos[0]?.duracoesBrutas).toEqual([7]);
    expect(parcial?.casos[1]?.duracoesBrutas).toEqual([]);
    expect(parcial?.casos[1]?.p95).toBeNull();
    expect(parcial?.falha).toMatchObject({
      fase: "medicao",
      ciclo: 1,
      caso: "alteracao",
      etapa: "http",
    });
    expect(parcial?.tentativas.at(-1)).toMatchObject({
      status: null,
      bytesRecebidos: null,
      valida: false,
    });
    expect(JSON.stringify(resultado)).not.toContain("SEGREDO");
  });

  it.each([
    {},
    [],
    { ok: false },
    {
      ok: true,
      recebidas: 10,
      gravadas: 0,
      inalteradas: 10,
      removidas: 0,
      janela_confirmada: { desde: "2026-10-09", ate: "2026-10-10" },
      proximo_envio_em_segundos: 300,
    },
  ])(
    "recusa resposta 200 sem contrato/contagens reais no preparo: %j",
    async (respostaInvalida) => {
      const resultado = await ambiente({ respostaInvalida }).executar();
      expect(resultado.completa).toBe(false);
      expect(resultado.resultados[0]?.falha?.etapa).toBe("resposta");
      expect(resultado.resultados[0]?.casos[0]?.p50).toBeNull();
    }
  );

  it.each([
    (linhas: Linha[]) => {
      if (linhas[1]) linhas[1].valor_consumido = "111.00";
    },
    (linhas: Linha[]) => {
      if (linhas[1]) linhas[1].hash_origem = "f".repeat(32);
    },
    (linhas: Linha[]) => {
      if (linhas[1]) linhas[1].removida_em = "2026-10-25";
    },
    (linhas: Linha[]) => {
      if (linhas[0]) linhas[0].hash_origem = "";
    },
    (linhas: Linha[]) => {
      if (linhas[0]) linhas[0].cod_entrada = "1";
    },
    (linhas: Linha[]) => {
      linhas.pop();
    },
    (linhas: Linha[]) => {
      if (linhas[1]) linhas[1].demais = "outro dado";
    },
  ])(
    "não amostra caso que mudou códigos/valores/hashes/remoção indevidos",
    async (corromper) => {
      const resultado = await ambiente({
        corromperChamada: 3,
        corromper,
      }).executar();
      expect(resultado.completa).toBe(false);
      expect(resultado.resultados[0]?.falha).toMatchObject({
        caso: "alteracao",
        etapa: "estado",
      });
      expect(resultado.resultados[0]?.chamadasHttp).toBe(3);
    }
  );

  it.each(["marcador", "cron", "token", "reserva"] as const)(
    "bloqueia antes de POST/pacing quando %s falha",
    async (guarda) => {
      const a = ambiente({ [guarda]: false });
      const resultado = await a.executar();
      expect(resultado.completa).toBe(false);
      expect(a.eventos).not.toContain("pacing");
      expect(a.eventos).not.toContain("http");
    }
  );

  it("não acessa banco nem HTTP para ID/slug inventados ou endpoint compartilhado", async () => {
    const a = ambiente();
    await expect(
      a.executar({
        reservas: a.reservas.map((r) => ({
          ...r,
          restauranteId: "casa-leitura",
        })),
      })
    ).rejects.toThrow(/reserva/i);
    await expect(
      a.executar({ httpUrl: "http://127.0.0.1:54321" })
    ).rejects.toThrow();
    expect(a.eventos).toEqual([]);
  });

  it("bloqueia reserva já usada com qualquer código estranho antes de escrever", async () => {
    const a = ambiente({ foraDaReserva: true });
    const resultado = await a.executar();
    expect(resultado.completa).toBe(false);
    expect(a.eventos).not.toContain("pacing");
    expect(a.eventos).not.toContain("http");
  });

  it("reaplica em reserva própria usada sem reset SQL e sem chamar preparo de inserção fria", async () => {
    const a = ambiente();
    expect((await a.executar()).completa).toBe(true);
    const repeticao = await a.executar();
    expect(repeticao.completa).toBe(true);
    expect(repeticao.resultados[0]?.tentativas[0]).toMatchObject({
      fase: "preparo",
      contagens: { gravadas: 0, inalteradas: 10 },
    });
  });

  it.each([4, 5, 6])(
    "recusa estado incorreto na remoção/reaparecimento/próximo idêntico (POST %s)",
    async (corromperChamada) => {
      const a = ambiente({
        corromperChamada,
        corromper: (linhas) => {
          const primeira = linhas.find(
            (linha) => linha.cod_entrada === "9100000"
          );
          if (primeira) {
            primeira.valor_itens = "101.00";
            primeira.valor_consumido = "111.00";
            primeira.hash_origem = "f".repeat(32);
            primeira.removida_em = null;
          }
        },
      });
      const resultado = await a.executar();
      expect(resultado.completa).toBe(false);
      expect(resultado.resultados[0]?.falha?.etapa).toBe("estado");
      expect(resultado.resultados[0]?.chamadasHttp).toBe(corromperChamada);
    }
  );

  it("preserva status/bytes do HTTP recusado e não usa sua duração nos percentis", async () => {
    const resultado = await ambiente({
      status: 429,
      textoResposta: '{"ok":false}',
    }).executar();
    expect(resultado.resultados[0]?.tentativas[0]).toMatchObject({
      status: 429,
      bytesRecebidos: 12,
      duracaoMs: 7,
      valida: false,
    });
    expect(resultado.resultados[0]?.chamadasHttp).toBe(1);
    expect(
      resultado.resultados[0]?.casos.every((caso) => caso.p95 === null)
    ).toBe(true);
  });

  it("registra timeout separadamente sem status nem duração válida inventados", async () => {
    const a = ambiente({
      falharChamada: 2,
      erroRede: new DOMException("segredo", "TimeoutError"),
    });
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      const resultado = await a.executar();
      expect(resultado.resultados[0]?.tentativas.at(-1)).toMatchObject({
        timeout: true,
        status: null,
        valida: false,
      });
      expect(resultado.resultados[0]?.falha?.tipo).toBe("timeout");
      expect(resultado.resultados[0]?.casos[0]?.duracoesBrutas).toEqual([]);
      expect(timeout).toHaveBeenCalledWith(20_000);
      expect(a.envios).toHaveLength(1);
    } finally {
      timeout.mockRestore();
    }
  });

  it("calcula nearest-rank e amplitude somente de amostras medidas válidas", async () => {
    const duracoes = new Map(
      Array.from({ length: 30 }, (_, i) => [22 + i * 4, i + 1])
    );
    const resultado = await ambiente({ duracoes }).executar();
    expect(resultado.resultados[0]?.casos[0]).toMatchObject({
      p50: 15,
      p95: 29,
      dispersaoMs: 29,
      duracoesBrutas: Array.from({ length: 30 }, (_, i) => i + 1),
    });
  });

  it("recusa JSON inválido sem imprimir a resposta", async () => {
    const resultado = await ambiente({ textoResposta: "SEGREDO" }).executar();
    expect(resultado.resultados[0]?.falha?.etapa).toBe("resposta");
    expect(JSON.stringify(resultado)).not.toContain("SEGREDO");
  });

  it("barra envelope original acima de 2 MB antes de pacing/POST, sem fragmentar janela", async () => {
    const original = dadosScc.entrada;
    const spy = vi
      .spyOn(dadosScc, "entrada")
      .mockImplementation((codigo) => ({
        ...original(codigo),
        TipoOcupacao: "x".repeat(220_000),
      }));
    try {
      const a = ambiente();
      const resultado = await a.executar();
      expect(resultado.resultados[0]?.falha?.etapa).toBe("envelope");
      expect(a.eventos).not.toContain("http");
      expect(a.eventos).not.toContain("pacing");
    } finally {
      spy.mockRestore();
    }
  });

  it.each([
    "http://2130706433:55421",
    "http://127.1:55421",
    "http://127.0.0.1:55421/?segredo=x",
  ])("recusa API que não seja raiz com IP literal: %s", async (httpUrl) => {
    const a = ambiente();
    await expect(a.executar({ httpUrl })).rejects.toThrow();
    expect(a.eventos).toEqual([]);
  });

  it.each([
    "postgresql://postgres:postgres@2130706433:55422/postgres",
    "postgresql://postgres:postgres@127.1:55422/postgres",
  ])("recusa host do banco normalizado que não é IP literal", async (dbUrl) => {
    const a = ambiente();
    await expect(a.executar({ dbUrl })).rejects.toThrow();
    expect(a.eventos).toEqual([]);
  });

  it("lê JSON secreto ignorado 0600 só em memória e recusa arquivo exposto ou symlink", async () => {
    const diretorio = await mkdtemp(".superpowers/ingestao-leitura-teste-");
    const caminho = join(diretorio, "acessos.local.json");
    const a = ambiente();
    try {
      await writeFile(caminho, JSON.stringify({ reservas: a.reservas }), {
        mode: 0o600,
      });
      expect(await lerReservasSecretas(caminho)).toEqual(a.reservas);
      await chmod(caminho, 0o644);
      await expect(lerReservasSecretas(caminho)).rejects.toThrow(
        /configuração/i
      );
      await chmod(caminho, 0o600);
      await symlink("acessos.local.json", join(diretorio, "atalho.json"));
      await expect(
        lerReservasSecretas(join(diretorio, "atalho.json"))
      ).rejects.toThrow(/configuração/i);
      await expect(lerReservasSecretas("package.json")).rejects.toThrow(
        /configuração/i
      );
      await expect(
        lerReservasSecretas(join(diretorio, "..", "..", "package.json"))
      ).rejects.toThrow(/configuração/i);
      await writeFile(caminho, "segredo sem formato");
      await expect(lerReservasSecretas(caminho)).rejects.toThrow(
        /^Configuração secreta de ingestão inválida\.$/
      );
    } finally {
      await rm(diretorio, { recursive: true, force: true });
    }
  });
});
